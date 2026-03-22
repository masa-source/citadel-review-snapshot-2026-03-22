"""
db_loader.py のインテグレーションテスト
"""

import uuid

import pytest

from models import (
    ReportClient,
    ReportOwnedInstrument,
    ReportSite,
    ReportWorker,
    TargetInstrument,
    UsedPart,
)
from services.db_loader import (
    LoadScope,
    load_report_context,
)
from tests.factories import (
    insert_company,
    insert_instrument,
    insert_owned_instrument,
    insert_part,
    insert_report,
    insert_site,
    insert_worker,
)
from tests.helpers import (
    UUID_COMPANY_1,
    UUID_COMPANY_2,
    UUID_INSTRUMENT_1,
    UUID_NON_EXISTENT,
    UUID_OWNED_1,
    UUID_PART_1,
    UUID_REPORT_WORKER_1,
    UUID_SITE_1,
    UUID_TARGET_1,
    UUID_USED_PART_1,
    UUID_WORKER_1,
    get_first_report_id,
)


class TestLoadReportContext:
    """load_report_context() 関数のテスト"""

    @pytest.mark.asyncio
    async def test_load_report_not_found(self, db_session):
        """存在しないレポートIDの場合は None を返す"""
        report_ctx = await load_report_context(db_session, uuid.UUID(UUID_NON_EXISTENT))
        assert report_ctx is None

    @pytest.mark.asyncio
    async def test_load_report_basic(self, db_session):
        """基本的なレポートをロード"""
        company = await insert_company(db_session, name="Test Company")
        report = await insert_report(
            db_session, company_id=company.id, report_title="Test Report"
        )

        # DBから実際のレポートIDを取得
        report_id = await get_first_report_id(db_session)
        assert report_id is not None
        assert report_id == report.id

        ctx = await load_report_context(db_session, report_id)
        assert ctx is not None
        report_dict = ctx.model_dump(by_alias=True, mode="python")

        assert report_dict["reportTitle"] == "Test Report"
        assert report_dict["company"]["name"] == "Test Company"

    @pytest.mark.asyncio
    async def test_load_report_with_management(self, db_session):
        """管理情報付きレポートをロード"""
        contractor = await insert_company(db_session, name="Contractor")
        client = await insert_company(
            db_session, id=uuid.UUID(UUID_COMPANY_2), name="Client A"
        )

        report = await insert_report(db_session, company_id=contractor.id)

        # ReportClient を作成
        db_session.add(
            ReportClient(report_id=report.id, company_id=client.id, sort_order=0)
        )
        await db_session.flush()

        # DBから実際のレポートIDを取得
        report_id = await get_first_report_id(db_session)
        ctx = await load_report_context(db_session, report_id)
        assert ctx is not None
        report_dict = ctx.model_dump(by_alias=True, mode="python")

        assert "reportClientsOrdered" in report_dict
        assert report_dict.get("company") is not None
        assert "reportClients" not in report_dict
        assert "reportClientsOrdered" in report_dict
        assert len(report_dict["reportClientsOrdered"]) == 2
        assert report_dict["reportClientsOrdered"][0] is None
        assert "reportClientsByCompanyId" in report_dict
        rc = report_dict["reportClientsOrdered"][1]
        cid = rc.get("companyId")
        assert cid is not None
        assert report_dict["reportClientsByCompanyId"].get(str(cid)) is not None

    @pytest.mark.asyncio
    async def test_load_report_with_workers(self, db_session):
        """作業者付きレポートをロード"""
        company = await insert_company(db_session)
        worker = await insert_worker(
            db_session, id=uuid.UUID(UUID_WORKER_1), company_id=company.id
        )
        report = await insert_report(db_session, company_id=company.id)

        db_session.add(
            ReportWorker(
                id=uuid.UUID(UUID_REPORT_WORKER_1),
                report_id=report.id,
                worker_id=worker.id,
                worker_role="leader",
                sort_order=0,
            )
        )
        await db_session.flush()

        report_id = await get_first_report_id(db_session)
        ctx = await load_report_context(db_session, report_id)
        assert ctx is not None
        report_dict = ctx.model_dump(by_alias=True, mode="python")

        assert "reportWorkers" not in report_dict
        assert len(report_dict["reportWorkersOrdered"]) == 2
        assert report_dict["reportWorkersOrdered"][0] is None
        assert report_dict["reportWorkersOrdered"][1]["workerRole"] == "leader"
        assert report_dict["reportWorkersOrdered"][1].get("worker") is not None

    @pytest.mark.asyncio
    async def test_load_report_with_target_instruments(self, db_session):
        """対象計器付きレポートをロード"""
        company = await insert_company(db_session)
        instrument = await insert_instrument(
            db_session, id=uuid.UUID(UUID_INSTRUMENT_1), company_id=company.id
        )
        report = await insert_report(db_session, company_id=company.id)

        db_session.add(
            TargetInstrument(
                id=uuid.UUID(UUID_TARGET_1),
                report_id=report.id,
                instrument_id=instrument.id,
                tag_number="TAG-001",
                sort_order=0,
            )
        )
        await db_session.flush()

        report_id = await get_first_report_id(db_session)
        ctx = await load_report_context(db_session, report_id)
        assert ctx is not None
        report_dict = ctx.model_dump(by_alias=True, mode="python")

        assert "targetInstruments" not in report_dict
        assert len(report_dict["targetInstrumentsOrdered"]) == 2
        assert report_dict["targetInstrumentsOrdered"][0] is None
        assert report_dict["targetInstrumentsOrdered"][1]["tagNumber"] == "TAG-001"
        assert report_dict["targetInstrumentsOrdered"][1].get("instrument") is not None

    @pytest.mark.asyncio
    async def test_load_report_with_custom_data(self, db_session):
        """customData 付きレポートをロード"""
        company = await insert_company(db_session, id=uuid.UUID(UUID_COMPANY_1))
        site = await insert_site(
            db_session, id=uuid.UUID(UUID_SITE_1), company_id=company.id
        )
        instrument = await insert_instrument(
            db_session, id=uuid.UUID(UUID_INSTRUMENT_1), company_id=company.id
        )

        report = await insert_report(
            db_session,
            company_id=company.id,
            report_type="inspection",
            custom_data={"year": 2024, "inspectionType": "annual"},
        )

        db_session.add(
            ReportSite(
                report_id=report.id, site_id=site.id, role_key="main", sort_order=0
            )
        )
        db_session.add(
            TargetInstrument(
                id=uuid.UUID(UUID_TARGET_1),
                report_id=report.id,
                instrument_id=instrument.id,
                sort_order=0,
            )
        )
        await db_session.flush()

        report_id = await get_first_report_id(db_session)
        ctx = await load_report_context(db_session, report_id)
        assert ctx is not None
        report_dict = ctx.model_dump(by_alias=True, mode="python")

        assert "customData" in report_dict
        assert report_dict["customData"].get("year") == 2024
        assert report_dict["customData"].get("inspectionType") == "annual"

    @pytest.mark.asyncio
    async def test_load_report_with_used_parts(self, db_session):
        """使用部品付きレポートをロード"""
        company = await insert_company(db_session)
        part = await insert_part(
            db_session, id=uuid.UUID(UUID_PART_1), company_id=company.id
        )
        report = await insert_report(db_session, company_id=company.id)

        db_session.add(
            UsedPart(
                id=uuid.UUID(UUID_USED_PART_1),
                report_id=report.id,
                part_id=part.id,
                quantity=5,
                notes="Replaced",
                sort_order=0,
            )
        )
        await db_session.flush()

        report_id = await get_first_report_id(db_session)
        ctx = await load_report_context(db_session, report_id)
        assert ctx is not None
        report_dict = ctx.model_dump(by_alias=True, mode="python")

        assert "usedParts" not in report_dict
        assert len(report_dict["usedPartsOrdered"]) == 2
        assert report_dict["usedPartsOrdered"][0] is None
        assert "usedPartPrimary" in report_dict
        assert report_dict["usedPartPrimary"] == report_dict["usedPartsOrdered"][1]
        assert report_dict["usedPartsOrdered"][1]["quantity"] == 5
        assert report_dict["usedPartsOrdered"][1].get("part") is not None

    @pytest.mark.asyncio
    async def test_load_report_with_owned_instruments(self, db_session):
        """所有計器付きレポートをロード"""
        company = await insert_company(db_session, id=uuid.UUID(UUID_COMPANY_1))
        instrument = await insert_instrument(
            db_session, id=uuid.UUID(UUID_INSTRUMENT_1), company_id=company.id
        )
        owned_instrument = await insert_owned_instrument(
            db_session,
            id=uuid.UUID(UUID_OWNED_1),
            company_id=company.id,
            instrument_id=instrument.id,
            management_number="MGT-001",
        )
        report = await insert_report(db_session, company_id=company.id)

        db_session.add(
            ReportOwnedInstrument(
                report_id=report.id,
                owned_instrument_id=owned_instrument.id,
                sort_order=0,
            )
        )
        await db_session.flush()

        report_id = await get_first_report_id(db_session)
        ctx = await load_report_context(db_session, report_id)
        assert ctx is not None
        report_dict = ctx.model_dump(by_alias=True, mode="python")

        assert "reportOwnedInstruments" not in report_dict
        assert "reportOwnedInstrumentsOrdered" in report_dict
        assert len(report_dict["reportOwnedInstrumentsOrdered"]) == 2
        assert report_dict["reportOwnedInstrumentsOrdered"][0] is None
        assert "reportOwnedInstrumentPrimary" in report_dict
        assert (
            report_dict["reportOwnedInstrumentPrimary"]
            == report_dict["reportOwnedInstrumentsOrdered"][1]
        )
        assert len(report_dict["reportOwnedInstrumentsByOwnedInstrumentId"]) == 1
        roi = next(
            iter(report_dict["reportOwnedInstrumentsByOwnedInstrumentId"].values())
        )
        assert roi.get("ownedInstrument") is not None

    @pytest.mark.asyncio
    async def test_load_report_masters_include_all(self, db_session):
        """マスターデータが全て含まれることを確認"""
        company = await insert_company(
            db_session, id=uuid.UUID(UUID_COMPANY_1), name="Company"
        )
        instrument = await insert_instrument(
            db_session, id=uuid.UUID(UUID_INSTRUMENT_1), company_id=company.id
        )
        await insert_owned_instrument(
            db_session,
            id=uuid.UUID(UUID_OWNED_1),
            company_id=company.id,
            instrument_id=instrument.id,
        )

        await insert_report(db_session, company_id=company.id)

        report_id = await get_first_report_id(db_session)
        ctx = await load_report_context(db_session, report_id)
        assert ctx is not None
        report_dict = ctx.model_dump(by_alias=True, mode="python")

        # 再帰的オブジェクトグラフとして Report ルートに全関連が論理キー・Ordered で参照可能であることを確認
        assert report_dict.get("company") is not None
        assert "reportWorkers" not in report_dict
        assert "targetInstruments" not in report_dict
        assert "reportOwnedInstruments" not in report_dict
        assert "reportWorkersByRole" in report_dict
        assert "targetInstrumentsByTagNumber" in report_dict
        assert len(report_dict.get("reportWorkersOrdered") or []) <= 1
        assert report_dict["company"]["name"] == "Company"

    @pytest.mark.asyncio
    async def test_load_report_context_minimal_scope(self, db_session):
        """scope=MINIMAL のとき Report と company のみロードし、他リレーションは読まない"""
        company = await insert_company(db_session, name="Minimal Co")
        await insert_report(
            db_session, company_id=company.id, report_title="Minimal Report"
        )

        report_id = await get_first_report_id(db_session)
        ctx = await load_report_context(db_session, report_id, scope=LoadScope.MINIMAL)
        assert ctx is not None
        report_dict = ctx.model_dump(by_alias=True, mode="python")
        assert report_dict.get("reportTitle") == "Minimal Report"
        assert report_dict.get("company", {}).get("name") == "Minimal Co"
        # MINIMAL では配列リレーションをロードしないため、キーマップは空
        assert "reportWorkers" not in report_dict
        assert "targetInstruments" not in report_dict
        assert report_dict.get("reportClientsByCompanyId") == {}
        assert report_dict.get("reportWorkersByWorkerId") == {}
