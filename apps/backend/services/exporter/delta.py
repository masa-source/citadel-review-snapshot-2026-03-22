"""
差分同期: 指定日時以降に更新されたレポートとその関連データのエクスポート。
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import (
    Company,
    Instrument,
    OwnedInstrument,
    Part,
    Report,
    ReportFormat,
    SchemaDefinition,
    Site,
    TableDefinition,
    Worker,
)

from ._master_queries import fetch_master
from ._serialize import extract_report_relations

logger = logging.getLogger(__name__)


async def export_delta_data(
    session: AsyncSession,
    since: datetime,
    include_master: bool = False,
) -> dict[str, Any]:
    """
    差分同期: 指定日時以降に更新されたレポートとその関連データをエクスポート。

    Args:
        session: データベースセッション
        since: この日時以降に更新されたデータを取得
        include_master: マスタデータも含めるかどうか

    Returns:
        差分データの辞書（db.json形式）
    """
    logger.info(
        "Delta sync: 取得対象 since=%s, include_master=%s", since, include_master
    )

    companies: list[dict] = []
    workers: list[dict] = []
    instruments: list[dict] = []
    schema_definitions: list[dict] = []
    sites: list[dict] = []
    parts: list[dict] = []
    owned_instruments: list[dict] = []
    table_definitions: list[dict] = []
    report_formats: list[dict] = []

    if include_master:
        companies = await fetch_master(session, Company)
        workers = await fetch_master(session, Worker)
        instruments = await fetch_master(session, Instrument)
        schema_definitions = await fetch_master(session, SchemaDefinition)
        sites = await fetch_master(session, Site)
        parts = await fetch_master(session, Part)
        owned_instruments = await fetch_master(session, OwnedInstrument)
        table_definitions = await fetch_master(session, TableDefinition)
        report_formats = await fetch_master(session, ReportFormat)

    result = await session.execute(
        select(Report)
        .where(Report.updated_at >= since)
        .options(
            selectinload(Report.report_sites),
            selectinload(Report.report_clients),
            selectinload(Report.report_workers),
            selectinload(Report.target_instruments),
            selectinload(Report.target_instrument_tables),
            selectinload(Report.report_owned_instruments),
        )
    )
    report_objs = result.scalars().all()
    logger.info("Delta sync: %d件のレポートを取得", len(report_objs))

    relations = await extract_report_relations(session, report_objs)

    return {
        "companies": companies,
        "workers": workers,
        "instruments": instruments,
        "schemaDefinitions": schema_definitions,
        "sites": sites,
        "parts": parts,
        "ownedInstruments": owned_instruments,
        "tableDefinitions": table_definitions,
        "reportFormats": report_formats,
        **relations,
        "_meta": {
            "syncType": "delta",
            "since": since.isoformat(),
            "syncedAt": datetime.utcnow().isoformat(),
            "reportCount": len(relations["reports"]),
        },
    }
