"""
ReportFormat / ReportFormatTemplate / Report の整合性チェックと補正用ユーティリティ。

運用時に、マイグレーションやデータ移行の影響で report_format_id が欠落している
レポートが存在する場合に使用することを想定している。
"""

import logging
from collections.abc import Iterable, Sequence

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import Report, ReportFormat, ReportFormatTemplate, ReportTemplate

logger = logging.getLogger(__name__)


async def ensure_default_report_format(
    session: AsyncSession,
    default_name: str = "作業報告書",
) -> ReportFormat:
    """
    デフォルトの ReportFormat（name=default_name）を取得し、存在しなければ作成して返す。
    """
    result = await session.execute(
        select(ReportFormat).where(ReportFormat.name == default_name).limit(1)
    )
    fmt = result.scalars().first()
    if fmt:
        return fmt

    fmt = ReportFormat(name=default_name)
    session.add(fmt)
    await session.commit()
    await session.refresh(fmt)
    logger.info(
        'Created default ReportFormat(name="%s") with id=%s', default_name, fmt.id
    )
    return fmt


async def backfill_missing_report_format_id(
    session: AsyncSession,
    default_name: str = "作業報告書",
) -> int:
    """
    report_format_id が NULL の Report レコードに対して、default_name の ReportFormat を設定する。

    戻り値: 更新したレコード数。
    """
    default_fmt = await ensure_default_report_format(session, default_name=default_name)

    stmt = select(Report.id).where(  # pyright: ignore[reportCallIssue]
        Report.report_format_id.is_(None),
    )
    result = await session.execute(stmt)
    ids: Sequence = result.scalars().all()
    if not ids:
        logger.info("No Report rows with missing report_format_id found.")
        return 0

    await session.execute(
        update(Report).where(Report.id.in_(ids)).values(report_format_id=default_fmt.id)
    )
    await session.commit()
    logger.info(
        "Backfilled report_format_id for %d Report rows with default ReportFormat(id=%s, name=%s).",
        len(ids),
        default_fmt.id,
        default_fmt.name,
    )
    return len(ids)


async def find_report_formats_without_templates(
    session: AsyncSession,
) -> list[tuple[ReportFormat, int]]:
    """
    ReportFormat に対して、紐づく ReportFormatTemplate が 0 件のものを検出する。

    戻り値: (ReportFormat, 紐づく ReportFormatTemplate 件数=0) のリスト。
    """
    result = await session.execute(
        select(ReportFormat, func.count(ReportFormatTemplate.id))
        .outerjoin(
            ReportFormatTemplate,
            ReportFormatTemplate.report_format_id == ReportFormat.id,
        )
        .group_by(ReportFormat.id)
        .having(func.count(ReportFormatTemplate.id) == 0)
    )
    rows: Iterable[tuple[ReportFormat, int]] = result.all()
    return [(fmt, int(count)) for fmt, count in rows]


async def find_report_templates_with_missing_files(
    session: AsyncSession,
) -> list[ReportTemplate]:
    """
    ReportTemplate のうち、file_path が NULL のものを検出する。

    実際のファイル存在チェックは routers.reports 内で行われるため、ここでは
    「パス自体が設定されていないテンプレート」のみを対象とする。
    """
    result = await session.execute(
        select(ReportTemplate).where(ReportTemplate.file_path.is_(None))
    )
    templates = result.scalars().all()
    return list(templates)
