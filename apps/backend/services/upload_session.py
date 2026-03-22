"""
アップロードセッションの一時保存と読み出し。
output_temp/upload_sessions/{sessionId}/ に meta.json と chunk_{seq}.json を保存する。
"""

from __future__ import annotations

import json
import logging
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

from services.sync_meta import SYNC_TABLES
from utils.paths import get_output_temp_dir
from utils.serialization import to_camel

logger = logging.getLogger(__name__)


# フロントの getImportOrder() と一致するテーブル順（camelCase）
# _ 繋がりの table_name を camelCase に変換して取得する
EXPECTED_ORDER: list[str] = [to_camel(t.table_name) for t in SYNC_TABLES]

DEFAULT_SESSION_TTL_MINUTES = 30


def _get_base_dir(base_path: Path | None = None) -> Path:
    if base_path is None:
        return (get_output_temp_dir() / "upload_sessions").resolve()
    return (base_path / "output_temp" / "upload_sessions").resolve()


def get_session_dir(session_id: str | UUID, base_path: Path | None = None) -> Path:
    """セッション用ディレクトリの Path を返す。作成はしない。"""
    return _get_base_dir(base_path) / str(session_id)


def create_session(
    session_id: str | UUID,
    mode: str,
    *,
    base_path: Path | None = None,
    ttl_minutes: int = DEFAULT_SESSION_TTL_MINUTES,
) -> tuple[Path, str]:
    """
    セッション用ディレクトリを作成し、meta.json を書き込む。
    Returns:
        (session_dir, expires_at_iso)
    """
    session_dir = get_session_dir(session_id, base_path)
    session_dir.mkdir(parents=True, exist_ok=True)
    expires_at = datetime.now(UTC) + timedelta(minutes=ttl_minutes)
    expires_at_iso = expires_at.isoformat()
    meta = {
        "mode": mode,
        "expiresAt": expires_at_iso,
        "expectedOrder": EXPECTED_ORDER,
        "lastReceivedSequenceIndex": -1,
    }
    meta_path = session_dir / "meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return session_dir, expires_at_iso


def load_session_meta(
    session_id: str | UUID, base_path: Path | None = None
) -> dict | None:
    """meta.json を読み込む。セッションが存在しないか壊れていれば None。"""
    session_dir = get_session_dir(session_id, base_path)
    meta_path = session_dir / "meta.json"
    if not meta_path.exists():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Upload session meta read failed %s: %s", session_id, e)
        return None


def is_session_expired(expires_at_iso: str) -> bool:
    """expiresAt の ISO 文字列が現在時刻を過ぎていれば True。"""
    try:
        # タイムゾーン付きでパース。Z の場合は UTC
        if expires_at_iso.endswith("Z"):
            expires_at_iso = expires_at_iso[:-1] + "+00:00"
        expires = datetime.fromisoformat(expires_at_iso)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        return datetime.now(UTC) >= expires
    except (ValueError, TypeError):
        return True


def save_chunk(
    session_id: str | UUID,
    sequence_index: int,
    table: str,
    rows: list,
    *,
    base_path: Path | None = None,
) -> None:
    """
    チャンクを chunk_{sequence_index:03d}.json として保存する。
    同一 sequence_index の再送は上書き（冪等）。
    """
    session_dir = get_session_dir(session_id, base_path)
    if not session_dir.exists():
        raise FileNotFoundError(f"Session directory not found: {session_dir}")
    chunk_path = session_dir / f"chunk_{sequence_index:03d}.json"
    payload = {"table": table, "rows": rows}
    chunk_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    meta = load_session_meta(session_id, base_path)
    if meta is not None:
        meta["lastReceivedSequenceIndex"] = max(
            meta.get("lastReceivedSequenceIndex", -1), sequence_index
        )
        (session_dir / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False), encoding="utf-8"
        )


def get_received_sequence_indices(
    session_id: str | UUID, base_path: Path | None = None
) -> list[int]:
    """保存済みチャンクの sequenceIndex 一覧を昇順で返す。"""
    session_dir = get_session_dir(session_id, base_path)
    if not session_dir.exists():
        return []
    indices = []
    for p in session_dir.glob("chunk_*.json"):
        try:
            num = int(p.stem.replace("chunk_", ""))
            indices.append(num)
        except ValueError:
            continue
    return sorted(indices)


def load_all_chunks(
    session_id: str | UUID, base_path: Path | None = None
) -> dict[str, list]:
    """
    全チャンクを expectedOrder の順で読み込み、テーブル名をキーとした dict にマージする。
    各キーの値は list（rows を extend したもの）。
    """
    meta = load_session_meta(session_id, base_path)
    if meta is None:
        raise FileNotFoundError(f"Session not found or invalid: {session_id}")
    expected_order = meta.get("expectedOrder", EXPECTED_ORDER)
    session_dir = get_session_dir(session_id, base_path)
    merged: dict[str, list] = {k: [] for k in expected_order}
    for seq in range(len(expected_order)):
        chunk_path = session_dir / f"chunk_{seq:03d}.json"
        if not chunk_path.exists():
            raise ValueError(f"Missing chunk for sequenceIndex {seq}")
        chunk_data = json.loads(chunk_path.read_text(encoding="utf-8"))
        table = chunk_data.get("table")
        rows = chunk_data.get("rows", [])
        if table not in merged:
            merged[table] = []
        merged[table].extend(rows)
    return merged


def delete_session(session_id: str | UUID, base_path: Path | None = None) -> None:
    """セッションディレクトリを再帰的に削除する。"""
    session_dir = get_session_dir(session_id, base_path)
    if session_dir.exists():
        shutil.rmtree(session_dir)
        logger.info("Deleted upload session: %s", session_id)


def cleanup_expired_upload_sessions(base_path: Path | None = None) -> int:
    """
    upload_sessions 内の有効期限切れセッションを削除する。
    Returns: 削除したセッション数
    """
    base = _get_base_dir(base_path)
    if not base.exists():
        return 0
    cleaned = 0
    for session_dir in list(base.iterdir()):
        if not session_dir.is_dir():
            continue
        meta_path = session_dir / "meta.json"
        if not meta_path.exists():
            try:
                shutil.rmtree(session_dir)
                cleaned += 1
            except Exception as e:
                logger.warning("Failed to remove session dir %s: %s", session_dir, e)
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            expires_at_iso = meta.get("expiresAt")
            if not expires_at_iso:
                continue
            if is_session_expired(expires_at_iso):
                try:
                    shutil.rmtree(session_dir)
                    cleaned += 1
                    logger.info("Cleaned expired upload session: %s", session_dir.name)
                except (PermissionError, OSError) as e:
                    logger.warning(
                        "Failed to remove expired session dir %s: %s",
                        session_dir,
                        e,
                    )
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Cleanup read meta %s: %s", session_dir, e)
    return cleaned
