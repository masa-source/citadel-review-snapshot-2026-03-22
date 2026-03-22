"""
マスタテーブル全件取得の共通ヘルパ。full / custom / delta から利用。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ._serialize import _model_list_to_export_dicts


async def fetch_master(
    session: AsyncSession, model_class: type[Any]
) -> list[dict[str, Any]]:
    """指定されたマスタテーブルの全件を取得し、エクスポート用の辞書リストを返す。"""
    result = await session.execute(select(model_class))
    return _model_list_to_export_dicts(result.scalars().all())
