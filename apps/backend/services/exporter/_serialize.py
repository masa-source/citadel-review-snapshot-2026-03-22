"""
SQLModel リストを camelCase 辞書リストに変換するヘルパ。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Report, UsedPart
from utils.serialization import model_to_export_dict


def _model_list_to_export_dicts(
    objs: list[Any], exclude: set[str] | None = None
) -> list[dict[str, Any]]:
    """SQLModel のリストを camelCase 辞書のリストに変換（model_dump ベース）。"""
    return [model_to_export_dict(o, exclude=exclude) for o in objs]


REPORT_RELATION_ATTRS = {
    "report_sites": "reportSites",
    "report_clients": "reportClients",
    "report_workers": "reportWorkers",
    "target_instruments": "targetInstruments",
    "target_instrument_tables": "targetInstrumentTables",
    "report_owned_instruments": "reportOwnedInstruments",
}


async def extract_report_relations(
    session: AsyncSession, report_objs: list[Report]
) -> dict[str, list[dict[str, Any]]]:
    """レポートオブジェクトのリストから、関連テーブルを含むエクスポート用辞書を抽出する。"""
    result: dict[str, list[dict[str, Any]]] = {
        "reports": [],
        "usedParts": [],
    }
    for export_key in REPORT_RELATION_ATTRS.values():
        result[export_key] = []

    for report in report_objs:
        result["reports"].append(model_to_export_dict(report))

        for rel_attr, export_key in REPORT_RELATION_ATTRS.items():
            items = getattr(report, rel_attr, [])
            for item in sorted(
                items, key=lambda x: getattr(x, "sort_order", None) or 0
            ):
                result[export_key].append(model_to_export_dict(item))

        up_result = await session.execute(
            select(UsedPart).where(UsedPart.report_id == report.id)
        )
        for up in sorted(
            up_result.scalars().all(), key=lambda x: getattr(x, "sort_order", None) or 0
        ):
            result["usedParts"].append(model_to_export_dict(up))

    return result
