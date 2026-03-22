"""任務 API ルーター（一覧・ハートビート・除名・状態取得）。"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from error_codes import PURGED
from schemas import MissionHeartbeatRequest
from services.mission_service import (
    list_missions as service_list_missions,
)
from services.mission_service import (
    mission_get_status,
)
from services.mission_service import (
    mission_heartbeat as service_heartbeat,
)
from services.mission_service import (
    mission_purge as service_purge,
)

router = APIRouter(prefix="/api", tags=["missions"])


@router.get("/missions")
async def list_missions(
    status: str | None = Query(
        None, description="Active / Expired / Purged / Returned"
    ),
    session: AsyncSession = Depends(get_session),
):
    """派遣中の任務一覧（管理画面用）。status 指定時はその状態の任務のみ。"""
    return await service_list_missions(session, status=status)


@router.post("/missions/{mission_id}/heartbeat")
async def mission_heartbeat(
    mission_id: UUID,
    data: MissionHeartbeatRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    任務のハートビート。Scout が「生存している」と報告する。
    利用停止/期限切れの場合は 403 と code: PURGED を返す。
    """
    result, error = await service_heartbeat(
        session, mission_id, device_id=data.device_id
    )
    if error == "NOT_FOUND":
        raise HTTPException(status_code=404, detail="この任務が見つかりません。")
    if error == "PURGED":
        return JSONResponse(
            status_code=403,
            content={
                "code": PURGED,
                "message": "この端末は利用停止されました。退避データを生成して初期化してください。",
            },
        )
    return result


@router.post("/missions/{mission_id}/purge")
async def mission_purge(
    mission_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """任務を利用停止（Purge）する。派遣名簿から削除し、該当 Scout は次回同期で 403 を受ける。"""
    ok = await service_purge(session, mission_id)
    if not ok:
        raise HTTPException(status_code=404, detail="この任務が見つかりません。")
    return {"ok": True, "message": "任務を利用停止しました。"}


@router.get("/missions/{mission_id}/status")
async def mission_status(
    mission_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """任務の状態を取得（Admin のファイルインポート時など）。"""
    out = await mission_get_status(session, mission_id)
    if out is None:
        raise HTTPException(status_code=404, detail="この任務が見つかりません。")
    return out
