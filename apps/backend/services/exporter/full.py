"""
DB 全データを db.json 形式でエクスポート。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.sync_meta import SYNC_TABLES
from utils.serialization import to_camel

from ._master_queries import fetch_master
from ._serialize import _model_list_to_export_dicts


async def export_db_to_dict(session: AsyncSession) -> dict[str, Any]:
    """
    DB の全データを db.json 形式 (camelCase) の辞書として返す。
    SYNC_TABLES に定義された順序で取得を行う。
    """
    result_dict: dict[str, Any] = {}

    for config in SYNC_TABLES:
        camel_key = to_camel(config.table_name)
        if config.is_master:
            data = await fetch_master(session, config.model_class)
            result_dict[camel_key] = data
        else:
            result = await session.execute(select(config.model_class))
            data = _model_list_to_export_dicts(result.scalars().all())
            result_dict[camel_key] = data

    return result_dict
