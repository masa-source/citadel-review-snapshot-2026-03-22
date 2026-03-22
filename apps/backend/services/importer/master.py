"""
マスタ一括インポート: _upsert_master_by_id と各マスタテーブル用 _import_*。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

from schemas import DatabaseInput

from ._utils import (
    IdMap,
    _id_for_master,
    _resolve,
    _schema_to_model_dict,
)


async def _upsert_master_by_id(
    session: AsyncSession,
    data: DatabaseInput,
    id_map: IdMap,
    counts: dict[str, int],
    table_name: str,
    model_class: type[SQLModel],
    items_attr: str,
    parent_resolvers: list[tuple[str, str]] | None = None,
) -> None:
    """ID を SSOT とするマスタの UPSERT。存在すれば UPDATE、なければ INSERT。一括取得・バルク処理で N+1 を避ける。"""
    raw_items = getattr(data, items_attr, None) or []
    items = raw_items
    id_map[table_name] = {}
    if not items:
        return

    # 親解決（いずれか None の item はスキップ）
    if parent_resolvers:
        with_parents: list[tuple[Any, dict[str, Any]]] = []
        for item in items:
            parent_vals = {}
            skip = False
            for parent_table, parent_attr in parent_resolvers:
                pid = _resolve(id_map, parent_table, getattr(item, parent_attr))
                parent_vals[parent_attr] = pid
                if pid is None:
                    skip = True
                    break
            if not skip:
                with_parents.append((item, parent_vals))
    else:
        with_parents = [(item, {}) for item in items]

    # 同一ペイロード内の ID 重複排除: 2 件目以降は uuid4() で再採番
    seen_inp_ids: set[uuid.UUID | None] = set()
    resolved_with_parents: list[tuple[Any, uuid.UUID, dict[str, Any]]] = []
    for item, parent_vals in with_parents:
        inp_id = getattr(item, "id", None)
        if inp_id is not None and inp_id in seen_inp_ids:
            row_id = uuid.uuid4()
        else:
            row_id = _id_for_master(inp_id)
        seen_inp_ids.add(inp_id)
        if inp_id is not None and inp_id not in id_map.get(table_name, {}):
            id_map[table_name][inp_id] = row_id
        resolved_with_parents.append((item, row_id, parent_vals))

    if not resolved_with_parents:
        await session.flush()
        return

    row_ids = [r[1] for r in resolved_with_parents]

    # 一括存在確認（id IN (...)
    r = await session.execute(select(model_class.id).where(model_class.id.in_(row_ids)))
    existing_ids = {row[0] for row in r.all()}

    to_update: list[dict[str, Any]] = []
    to_insert: list[dict[str, Any]] = []

    for item, row_id, parent_vals in resolved_with_parents:
        payload = _schema_to_model_dict(item, model_class)
        payload["id"] = row_id
        payload.update(parent_vals)

        if row_id in existing_ids:
            to_update.append(payload)
        else:
            to_insert.append(payload)

    if to_update:
        await session.run_sync(
            lambda sync_sess, m=model_class, u=to_update: (
                sync_sess.bulk_update_mappings(m, u)
            )
        )
    if to_insert:
        await session.run_sync(
            lambda sync_sess, m=model_class, u=to_insert: (
                sync_sess.bulk_insert_mappings(m, u)
            )
        )
    counts[table_name] = counts.get(table_name, 0) + len(to_update) + len(to_insert)
    await session.flush()
