"""
カスタム条件（ExportRequest）に基づくエクスポート。
"""

from __future__ import annotations

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
from schemas import ExportRequest

from ._master_queries import fetch_master
from ._serialize import extract_report_relations


async def export_custom_data(
    session: AsyncSession, criteria: ExportRequest
) -> dict[str, Any]:
    """
    カスタム条件に基づいてデータをエクスポート。
    - マスタ: フラグがTrueのテーブルのみ全件取得
    - レポート: target_report_idsに含まれるもののみ（関連データ含む）
    - IDは常に維持（Scout側でインポート時に再採番を選択可能）
    """
    companies: list[dict] = []
    if criteria.include_companies:
        companies = await fetch_master(session, Company)

    workers: list[dict] = []
    if criteria.include_workers:
        workers = await fetch_master(session, Worker)

    instruments: list[dict] = []
    if criteria.include_instruments:
        instruments = await fetch_master(session, Instrument)

    schema_definitions: list[dict] = []
    if criteria.include_schema_definitions:
        schema_definitions = await fetch_master(session, SchemaDefinition)

    sites: list[dict] = []
    if criteria.include_sites:
        sites = await fetch_master(session, Site)

    parts: list[dict] = []
    if criteria.include_parts:
        parts = await fetch_master(session, Part)

    owned_instruments: list[dict] = []
    if criteria.include_owned_instruments:
        owned_instruments = await fetch_master(session, OwnedInstrument)

    table_definitions: list[dict] = []
    if criteria.include_table_definitions:
        table_definitions = await fetch_master(session, TableDefinition)

    report_formats: list[dict] = []
    if criteria.include_report_formats:
        report_formats = await fetch_master(session, ReportFormat)

    if criteria.target_report_ids:
        result = await session.execute(
            select(Report)
            .where(Report.id.in_(criteria.target_report_ids))
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
        relations = await extract_report_relations(session, report_objs)
    else:
        relations = {
            "reports": [],
            "reportSites": [],
            "reportClients": [],
            "reportWorkers": [],
            "targetInstruments": [],
            "targetInstrumentTables": [],
            "usedParts": [],
            "reportOwnedInstruments": [],
        }

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
    }
