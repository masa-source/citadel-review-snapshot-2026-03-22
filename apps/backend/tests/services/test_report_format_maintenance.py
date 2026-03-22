"""
report_format_maintenance のユニットテスト（DBあり・外部依存なし）。
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models import Report, ReportFormat, ReportFormatTemplate, ReportTemplate
from services.report_format_maintenance import (
    backfill_missing_report_format_id,
    ensure_default_report_format,
    find_report_formats_without_templates,
    find_report_templates_with_missing_files,
)


class TestEnsureDefaultReportFormat:
    @pytest.mark.asyncio
    async def test_returns_existing_format_when_present(
        self,
        db_session: AsyncSession,
    ) -> None:
        existing = ReportFormat(name="作業報告書")
        db_session.add(existing)
        await db_session.commit()
        await db_session.refresh(existing)

        out = await ensure_default_report_format(db_session, default_name="作業報告書")
        assert out.id == existing.id
        assert out.name == "作業報告書"

    @pytest.mark.asyncio
    async def test_creates_format_when_missing(
        self,
        db_session: AsyncSession,
    ) -> None:
        out = await ensure_default_report_format(db_session, default_name="作業報告書")
        assert out.id is not None
        assert out.name == "作業報告書"

        row = await db_session.execute(
            select(ReportFormat).where(ReportFormat.id == out.id)
        )
        assert row.scalar_one_or_none() is not None

    @pytest.mark.asyncio
    async def test_creates_format_is_visible_from_other_session_when_missing(
        self,
        test_session_maker: async_sessionmaker[AsyncSession],
    ) -> None:
        default_name = f"作業報告書-{uuid.uuid4()}"
        try:
            async with test_session_maker() as s1:
                await ensure_default_report_format(s1, default_name=default_name)

            async with test_session_maker() as s2:
                row = await s2.execute(
                    select(ReportFormat)
                    .where(ReportFormat.name == default_name)
                    .limit(1)
                )
                assert row.scalars().first() is not None
        finally:
            async with test_session_maker() as s_cleanup:
                await s_cleanup.execute(
                    delete(ReportFormat).where(ReportFormat.name == default_name)
                )
                await s_cleanup.commit()


class TestBackfillMissingReportFormatId:
    @pytest.mark.asyncio
    async def test_returns_0_when_no_reports_missing(
        self,
        db_session: AsyncSession,
    ) -> None:
        fmt = ReportFormat(name="作業報告書")
        r = Report(report_title="R1", report_format_id=fmt.id)
        db_session.add_all([fmt, r])
        await db_session.commit()

        updated = await backfill_missing_report_format_id(
            db_session, default_name="作業報告書"
        )
        assert updated == 0

    @pytest.mark.asyncio
    async def test_updates_reports_with_null_report_format_id(
        self,
        db_session: AsyncSession,
    ) -> None:
        # Report は report_format_id=None のものを2件作成
        r1 = Report(report_title="R1", report_format_id=None)
        r2 = Report(report_title="R2", report_format_id=None)
        db_session.add_all([r1, r2])
        await db_session.commit()
        await db_session.refresh(r1)
        await db_session.refresh(r2)

        updated = await backfill_missing_report_format_id(
            db_session, default_name="作業報告書"
        )
        assert updated == 2

        # DBから再取得して report_format_id が埋まっていること
        row1 = await db_session.execute(select(Report).where(Report.id == r1.id))
        row2 = await db_session.execute(select(Report).where(Report.id == r2.id))
        rr1 = row1.scalar_one()
        rr2 = row2.scalar_one()
        assert rr1.report_format_id is not None
        assert rr2.report_format_id is not None
        assert rr1.report_format_id == rr2.report_format_id


class TestFindReportFormatsWithoutTemplates:
    @pytest.mark.asyncio
    async def test_returns_only_orphan_formats(
        self,
        db_session: AsyncSession,
    ) -> None:
        fmt_orphan = ReportFormat(name="orphan")
        fmt_linked = ReportFormat(name="linked")
        tpl = ReportTemplate(name="T", file_path="templates/t.xlsx")
        db_session.add_all([fmt_orphan, fmt_linked, tpl])
        await db_session.commit()
        await db_session.refresh(fmt_orphan)
        await db_session.refresh(fmt_linked)
        await db_session.refresh(tpl)

        link = ReportFormatTemplate(
            report_format_id=fmt_linked.id,
            report_template_id=tpl.id,
            sort_order=1,
        )
        db_session.add(link)
        await db_session.commit()

        out = await find_report_formats_without_templates(db_session)
        assert [(f.id, c) for f, c in out] == [(fmt_orphan.id, 0)]


class TestFindReportTemplatesWithMissingFiles:
    @pytest.mark.asyncio
    async def test_returns_templates_with_file_path_null_only(
        self,
        db_session: AsyncSession,
    ) -> None:
        t_missing = ReportTemplate(name="missing", file_path=None)
        t_ok = ReportTemplate(name="ok", file_path="templates/ok.xlsx")
        db_session.add_all([t_missing, t_ok])
        await db_session.commit()

        out = await find_report_templates_with_missing_files(db_session)
        ids = {t.id for t in out}
        assert t_missing.id in ids
        assert t_ok.id not in ids
