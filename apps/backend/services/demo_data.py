"""
デモデータの定義と操作ロジック。
デモデータは data/demo_data.json（db.json 形式）を読み込み、run_import で投入する。
[DEMO] プレフィックスで識別し、本番データと分離する。
"""

import json
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Company,
    Instrument,
    MissionReport,
    OwnedInstrument,
    Part,
    Report,
    ReportClient,
    ReportOwnedInstrument,
    ReportSite,
    ReportWorker,
    SchemaDefinition,
    Site,
    TableDefinition,
    TargetInstrument,
    TargetInstrumentTable,
    UsedPart,
    Worker,
)
from schemas import DatabaseInput
from services.importer import run_import

# デモデータ識別用プレフィックス（clear_demo_data / get_demo_status で使用）
# スキーマの name 禁止文字 .[]{} を避けるため "DEMO " を使用
DEMO_PREFIX = "DEMO "

# デモデータ JSON のパス（backend ルートの data/demo_data.json）
_DEMO_JSON_PATH = Path(__file__).resolve().parent.parent / "data" / "demo_data.json"


def load_demo_data() -> DatabaseInput:
    """
    デモデータ JSON を読み込み、DatabaseInput として返す。
    テストや seed 前の検証に利用可能。
    """
    with _DEMO_JSON_PATH.open(encoding="utf-8") as f:
        raw = json.load(f)
    return DatabaseInput.model_validate(raw)


async def seed_demo_data(session: AsyncSession) -> dict[str, Any]:
    """
    デモデータを投入する。
    既存のデモデータがある場合は先に削除してから、data/demo_data.json を run_import で投入する。
    """
    await clear_demo_data(session)

    data = load_demo_data()
    counts = await run_import(session, data)
    await session.commit()

    return {
        "success": True,
        "message": "デモデータを投入しました",
        "counts": counts,
    }


async def clear_demo_data(session: AsyncSession) -> dict[str, Any]:
    """
    [DEMO] プレフィックスを持つデータを削除する。
    関連データを先に削除してから親データを削除。
    """
    counts: dict[str, int] = {}

    # デモ会社の ID を取得
    result = await session.execute(
        select(Company.id).where(Company.name.like(f"{DEMO_PREFIX}%"))  # type: ignore[reportCallIssue]  # SQLAlchemy select().where() の型が pyright で未解決
    )
    demo_company_ids = [row[0] for row in result.fetchall()]

    # デモレポートの ID を取得
    result = await session.execute(
        select(Report.id).where(Report.report_title.like(f"{DEMO_PREFIX}%"))  # type: ignore[reportCallIssue]  # SQLAlchemy select().where() の型が pyright で未解決
    )
    demo_report_ids = [row[0] for row in result.fetchall()]

    # デモ計器の ID を取得
    result = await session.execute(
        select(Instrument.id).where(Instrument.name.like(f"{DEMO_PREFIX}%"))  # type: ignore[reportCallIssue]  # SQLAlchemy select().where() の型が pyright で未解決
    )
    demo_instrument_ids = [row[0] for row in result.fetchall()]

    # 1. レポート関連データを削除（子から親へ）
    if demo_report_ids:
        # TargetInstrumentTable（report_id で直接削除可能）
        r = await session.execute(
            delete(TargetInstrumentTable).where(
                TargetInstrumentTable.report_id.in_(demo_report_ids)
            )
        )
        counts["target_instrument_tables"] = r.rowcount

        # TargetInstrument の ID を取得
        result = await session.execute(
            select(TargetInstrument.id).where(  # type: ignore[reportCallIssue]  # SQLAlchemy select().where() の型が pyright で未解決
                TargetInstrument.report_id.in_(demo_report_ids)
            )
        )
        target_ids = [row[0] for row in result.fetchall()]

        if target_ids:
            # TargetInstrument
            r = await session.execute(
                delete(TargetInstrument).where(TargetInstrument.id.in_(target_ids))
            )
            counts["target_instruments"] = r.rowcount

        # MissionReport（任務とレポートの紐付け）
        r = await session.execute(
            delete(MissionReport).where(MissionReport.report_id.in_(demo_report_ids))
        )
        counts["mission_reports"] = r.rowcount

        # ReportClient（report_id で紐づく）
        r = await session.execute(
            delete(ReportClient).where(ReportClient.report_id.in_(demo_report_ids))
        )
        counts["report_clients"] = r.rowcount

        # ReportSite（report_id で紐づく）
        r = await session.execute(
            delete(ReportSite).where(ReportSite.report_id.in_(demo_report_ids))
        )
        counts["report_sites"] = r.rowcount

        # ReportWorker
        r = await session.execute(
            delete(ReportWorker).where(ReportWorker.report_id.in_(demo_report_ids))
        )
        counts["report_workers"] = r.rowcount

        # ReportOwnedInstrument
        r = await session.execute(
            delete(ReportOwnedInstrument).where(
                ReportOwnedInstrument.report_id.in_(demo_report_ids)
            )
        )
        counts["report_owned_instruments"] = r.rowcount

        # UsedPart
        r = await session.execute(
            delete(UsedPart).where(UsedPart.report_id.in_(demo_report_ids))
        )
        counts["used_parts"] = r.rowcount

        # Report
        r = await session.execute(delete(Report).where(Report.id.in_(demo_report_ids)))
        counts["reports"] = r.rowcount

    # 2. 現場（DEMO プレフィックス）
    r = await session.execute(delete(Site).where(Site.name.like(f"{DEMO_PREFIX}%")))
    counts["sites"] = r.rowcount

    # 3. スキーマ定義（デモ投入分を全削除してクリア）
    r = await session.execute(delete(SchemaDefinition))
    counts["schema_definitions"] = r.rowcount

    # 3b. 表定義マスタ（DEMO プレフィックス）
    r = await session.execute(
        delete(TableDefinition).where(TableDefinition.name.like(f"{DEMO_PREFIX}%"))
    )
    counts["table_definitions"] = r.rowcount

    # 4. 所有計器（計器と会社に依存）
    if demo_instrument_ids or demo_company_ids:
        r = await session.execute(
            delete(OwnedInstrument).where(
                OwnedInstrument.equipment_name.like(f"{DEMO_PREFIX}%")
            )
        )
        counts["owned_instruments"] = r.rowcount

    # 5. マスタデータ削除（companies を削除する前に company_id を参照する子を削除）
    if demo_company_ids:
        # ReportClient は report_id と company_id の両方を持つ。company_id がデモ会社の行を削除
        r = await session.execute(
            delete(ReportClient).where(ReportClient.company_id.in_(demo_company_ids))
        )
        counts["report_clients_by_company"] = r.rowcount

        # Worker
        r = await session.execute(
            delete(Worker).where(Worker.name.like(f"{DEMO_PREFIX}%"))
        )
        counts["workers"] = r.rowcount

        # Instrument
        r = await session.execute(
            delete(Instrument).where(Instrument.name.like(f"{DEMO_PREFIX}%"))
        )
        counts["instruments"] = r.rowcount

        # Part
        r = await session.execute(delete(Part).where(Part.name.like(f"{DEMO_PREFIX}%")))
        counts["parts"] = r.rowcount

        # Company
        r = await session.execute(
            delete(Company).where(Company.id.in_(demo_company_ids))
        )
        counts["companies"] = r.rowcount

    await session.commit()

    total = sum(counts.values())
    return {
        "success": True,
        "message": f"デモデータを削除しました（{total}件）",
        "counts": counts,
    }


async def get_demo_status(session: AsyncSession) -> dict[str, Any]:
    """
    デモデータの件数を取得する。
    """
    counts: dict[str, int] = {}

    # 会社
    result = await session.execute(
        select(func.count())
        .select_from(Company)
        .where(Company.name.like(f"{DEMO_PREFIX}%"))
    )
    counts["companies"] = result.scalar() or 0

    # 作業者
    result = await session.execute(
        select(func.count())
        .select_from(Worker)
        .where(Worker.name.like(f"{DEMO_PREFIX}%"))
    )
    counts["workers"] = result.scalar() or 0

    # 計器
    result = await session.execute(
        select(func.count())
        .select_from(Instrument)
        .where(Instrument.name.like(f"{DEMO_PREFIX}%"))
    )
    counts["instruments"] = result.scalar() or 0

    # 部品
    result = await session.execute(
        select(func.count()).select_from(Part).where(Part.name.like(f"{DEMO_PREFIX}%"))
    )
    counts["parts"] = result.scalar() or 0

    # スキーマ定義・現場（デモでは名前で識別）
    result = await session.execute(select(func.count()).select_from(SchemaDefinition))
    counts["schema_definitions"] = result.scalar() or 0

    result = await session.execute(
        select(func.count()).select_from(Site).where(Site.name.like(f"{DEMO_PREFIX}%"))
    )
    counts["sites"] = result.scalar() or 0

    # 所有計器
    result = await session.execute(
        select(func.count())
        .select_from(OwnedInstrument)
        .where(OwnedInstrument.equipment_name.like(f"{DEMO_PREFIX}%"))
    )
    counts["owned_instruments"] = result.scalar() or 0

    # レポート
    result = await session.execute(
        select(func.count())
        .select_from(Report)
        .where(Report.report_title.like(f"{DEMO_PREFIX}%"))
    )
    counts["reports"] = result.scalar() or 0

    total = sum(counts.values())
    has_demo_data = total > 0

    return {
        "has_demo_data": has_demo_data,
        "total": total,
        "counts": counts,
    }
