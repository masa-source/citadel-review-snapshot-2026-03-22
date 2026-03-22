"""
ai_report_builder のサービステスト。
build_report_from_ai_data で Company/Report/Worker/ReportWorker/Instrument/TargetInstrument/Part/UsedPart が
検索・作成され、Report が正しく構築されることを検証する。

※ すべてのテストは実 DB (db_session フィクスチャ) を使用する。AsyncMock は使用しない。
"""

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ai_schemas import (
    AIExtractedReport,
    AIExtractedTargetInstrument,
    AIExtractedUsedPart,
)
from models import (
    Company,
    Instrument,
    Part,
    ReportFormat,
    ReportWorker,
    TargetInstrument,
    UsedPart,
    Worker,
)
from services.ai_report_builder import build_report_from_ai_data
from tests.factories import insert_company


class TestBuildReportFromAiData:
    """build_report_from_ai_data のテスト"""

    @pytest.mark.asyncio
    async def test_company_and_report_only(self, db_session: AsyncSession) -> None:
        """company_name と report_title のみ設定時、Company が1件作成され Report が作成される"""
        ai_data = AIExtractedReport(
            report_title="点検報告書",
            company_name="テスト株式会社",
        )
        report = await build_report_from_ai_data(db_session, ai_data)
        await db_session.flush()

        # Report が返っていることを確認
        assert report is not None
        assert report.id is not None
        assert report.report_title == "点検報告書"

        # Company が DB に保存されていることを確認
        company_result = await db_session.execute(
            select(Company).where(Company.name == "テスト株式会社")
        )
        company = company_result.scalars().first()
        assert company is not None
        assert report.company_id == company.id

        # ReportFormat が DB に作成されていることを確認
        rf_result = await db_session.execute(
            select(ReportFormat).where(ReportFormat.name == "作業報告書")
        )
        rf = rf_result.scalars().first()
        assert rf is not None
        assert report.report_format_id == rf.id

    @pytest.mark.asyncio
    async def test_existing_company_reused(self, db_session: AsyncSession) -> None:
        """同一 name の Company が既に存在するとき、新規作成せず既存の Company が Report に紐づく"""
        # 事前に同名の会社を作成
        existing_company = await insert_company(db_session, name="既存会社")

        ai_data = AIExtractedReport(
            report_title="R1",
            company_name="既存会社",
        )
        report = await build_report_from_ai_data(db_session, ai_data)
        await db_session.flush()

        # 既存の Company が再利用されている（Company が増えていない）
        count_result = await db_session.execute(
            select(func.count()).select_from(Company).where(Company.name == "既存会社")
        )
        assert count_result.scalar_one() == 1

        assert report is not None
        assert report.company_id == existing_company.id
        assert report.report_title == "R1"

    @pytest.mark.asyncio
    async def test_workers_created_and_linked(self, db_session: AsyncSession) -> None:
        """workers を設定すると Worker が登録され ReportWorker が2件作成される。"""
        ai_data = AIExtractedReport(
            report_title="作業報告",
            company_name="作業会社",
            workers=["山田太郎", "佐藤花子"],
        )
        report = await build_report_from_ai_data(db_session, ai_data)
        await db_session.flush()

        rws = (
            (
                await db_session.execute(
                    select(ReportWorker).where(ReportWorker.report_id == report.id)
                )
            )
            .scalars()
            .all()
        )
        assert len(rws) == 2
        worker_ids = [rw.worker_id for rw in rws]
        workers = (
            (await db_session.execute(select(Worker).where(Worker.id.in_(worker_ids))))
            .scalars()
            .all()
        )
        names = {w.name for w in workers}
        assert "山田太郎" in names
        assert "佐藤花子" in names

    @pytest.mark.asyncio
    async def test_target_instruments_created_and_linked(
        self, db_session: AsyncSession
    ) -> None:
        """target_instruments を設定すると Instrument と TargetInstrument が作成される"""
        ai_data = AIExtractedReport(
            report_title="計器報告",
            company_name="計器会社",
            target_instruments=[
                AIExtractedTargetInstrument(tag_number="T-001", name="温度計")
            ],
        )
        report = await build_report_from_ai_data(db_session, ai_data)
        await db_session.flush()

        # Instrument が作成されていることを確認
        inst_result = await db_session.execute(
            select(Instrument).where(Instrument.name == "温度計")
        )
        added_instrument = inst_result.scalars().first()
        assert added_instrument is not None
        assert added_instrument.name == "温度計"

        # TargetInstrument が作成されていることを確認
        ti_result = await db_session.execute(
            select(TargetInstrument).where(TargetInstrument.report_id == report.id)
        )
        added_ti = ti_result.scalars().first()
        assert added_ti is not None
        assert added_ti.tag_number == "T-001"
        assert added_ti.instrument_id == added_instrument.id

    @pytest.mark.asyncio
    async def test_used_parts_created_and_linked(
        self, db_session: AsyncSession
    ) -> None:
        """used_parts を設定すると Part と UsedPart が作成され quantity が反映される"""
        ai_data = AIExtractedReport(
            report_title="部品報告",
            company_name="部品会社",
            used_parts=[
                AIExtractedUsedPart(name="ガスケット", part_number="G-100", quantity=2)
            ],
        )
        report = await build_report_from_ai_data(db_session, ai_data)
        await db_session.flush()

        # Part が作成されていることを確認
        part_result = await db_session.execute(
            select(Part).where(Part.name == "ガスケット")
        )
        added_part = part_result.scalars().first()
        assert added_part is not None
        assert added_part.part_number == "G-100"

        # UsedPart が作成されていることを確認
        up_result = await db_session.execute(
            select(UsedPart).where(UsedPart.report_id == report.id)
        )
        added_up = up_result.scalars().first()
        assert added_up is not None
        assert added_up.quantity == 2
        assert added_up.part_id == added_part.id

    @pytest.mark.asyncio
    async def test_control_number_and_custom_data_on_report(
        self, db_session: AsyncSession
    ) -> None:
        """control_number と custom_data が Report に反映される"""
        ai_data = AIExtractedReport(
            report_title="タイトル",
            control_number="CTL-001",
            custom_data={"年度": "2024"},
        )
        report = await build_report_from_ai_data(db_session, ai_data)

        assert report.control_number == "CTL-001"
        assert report.custom_data == {"年度": "2024"}

    @pytest.mark.asyncio
    async def test_empty_company_name_report_and_workers(
        self, db_session: AsyncSession
    ) -> None:
        """company_name が空のとき Company は作成されず Report.company_id は None。
        Worker は company_id なしで検索・作成される"""
        ai_data = AIExtractedReport(
            report_title="無所属報告",
            company_name=None,
            workers=["単独作業者"],
        )
        report = await build_report_from_ai_data(db_session, ai_data)
        await db_session.flush()

        # company_id が None であること
        assert report.company_id is None

        # Worker が company_id なしで作成されていること
        worker_result = await db_session.execute(
            select(Worker).where(Worker.name == "単独作業者")
        )
        added_worker = worker_result.scalars().first()
        assert added_worker is not None
        assert added_worker.company_id is None

        # ReportWorker が作成されていること
        rw_result = await db_session.execute(
            select(ReportWorker).where(ReportWorker.report_id == report.id)
        )
        added_rw = rw_result.scalars().first()
        assert added_rw is not None
        assert added_rw.report_id == report.id
