"""デモデータ API ルーター（投入・削除・状態取得）。"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from services.demo_data import clear_demo_data, get_demo_status, seed_demo_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["demo"])


@router.post("/demo/seed")
async def seed_demo(session: AsyncSession = Depends(get_session)):
    """
    デモデータを投入する。
    既存のデモデータがある場合は先に削除してから投入。
    """
    try:
        result = await seed_demo_data(session)
        logger.info("Demo data seeded: %s", result.get("counts"))
        return result
    except Exception as e:
        logger.exception("Demo seed error: %s", e)
        raise HTTPException(
            status_code=500, detail=f"デモデータの投入に失敗しました: {e!s}"
        ) from e


@router.delete("/demo/clear")
async def clear_demo(session: AsyncSession = Depends(get_session)):
    """
    デモデータを削除する。
    [DEMO] プレフィックスを持つデータのみ削除。
    """
    try:
        result = await clear_demo_data(session)
        logger.info("Demo data cleared: %s", result.get("counts"))
        return result
    except Exception as e:
        logger.exception("Demo clear error: %s", e)
        raise HTTPException(
            status_code=500, detail=f"デモデータの削除に失敗しました: {e!s}"
        ) from e


@router.get("/demo/status")
async def demo_status(session: AsyncSession = Depends(get_session)):
    """デモデータの状態を取得する。"""
    try:
        return await get_demo_status(session)
    except Exception as e:
        logger.exception("Demo status error: %s", e)
        raise HTTPException(
            status_code=500, detail=f"デモデータの状態取得に失敗しました: {e!s}"
        ) from e
