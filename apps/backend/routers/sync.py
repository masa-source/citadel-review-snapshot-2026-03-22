"""データ同期 API（upload / delta / download / export / stage / handoff）。"""

import json
import logging
import uuid
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session_maker, get_session
from error_codes import PURGED
from models import Mission, MissionStatus
from schemas import (
    DatabaseInput,
    ExportRequest,
    UploadBeginRequest,
    UploadChunkRequest,
    UploadCommitRequest,
)
from services.exporter import export_custom_data, export_db_to_dict, export_delta_data
from services.exporter.stream import (
    export_db_to_ndjson_stream,
    export_delta_ndjson_stream,
)
from services.importer import run_import
from services.mission_service import _format_datetime_iso, create_handoff_mission
from services.upload_session import (
    EXPECTED_ORDER,
    create_session,
    delete_session,
    get_received_sequence_indices,
    is_session_expired,
    load_all_chunks,
    load_session_meta,
    save_chunk,
)
from utils.date_utils import parse_iso_to_utc_naive
from utils.paths import get_output_temp_dir

# --- チャンクアップロード用リクエストモデル（schemas.py へ移動済み） ---


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["sync"])

# ステージングディレクトリ（main と同一パス）
STAGING_DIR = get_output_temp_dir() / "staging"
STAGING_DIR.mkdir(parents=True, exist_ok=True)

MISSION_LIFETIME_HOURS = 24


@router.post("/sync/upload")
async def upload_data(
    data: DatabaseInput,
    mode: Literal["copy", "overwrite"] = Query(
        "copy",
        description="copy: 新規保存（ID再採番）。overwrite: 同一IDのレポートを上書き。",
    ),
    session: AsyncSession = Depends(get_session),
):
    """
    db.json 形式の JSON を受け取り、PostgreSQL に保存する。
    body に _mission が含まれる場合、任務状態を確認し Purged/Expired なら 403 を返す。
    mode=copy（デフォルト）: レポートは新規UUIDで保存。mode=overwrite: 入力のidが既存なら削除後に同一IDで再登録。
    1 回のリクエストは 1 トランザクション。失敗時はロールバック。
    """
    try:
        payload = data.model_dump()
        mission_meta = payload.pop("mission", None)

        if mission_meta and mission_meta.get("missionId"):
            mission_id_str = mission_meta.get("missionId")
            try:
                mission_uuid = UUID(mission_id_str)
            except (ValueError, TypeError):
                mission_uuid = None
            if mission_uuid:
                result = await session.execute(
                    select(Mission).where(Mission.mission_id == mission_uuid).limit(1)
                )
                row = result.scalar_one_or_none()
                print(
                    f"DEBUG API: session_id={id(session)}, mission_id={mission_uuid}, status={row.status if row else 'None'}",
                    flush=True,
                )
                if row and row.status in (
                    MissionStatus.PURGED.value,
                    MissionStatus.EXPIRED.value,
                ):
                    return JSONResponse(
                        status_code=403,
                        content={
                            "code": PURGED,
                            "message": "この端末は利用停止されました。退避データを生成して初期化してください。",
                        },
                    )
                if row:
                    row.status = MissionStatus.RETURNED.value
                    await session.commit()

        data_for_import = DatabaseInput.model_validate(payload)
        overwrite = mode.strip().lower() == "overwrite"
        counts = await run_import(session, data_for_import, overwrite=overwrite)
        total = sum(counts.values())
        return {
            "ok": True,
            "message": f"{total} 件を保存しました。",
            "counts": counts,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("sync/upload エラー: %s", e)
        raise HTTPException(
            status_code=500, detail=f"インポートに失敗しました: {e!s}"
        ) from e


# --- チャンクアップロード（Begin / Chunk / Commit / Status） ---


@router.post("/sync/upload/begin")
async def upload_begin(
    body: UploadBeginRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    アップロードセッションを開始する。sessionId と expectedOrder を返す。
    _mission が渡され且つ Purged/Expired の場合は 403 を返す。
    """
    mission_meta = body.mission_meta
    if mission_meta and mission_meta.get("missionId"):
        try:
            mission_uuid = UUID(mission_meta["missionId"])
        except (ValueError, TypeError, KeyError):
            mission_uuid = None
        if mission_uuid:
            result = await session.execute(
                select(Mission).where(Mission.mission_id == mission_uuid).limit(1)
            )
            row = result.scalar_one_or_none()
            if row and row.status in (
                MissionStatus.PURGED.value,
                MissionStatus.EXPIRED.value,
            ):
                return JSONResponse(
                    status_code=403,
                    content={
                        "code": PURGED,
                        "message": "あなたは除名されました。遺言を生成して自害してください。",
                    },
                )
            if row:
                row.status = MissionStatus.RETURNED.value
                await session.commit()

    session_id = uuid.uuid4()
    try:
        _, expires_at_iso = create_session(str(session_id), body.mode)
    except Exception as e:
        logger.exception("upload/begin create_session: %s", e)
        raise HTTPException(
            status_code=500, detail=f"セッションの作成に失敗しました: {e!s}"
        ) from e
    return {
        "sessionId": str(session_id),
        "expiresAt": expires_at_iso,
        "expectedOrder": EXPECTED_ORDER,
    }


@router.post("/sync/upload/chunk")
async def upload_chunk(body: UploadChunkRequest):
    """
    セッションにチャンクを保存する。sequenceIndex は 0 始まりで順番に送ること。
    同一 sequenceIndex の再送は冪等（上書き保存）。
    """
    session_id = body.session_id
    meta = load_session_meta(session_id)
    if meta is None:
        raise HTTPException(
            status_code=404,
            detail="セッションが見つかりません。有効期限切れの可能性があります。",
        )
    if is_session_expired(meta.get("expiresAt", "")):
        raise HTTPException(
            status_code=410,
            detail="セッションの有効期限が切れています。Begin からやり直してください。",
        )
    expected_order = meta.get("expectedOrder", EXPECTED_ORDER)
    last_received = meta.get("lastReceivedSequenceIndex", -1)
    next_expected = last_received + 1
    seq = body.sequence_index
    if seq > next_expected:
        raise HTTPException(
            status_code=400,
            detail=f"順序違反です。次に送るべき sequenceIndex は {next_expected} です。",
        )
    if body.table not in expected_order:
        raise HTTPException(
            status_code=400,
            detail=f"不正なテーブル名です: {body.table}",
        )
    try:
        save_chunk(session_id, seq, body.table, body.rows)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        logger.exception("upload/chunk save: %s", e)
        raise HTTPException(
            status_code=500, detail=f"チャンクの保存に失敗しました: {e!s}"
        ) from e
    return {"ok": True, "receivedSequenceIndex": seq}


@router.post("/sync/upload/commit")
async def upload_commit(
    body: UploadCommitRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    全チャンクを結合して run_import を実行し、成功時にセッションを削除する。
    """
    session_id = body.session_id
    meta = load_session_meta(session_id)
    if meta is None:
        raise HTTPException(
            status_code=404,
            detail="セッションが見つかりません。有効期限切れの可能性があります。",
        )
    if is_session_expired(meta.get("expiresAt", "")):
        raise HTTPException(
            status_code=410,
            detail="セッションの有効期限が切れています。Begin からやり直してください。",
        )
    mode = meta.get("mode", "copy")
    overwrite = mode.strip().lower() == "overwrite"
    try:
        merged = load_all_chunks(session_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except FileNotFoundError:
        raise HTTPException(
            status_code=404, detail="セッションが見つかりません。"
        ) from None

    try:
        data_for_import = DatabaseInput.model_validate(merged)
    except Exception as e:
        logger.warning("upload/commit validate: %s", e)
        raise HTTPException(
            status_code=400, detail=f"データの検証に失敗しました: {e!s}"
        ) from e

    try:
        counts = await run_import(session, data_for_import, overwrite=overwrite)
        total = sum(counts.values())
        delete_session(session_id)
        return {
            "ok": True,
            "message": f"{total} 件を保存しました。",
            "counts": counts,
        }
    except Exception as e:
        logger.exception("upload/commit run_import: %s", e)
        try:
            delete_session(session_id)
        except Exception as delete_err:
            logger.warning("セッション削除（失敗時）に失敗しました: %s", delete_err)
        raise HTTPException(
            status_code=500, detail=f"インポートに失敗しました: {e!s}"
        ) from e


@router.get("/sync/upload/sessions/{session_id}/status")
async def upload_session_status(session_id: str):
    """
    セッションの受信状況を返す。レジューム時に「次に送るべき sequenceIndex」の判定に利用。
    """
    meta = load_session_meta(session_id)
    if meta is None:
        raise HTTPException(
            status_code=404,
            detail="セッションが見つかりません。有効期限切れの可能性があります。",
        )
    if is_session_expired(meta.get("expiresAt", "")):
        raise HTTPException(
            status_code=410,
            detail="セッションの有効期限が切れています。Begin からやり直してください。",
        )
    received = get_received_sequence_indices(session_id)
    return {
        "sessionId": session_id,
        "receivedSequenceIndices": received,
        "expectedOrder": meta.get("expectedOrder", EXPECTED_ORDER),
        "expiresAt": meta.get("expiresAt"),
    }


@router.get("/sync/delta")
async def delta_sync(
    since: str = Query(
        ..., description="ISO 8601形式の日時（例: 2024-01-01T00:00:00Z）"
    ),
    include_master: bool = Query(False, description="マスタデータも含めるか"),
    session: AsyncSession = Depends(get_session),
):
    """
    差分同期: 指定日時以降に更新されたレポートとその関連データを取得。

    - since: この日時以降に更新されたデータを取得（ISO 8601形式）
    - include_master: Trueの場合、マスタデータも全件含める

    レスポンスには `_meta` フィールドが含まれ、同期情報を提供します。
    """
    try:
        since_dt = parse_iso_to_utc_naive(since)
        data = await export_delta_data(session, since_dt, include_master)

        return JSONResponse(content=data)
    except ValueError as e:
        logger.warning("Delta sync: 日時パースエラー: %s", e)
        raise HTTPException(
            status_code=400,
            detail=f"日時の形式が不正です。ISO 8601形式で指定してください（例: 2024-01-01T00:00:00Z）: {e!s}",
        ) from e
    except Exception as e:
        logger.exception("Delta sync エラー: %s", e)
        raise HTTPException(
            status_code=500, detail=f"差分同期に失敗しました: {e!s}"
        ) from e


@router.get("/sync/download")
async def download_sync_data(
    session: AsyncSession = Depends(get_session),
):
    """
    全データを db.json 形式でエクスポートし、JSON ファイルとしてダウンロードさせる。
    Scout (現場アプリ) へのデータ同期用。
    """
    try:
        from io import BytesIO

        data = await export_db_to_dict(session)
        json_str = json.dumps(data, ensure_ascii=False, indent=2)
        json_bytes = json_str.encode("utf-8")

        return StreamingResponse(
            BytesIO(json_bytes),
            media_type="application/json",
            headers={
                "Content-Disposition": "attachment; filename=master_data.json",
            },
        )
    except Exception as e:
        logger.exception("データエクスポートエラー: %s", e)
        raise HTTPException(
            status_code=500, detail=f"データのエクスポートに失敗しました: {e!s}"
        ) from e


@router.get("/sync/download/stream")
async def download_sync_data_stream():
    """
    全データを NDJSON 形式でストリーミング配信する。
    各行は {"table": "テーブル名", "rows": [...]}。メモリを抑えた真のストリーミング。
    ストリーム完了までセッションを保持するため、Depends(get_session) は使わず
    イテレータ内で async_session_maker によりセッションを開く。
    """

    async def iter_bytes():
        async with async_session_maker() as session:
            async for line in export_db_to_ndjson_stream(session):
                yield line.encode("utf-8")

    return StreamingResponse(
        iter_bytes(),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": "attachment; filename=master_data.ndjson",
        },
    )


@router.get("/sync/delta/stream")
async def delta_sync_stream(
    since: str = Query(
        ..., description="ISO 8601形式の日時（例: 2024-01-01T00:00:00Z）"
    ),
    include_master: bool = Query(False, description="マスタデータも含めるか"),
):
    """
    差分同期を NDJSON でストリーミング配信する。
    各行は {"table": "テーブル名", "rows": [...]}。最後に type: "meta" の行で reportCount 等を送る。
    """
    try:
        since_dt = parse_iso_to_utc_naive(since)
    except ValueError as e:
        logger.warning("Delta stream: 日時パースエラー: %s", e)
        raise HTTPException(
            status_code=400,
            detail=f"日時の形式が不正です。ISO 8601形式で指定してください: {e!s}",
        ) from e

    async def iter_bytes():
        async with async_session_maker() as session:
            async for line in export_delta_ndjson_stream(
                session, since_dt, include_master
            ):
                yield line.encode("utf-8")

    return StreamingResponse(
        iter_bytes(),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": "attachment; filename=delta_sync.ndjson",
        },
    )


@router.post("/sync/export")
async def export_custom_sync_data(
    criteria: ExportRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    カスタム条件でデータをエクスポートし、JSON ファイルとしてダウンロードさせる。
    - マスタ: 選択されたテーブルのみ出力
    - レポート: 指定IDのレポートのみ出力
    - モード: edit（ID維持）or copy（IDクリア）
    """
    try:
        from io import BytesIO

        data = await export_custom_data(session, criteria)
        json_str = json.dumps(data, ensure_ascii=False, indent=2)
        json_bytes = json_str.encode("utf-8")

        filename = "report_package.json"
        if criteria.export_mode == "copy":
            filename = "report_template.json"

        return StreamingResponse(
            BytesIO(json_bytes),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
            },
        )
    except Exception as e:
        logger.exception("カスタムエクスポートエラー: %s", e)
        raise HTTPException(
            status_code=500, detail=f"カスタムエクスポートに失敗しました: {e!s}"
        ) from e


@router.post("/sync/stage")
async def stage_data(data: DatabaseInput):
    """
    Scout への直接転送用にデータを一時保存する。
    ユニークな ticket_id を発行して返す。
    """
    try:
        ticket_id = str(uuid.uuid4())
        staging_file = STAGING_DIR / f"{ticket_id}.json"

        json_str = json.dumps(
            data.model_dump(mode="json"), ensure_ascii=False, indent=2
        )
        staging_file.write_text(json_str, encoding="utf-8")

        logger.info("Staged data with ticket_id: %s", ticket_id)
        return {"ok": True, "ticketId": ticket_id}
    except Exception as e:
        logger.exception("ステージングエラー: %s", e)
        raise HTTPException(
            status_code=500, detail=f"データのステージングに失敗しました: {e!s}"
        ) from e


@router.post("/sync/handoff")
async def direct_handoff(
    criteria: ExportRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Direct Handoff: エクスポートとステージングを一度に行う。
    Admin → Scout への直接転送用。任務（Mission + MissionReport）を発行し、_mission メタデータを付与する。
    """
    try:
        mission_id, now, expires_at, permission = await create_handoff_mission(
            session, criteria
        )

        data = await export_custom_data(session, criteria)

        logger.info(
            "Direct handoff export data: companies=%d, workers=%d, instruments=%d, reports=%d",
            len(data.get("companies", [])),
            len(data.get("workers", [])),
            len(data.get("instruments", [])),
            len(data.get("reports", [])),
        )

        data["_mission"] = {
            "missionId": str(mission_id),
            "permission": permission,
            "issuedAt": _format_datetime_iso(now),
            "expiresAt": _format_datetime_iso(expires_at),
        }

        ticket_id = str(uuid.uuid4())
        staging_file = STAGING_DIR / f"{ticket_id}.json"
        json_str = json.dumps(data, ensure_ascii=False, indent=2)
        staging_file.write_text(json_str, encoding="utf-8")

        logger.info(
            "Direct handoff staged with ticket_id: %s, mission_id: %s",
            ticket_id,
            mission_id,
        )
        return {"ok": True, "ticketId": ticket_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Direct handoff エラー: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Direct handoffに失敗しました: {e!s}"
        ) from e


@router.get("/sync/stage/{ticket_id}")
async def get_staged_data(ticket_id: str):
    """
    ステージングされたデータを取得する。
    取得後、ファイルは削除される（ワンタイム）。
    """
    staging_file = STAGING_DIR / f"{ticket_id}.json"

    if not staging_file.exists():
        raise HTTPException(
            status_code=404,
            detail="指定されたチケットIDのデータが見つかりません。有効期限が切れたか、既に取得済みの可能性があります。",
        )

    try:
        json_str = staging_file.read_text(encoding="utf-8")
        data = json.loads(json_str)

        staging_file.unlink(missing_ok=True)
        logger.info("Retrieved and deleted staged data: %s", ticket_id)

        return data
    except Exception as e:
        logger.exception("ステージデータ取得エラー: %s", e)
        raise HTTPException(
            status_code=500, detail=f"データの取得に失敗しました: {e!s}"
        ) from e
