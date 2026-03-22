"""
レポートおよび子テーブル一括インポートと sort_order 詰め直し。
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Callable
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Report,
    ReportClient,
    ReportFormat,
    ReportSite,
    ReportWorker,
    TargetInstrument,
    TargetInstrumentTable,
    UsedPart,
)
from schemas import DatabaseInput
from services.report_api_service import delete_report_cascade_logic

from ._utils import IdMap, _id_for_import, _resolve, _schema_to_model_dict


async def _import_reports(
    session: AsyncSession,
    data: DatabaseInput,
    id_map: IdMap,
    overwrite: bool,
    counts: dict[str, int],
) -> None:
    items = data.reports or []
    id_map["reports"] = {}
    if not items:
        return
    for r_in in items:
        if overwrite and r_in.id is not None:
            existing = await session.execute(
                select(Report).where(Report.id == r_in.id).limit(1)
            )
            if existing.scalar_one_or_none() is not None:
                await delete_report_cascade_logic(session, r_in.id)
    to_add: list[tuple[Any, Report]] = []
    for r_in in items:
        company_id = _resolve(id_map, "companies", r_in.company_id)
        report_id = None
        if overwrite and r_in.id is not None:
            report_id = r_in.id
        report_payload = _schema_to_model_dict(r_in, Report)
        report_payload["company_id"] = company_id
        report_payload["schema_id"] = _resolve(
            id_map, "schema_definitions", r_in.schema_id
        )
        # ReportFormat 正規化後のレポート種別（Report.report_format_id）を入力スキーマからマッピング。
        # まずはスキーマ→モデル変換で入った値を一旦取り除き、存在確認を通った ID のみ反映する。
        if "report_format_id" in report_payload:
            report_payload.pop("report_format_id")
        incoming_format_id = getattr(r_in, "report_format_id", None)
        if incoming_format_id is not None:
            existing_format = await session.get(ReportFormat, incoming_format_id)
            if existing_format is not None:
                report_payload["report_format_id"] = incoming_format_id
        if report_payload.get("custom_data") is None:
            report_payload["custom_data"] = {}
        report_payload["created_at"] = (
            datetime.fromisoformat(str(r_in.created_at))
            if r_in.created_at
            else datetime.utcnow()
        )
        report_payload["updated_at"] = datetime.utcnow()
        if report_id is not None:
            report = Report(id=report_id, **report_payload)
        else:
            report = Report(**report_payload)
        to_add.append((r_in.id, report))
    for _, report in to_add:
        session.add(report)
    await session.flush()
    for inp_id, report in to_add:
        if report.id is not None and inp_id is not None:
            id_map["reports"][inp_id] = report.id
        counts["reports"] = counts.get("reports", 0) + 1


async def _import_child_entities(
    session: AsyncSession,
    items: list[Any],
    model: Any,
    id_map: IdMap,
    overwrite: bool,
    counts: dict[str, int],
    count_key: str,
    fk_mappings: dict[str, str],
    role_key_prefix: str | None = None,
    extra_fields_extractor: Callable[[Any, dict], dict] | None = None,
    sort_order_attr: str = "sort_order",
    id_map_key: str | None = None,
) -> None:
    if not items:
        return
    if id_map_key and id_map_key not in id_map:
        id_map[id_map_key] = {}

    role_count: dict = defaultdict(int)
    to_insert = []

    for idx, item in enumerate(items):
        report_id = _resolve(id_map, "reports", getattr(item, "report_id", None))
        if report_id is None:
            continue

        record = {
            "id": _id_for_import(item.id, overwrite),
            "report_id": report_id,
        }

        # Resolve foreign keys
        for attr, resource_type in fk_mappings.items():
            record[attr] = _resolve(id_map, resource_type, getattr(item, attr, None))

        # Handle sort_order
        sort_order = getattr(item, sort_order_attr, None)
        if sort_order is None:
            sort_order = idx
        record[sort_order_attr] = sort_order

        # Handle role_key if applicable
        if hasattr(item, "role_key") and role_key_prefix:
            role_count[report_id] += 1
            role_key = getattr(item, "role_key", None)
            if not role_key:
                role_key = f"{role_key_prefix}_{role_count[report_id]}"
            record["role_key"] = role_key

        # Extra fields specific to the entity
        if extra_fields_extractor:
            extra = extra_fields_extractor(item, role_count.get(report_id, 0))
            record.update(extra)

        to_insert.append(record)

        # Populate id_map if requested
        if id_map_key and item.id is not None:
            id_map[id_map_key][item.id] = record["id"]

        counts[count_key] = counts.get(count_key, 0) + 1

    if to_insert:
        await session.run_sync(
            lambda sync_sess: sync_sess.bulk_insert_mappings(model, to_insert)
        )
    await session.flush()


async def _repack_sort_orders_after_import(
    session: AsyncSession, id_map: IdMap
) -> None:
    """
    インポート後、同一親内で sort_order を 0, 1, 2, ... に詰め直す。
    一括 SELECT → メモリで並べ替え → bulk_update_mappings。
    """
    report_ids = list(id_map.get("reports", {}).values())
    if not report_ids:
        return
    for model, order_attr in [
        (ReportSite, "sort_order"),
        (ReportClient, "sort_order"),
        (ReportWorker, "sort_order"),
        (TargetInstrument, "sort_order"),
        (UsedPart, "sort_order"),
    ]:
        r = await session.execute(select(model).where(model.report_id.in_(report_ids)))
        rows = list(r.scalars().all())
        rows.sort(
            key=lambda x: (x.report_id or uuid.UUID(int=0), getattr(x, order_attr) or 0)
        )
        if not rows:
            continue
        updates = [{"id": row.id, order_attr: i} for i, row in enumerate(rows)]
        await session.run_sync(
            lambda sync_sess, m=model, u=updates: sync_sess.bulk_update_mappings(m, u)
        )

    # TargetInstrumentTable: 親キーが target_instrument_id のため別ループ
    ti_ids = list(id_map.get("target_instruments", {}).values())
    if ti_ids:
        r = await session.execute(
            select(TargetInstrumentTable).where(
                TargetInstrumentTable.target_instrument_id.in_(ti_ids)
            )
        )
        rows = list(r.scalars().all())
        rows.sort(
            key=lambda x: (
                x.target_instrument_id or uuid.UUID(int=0),
                x.sort_order or 0,
            )
        )
        if rows:
            updates = [{"id": row.id, "sort_order": i} for i, row in enumerate(rows)]
            await session.run_sync(
                lambda sync_sess, u=updates: sync_sess.bulk_update_mappings(
                    TargetInstrumentTable, u
                )
            )

    await session.flush()
