"""
DB から Report および関連データを取得し、再帰的なオブジェクトグラフ（camelCase 辞書）として返す。
スコープに応じて Eager Loading の深さを切り替え可能（巨大な一括読み込みの抑制）。
"""

from __future__ import annotations

import logging
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import (
    Instrument,
    OwnedInstrument,
    Part,
    Report,
    ReportClient,
    ReportOwnedInstrument,
    ReportSite,
    ReportWorker,
    TargetInstrument,
    UsedPart,
    Worker,
)
from services.context_models import ReportContextRoot

logger = logging.getLogger(__name__)


class LoadScope(StrEnum):
    """
    レポートコンテキストの読み込み範囲。
    - FULL: プレースホルダ置換用に全リレーションを一括ロード（従来どおり）。
    - MINIMAL: Report と company のみ。一覧・要約や部分更新用。
    """

    FULL = "full"
    MINIMAL = "minimal"


def _load_options(scope: LoadScope) -> list[Any]:
    """
    スコープに応じた selectinload オプションのリストを返す。
    深さ・必要データに応じた段階的ロードの土台となる。
    """
    if scope == LoadScope.MINIMAL:
        return [selectinload(Report.company)]

    # FULL: テンプレートプレースホルダ置換に必要な全リレーション
    return [
        selectinload(Report.company),
        selectinload(Report.report_sites).selectinload(ReportSite.site),
        selectinload(Report.report_clients).selectinload(ReportClient.company),
        selectinload(Report.report_workers)
        .selectinload(ReportWorker.worker)
        .selectinload(Worker.company),
        selectinload(Report.target_instruments)
        .selectinload(TargetInstrument.instrument)
        .selectinload(Instrument.company),
        selectinload(Report.target_instruments).selectinload(
            TargetInstrument.target_instrument_tables
        ),
        selectinload(Report.report_owned_instruments)
        .selectinload(ReportOwnedInstrument.owned_instrument)
        .selectinload(OwnedInstrument.instrument)
        .selectinload(Instrument.company),
        selectinload(Report.report_owned_instruments)
        .selectinload(ReportOwnedInstrument.owned_instrument)
        .selectinload(OwnedInstrument.company),
        selectinload(Report.used_parts)
        .selectinload(UsedPart.part)
        .selectinload(Part.company),
    ]


async def load_report_context(
    session: AsyncSession,
    report_id: UUID,
    scope: LoadScope = LoadScope.FULL,
) -> ReportContextRoot | None:
    """
    指定 report_id の Report をルートに、スコープに応じた関連データを Eager Load し、
    再帰的な Pydantic モデルへ変換する。

    Args:
        session: 非同期セッション
        report_id: レポート ID
        scope: 読み込み範囲。FULL=全リレーション（プレースホルダ用）、MINIMAL=Report+company のみ

    Returns:
        Pydantic モデルへのマッピング結果。
        レポートが存在しない場合は None を返す。
    """
    result = await session.execute(
        select(Report).where(Report.id == report_id).options(*_load_options(scope))
    )
    report = result.scalar_one_or_none()
    if not report:
        return None

    if scope == LoadScope.FULL:
        # 配列系リレーションを sort_order 昇順でソート（帳票の表示順を固定）
        for attr in (
            "report_clients",
            "report_workers",
            "target_instruments",
            "report_owned_instruments",
            "used_parts",
        ):
            lst = getattr(report, attr, None)
            if isinstance(lst, list) and len(lst) > 0:
                lst.sort(key=lambda x: getattr(x, "sort_order", None) or 0)

    def _extract_loaded(obj: Any) -> dict[str, Any]:
        try:
            ins = sa_inspect(obj)
            data = {}
            for c in ins.mapper.column_attrs:
                data[c.key] = getattr(obj, c.key, None)
            for r in ins.mapper.relationships:
                if r.key not in ins.unloaded:
                    val = getattr(obj, r.key, None)
                    if isinstance(val, list):
                        data[r.key] = [_extract_loaded(i) for i in val]
                    elif val is not None:
                        data[r.key] = _extract_loaded(val)
            return data
        except Exception:
            return obj

    loaded_dict = _extract_loaded(report)
    return ReportContextRoot.model_validate(loaded_dict)
