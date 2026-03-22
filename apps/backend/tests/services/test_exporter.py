"""
exporter サービスのテスト。
export_db_to_dict / export_custom_data / export_delta_data の動作を検証する。

※ すべてのテストは実 DB (db_session フィクスチャ) を使用する。AsyncMock は使用しない。
"""

import datetime
import uuid

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from models import Report
from schemas import ExportRequest
from services.exporter import (
    export_custom_data,
    export_db_to_dict,
    export_delta_data,
)
from tests.factories import (
    insert_company,
    insert_instrument,
    insert_report,
    insert_report_worker,
    insert_target_instrument,
    insert_worker,
)


class TestExportDbToDict:
    """export_db_to_dict() 関数のテスト"""

    @pytest.mark.asyncio
    async def test_export_empty_db(self, db_session: AsyncSession):
        """空のDBをエクスポート"""
        result = await export_db_to_dict(db_session)
        assert result["companies"] == []
        assert result["workers"] == []
        assert result["reports"] == []

    @pytest.mark.asyncio
    async def test_export_with_data(self, db_session: AsyncSession):
        """データがあるDBをエクスポート"""
        company = await insert_company(db_session, name="Test Company")
        await insert_worker(db_session, company_id=company.id, name="Test Worker")

        result = await export_db_to_dict(db_session)
        assert len(result["companies"]) == 1
        assert result["companies"][0]["name"] == "Test Company"
        assert len(result["workers"]) == 1
        assert result["workers"][0]["name"] == "Test Worker"

    @pytest.mark.asyncio
    async def test_export_camel_case_keys(self, db_session: AsyncSession):
        """エクスポートされたキーがキャメルケースである"""
        await insert_company(db_session, postal_code="123-4567")

        result = await export_db_to_dict(db_session)
        exported_company = result["companies"][0]
        assert "postalCode" in exported_company
        assert "postal_code" not in exported_company

    @pytest.mark.asyncio
    async def test_export_all_tables(self, db_session: AsyncSession):
        """全テーブルがエクスポート結果に含まれる"""
        result = await export_db_to_dict(db_session)
        expected_keys = [
            "companies",
            "workers",
            "instruments",
            "schemaDefinitions",
            "sites",
            "parts",
            "ownedInstruments",
            "reports",
            "reportWorkers",
            "targetInstruments",
            "usedParts",
            "reportOwnedInstruments",
        ]
        for key in expected_keys:
            assert key in result, f"Missing key: {key}"


class TestExportCustomData:
    """export_custom_data() 関数のテスト"""

    @pytest.mark.asyncio
    async def test_export_companies_only(self, db_session: AsyncSession):
        """会社のみエクスポート"""
        await insert_company(db_session)

        criteria = ExportRequest(
            include_companies=True,
            include_workers=False,
        )
        result = await export_custom_data(db_session, criteria)
        assert len(result["companies"]) == 1
        assert result["workers"] == []

    @pytest.mark.asyncio
    async def test_export_no_masters(self, db_session: AsyncSession):
        """マスタをエクスポートしない"""
        await insert_company(db_session)

        criteria = ExportRequest(
            include_companies=False,
            include_workers=False,
            include_instruments=False,
            include_schema_definitions=False,
            include_sites=False,
            include_parts=False,
            include_owned_instruments=False,
        )
        result = await export_custom_data(db_session, criteria)
        assert result["companies"] == []

    @pytest.mark.asyncio
    async def test_export_specific_reports(self, db_session: AsyncSession):
        """特定のレポートのみエクスポート"""
        company = await insert_company(db_session)
        report = await insert_report(
            db_session,
            company_id=company.id,
            report_title="特定レポート",
        )

        criteria = ExportRequest(
            include_companies=True,
            target_report_ids=[report.id],
        )
        result = await export_custom_data(db_session, criteria)
        assert len(result["reports"]) == 1
        assert result["reports"][0]["id"] == str(report.id)

    @pytest.mark.asyncio
    async def test_export_report_with_related_data(self, db_session: AsyncSession):
        """レポートと関連データをエクスポート"""
        company = await insert_company(db_session)
        report = await insert_report(
            db_session,
            company_id=company.id,
            custom_data={"year": 2024},
        )
        instrument = await insert_instrument(db_session, company_id=company.id)
        await insert_target_instrument(
            db_session, report_id=report.id, instrument_id=instrument.id
        )

        criteria = ExportRequest(
            include_companies=True,
            include_workers=True,
            include_instruments=True,
            target_report_ids=[report.id],
        )
        result = await export_custom_data(db_session, criteria)
        assert len(result["reports"]) == 1
        assert result["reports"][0].get("customData") == {"year": 2024}
        assert len(result["targetInstruments"]) == 1

    @pytest.mark.asyncio
    async def test_export_empty_report_ids(self, db_session: AsyncSession):
        """レポートIDが空の場合はレポート関連データなし"""
        await insert_company(db_session)

        criteria = ExportRequest(
            include_companies=True,
            target_report_ids=[],
        )
        result = await export_custom_data(db_session, criteria)
        assert len(result["companies"]) == 1
        assert result["reports"] == []

    @pytest.mark.asyncio
    async def test_export_target_report_ids_nonexistent_uuid(
        self, db_session: AsyncSession
    ):
        """存在しない UUID を target_report_ids に指定した場合: 0件でエラーにならない"""
        await insert_company(db_session)

        criteria = ExportRequest(
            include_companies=True,
            target_report_ids=[uuid.uuid4(), uuid.uuid4()],
        )
        result = await export_custom_data(db_session, criteria)
        assert len(result["reports"]) == 0
        assert result["targetInstruments"] == []

    @pytest.mark.asyncio
    async def test_export_report_with_null_custom_data_normalized(
        self, db_session: AsyncSession
    ):
        """DB 上で custom_data が null のレポートは、エクスポート結果で customData が含まれる"""
        company = await insert_company(db_session)
        report = await insert_report(
            db_session, company_id=company.id, custom_data=None
        )

        criteria = ExportRequest(
            include_companies=True,
            target_report_ids=[report.id],
        )
        result = await export_custom_data(db_session, criteria)
        assert len(result["reports"]) == 1
        exported = result["reports"][0]
        assert "customData" in exported
        assert exported["customData"] is None or exported["customData"] == {}


class TestExportDeltaData:
    """export_delta_data() 関数のテスト"""

    @pytest.mark.asyncio
    async def test_delta_export_empty_db(self, db_session: AsyncSession):
        """空のDBの差分エクスポート"""
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)
        result = await export_delta_data(db_session, since)

        assert result["reports"] == []
        assert "_meta" in result
        assert result["_meta"]["syncType"] == "delta"
        assert result["_meta"]["reportCount"] == 0

    @pytest.mark.asyncio
    async def test_delta_export_with_recent_data(self, db_session: AsyncSession):
        """最近のデータ（updated_at >= since）を含む差分エクスポート"""
        report = await insert_report(db_session)
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)

        # updated_at を since より後に更新
        future_time = datetime.datetime.utcnow()
        await db_session.execute(
            update(Report).where(Report.id == report.id).values(updated_at=future_time)
        )
        await db_session.flush()

        result = await export_delta_data(db_session, since)
        assert len(result["reports"]) == 1
        assert result["_meta"]["reportCount"] == 1

    @pytest.mark.asyncio
    async def test_delta_export_no_recent_data(self, db_session: AsyncSession):
        """最近のデータがない場合の差分エクスポート"""
        await insert_report(db_session)

        # since を未来に設定することで取得されないようにする
        since = datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        result = await export_delta_data(db_session, since)

        assert len(result["reports"]) == 0
        assert result["_meta"]["reportCount"] == 0

    @pytest.mark.asyncio
    async def test_delta_export_with_masters(self, db_session: AsyncSession):
        """マスターデータを含む差分エクスポート"""
        report = await insert_report(db_session)
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)

        await db_session.execute(
            update(Report)
            .where(Report.id == report.id)
            .values(updated_at=datetime.datetime.utcnow())
        )
        await db_session.flush()

        result = await export_delta_data(db_session, since, include_master=True)
        assert len(result["companies"]) >= 1
        assert len(result["reports"]) == 1

    @pytest.mark.asyncio
    async def test_delta_export_without_masters(self, db_session: AsyncSession):
        """マスターデータなしの差分エクスポート"""
        report = await insert_report(db_session)
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)

        await db_session.execute(
            update(Report)
            .where(Report.id == report.id)
            .values(updated_at=datetime.datetime.utcnow())
        )
        await db_session.flush()

        result = await export_delta_data(db_session, since, include_master=False)
        assert result["companies"] == []
        assert result["workers"] == []
        assert len(result["reports"]) == 1

    @pytest.mark.asyncio
    async def test_delta_export_meta_info(self, db_session: AsyncSession):
        """差分エクスポートのメタ情報が正しい"""
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)
        result = await export_delta_data(db_session, since)

        assert "_meta" in result
        meta = result["_meta"]
        assert meta["syncType"] == "delta"
        assert "since" in meta
        assert "syncedAt" in meta
        assert "reportCount" in meta

    @pytest.mark.asyncio
    async def test_delta_export_with_related_data(self, db_session: AsyncSession):
        """差分エクスポートで関連データ（TargetInstrument, customData 等）が正しく含まれる"""
        company = await insert_company(db_session)
        report = await insert_report(
            db_session,
            company_id=company.id,
            report_title="Delta Related Data Test",
            custom_data={"year": 2024},
        )
        worker = await insert_worker(db_session, company_id=company.id)
        await insert_report_worker(db_session, report_id=report.id, worker_id=worker.id)
        instrument = await insert_instrument(db_session, company_id=company.id)
        await insert_target_instrument(
            db_session, report_id=report.id, instrument_id=instrument.id
        )
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)

        # updated_at を since より後に設定
        await db_session.execute(
            update(Report)
            .where(Report.id == report.id)
            .values(updated_at=datetime.datetime.utcnow())
        )
        await db_session.flush()

        result = await export_delta_data(db_session, since)

        assert len(result["reports"]) == 1
        assert result["reports"][0]["reportTitle"] == "Delta Related Data Test"
        assert result["reports"][0].get("customData") == {"year": 2024}
        assert len(result["reportWorkers"]) == 1
        assert len(result["targetInstruments"]) == 1

    @pytest.mark.asyncio
    async def test_delta_export_all_keys_present(self, db_session: AsyncSession):
        """差分エクスポートで全ての必須キーが存在する"""
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)
        result = await export_delta_data(db_session, since)

        required_keys = [
            "companies",
            "workers",
            "instruments",
            "schemaDefinitions",
            "sites",
            "parts",
            "ownedInstruments",
            "reports",
            "reportWorkers",
            "targetInstruments",
            "usedParts",
            "reportOwnedInstruments",
            "_meta",
        ]

        for key in required_keys:
            assert key in result, f"Missing key: {key}"

    @pytest.mark.asyncio
    async def test_delta_export_multiple_reports(self, db_session: AsyncSession):
        """複数レポートの差分エクスポート"""
        company = await insert_company(db_session)
        report1 = await insert_report(
            db_session,
            company_id=company.id,
            report_title="New Report 1",
        )
        report2 = await insert_report(
            db_session,
            company_id=company.id,
            report_title="New Report 2",
        )
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)

        # 両レポートの updated_at を since より後に設定
        now = datetime.datetime.utcnow()
        await db_session.execute(
            update(Report)
            .where(Report.id.in_([report1.id, report2.id]))
            .values(updated_at=now)
        )
        await db_session.flush()

        result = await export_delta_data(db_session, since)

        assert len(result["reports"]) == 2
        assert result["_meta"]["reportCount"] == 2

        report_titles = [r["reportTitle"] for r in result["reports"]]
        assert "New Report 1" in report_titles
        assert "New Report 2" in report_titles
        assert "Old Report" not in report_titles
