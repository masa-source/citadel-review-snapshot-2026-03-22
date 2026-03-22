"""
1 トランザクションで db.json 形式データを DB に保存するオーケストレーター。
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from schemas import DatabaseInput
from services.sync_meta import SYNC_TABLES

from ._utils import IdMap
from .master import _upsert_master_by_id
from .transaction import (
    _import_child_entities,
    _import_reports,
    _repack_sort_orders_after_import,
)


async def run_import(
    session: AsyncSession, data: DatabaseInput, *, overwrite: bool = False
) -> dict[str, int]:
    """
    1 トランザクションで data を DB に保存する。
    戻り値: テーブルごとの保存件数。
    マスタ一括 → レポート一括 → 子テーブル一括 → sort_order 詰め直し。
    """
    counts: dict[str, int] = {}
    id_map: IdMap = {}

    for config in SYNC_TABLES:
        if config.is_master:
            await _upsert_master_by_id(
                session,
                data,
                id_map,
                counts,
                config.table_name,
                config.model_class,
                config.items_attr,
                parent_resolvers=config.parent_resolvers,
            )
        elif config.table_name == "reports":
            await _import_reports(session, data, id_map, overwrite, counts)
        else:
            await _import_child_entities(
                session=session,
                items=getattr(data, config.items_attr, None) or [],
                model=config.model_class,
                id_map=id_map,
                overwrite=overwrite,
                counts=counts,
                count_key=config.table_name,
                fk_mappings=config.fk_mappings or {},
                role_key_prefix=config.role_key_prefix,
                extra_fields_extractor=config.extra_fields_extractor,
                sort_order_attr=config.sort_order_attr,
                id_map_key=config.id_map_key,
            )

    await _repack_sort_orders_after_import(session, id_map)
    return counts
