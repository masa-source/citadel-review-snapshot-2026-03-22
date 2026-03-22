import pytest

from services.binder import _render_cell_template
from services.db_loader import load_report_context
from tests.factories import (
    insert_company,
    insert_instrument,
    insert_report,
    insert_report_worker,
    insert_target_instrument,
    insert_worker,
)


def _resolve_in_ctx(ctx: dict, path: str):
    """
    ドット・インデックス記法でコンテキストから値を取得する。
    """
    normalized = str(path).replace("[", ".").replace("]", "")
    parts = normalized.strip().split(".")
    current = ctx
    for p in parts:
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(p)
        elif isinstance(current, list):
            try:
                idx = int(p)
                current = current[idx] if 0 <= idx < len(current) else None
            except ValueError:
                return None
        else:
            return None
    return (
        str(current)
        if current is not None and not isinstance(current, (dict, list))
        else current
    )


@pytest.mark.asyncio
class TestPlaceholderInjection:
    """初回生成時のプレースホルダ解決を検証するクラス"""

    async def test_placeholder_injection_with_real_context(self, db_session):
        """load_report_context で取得した実コンテキストに対して主要なプレースホルダが解決されること"""
        company = await insert_company(db_session)
        worker = await insert_worker(db_session, company_id=company.id, name="作業者A")
        instr = await insert_instrument(
            db_session, company_id=company.id, name="Test Instrument"
        )

        report = await insert_report(
            db_session,
            company_id=company.id,
            report_title="Test Report",
            custom_data={"year": 2024, "inspectionType": "annual"},
        )
        await insert_report_worker(
            db_session,
            report_id=report.id,
            worker_id=worker.id,
            worker_role="leader",
            sort_order=0,
        )
        await insert_target_instrument(
            db_session,
            report_id=report.id,
            instrument_id=instr.id,
            tag_number="TAG-001",
            sort_order=0,
        )

        report_ctx_model = await load_report_context(db_session, report.id)
        ctx = report_ctx_model.model_dump(by_alias=True, mode="python")

        # 主要なパターンの検証
        cases = [
            "reportTitle",
            "company.name",
            "reportWorkerPrimary.worker.name",
            "targetInstrumentPrimary.tagNumber",
            "customData.year",
            "reportWorkersOrdered[1].worker.name",
            "targetInstrumentsByTagNumber['TAG-001'].tagNumber",
        ]

        for expr in cases:
            template = "{{ " + expr + " }}"
            rendered = _render_cell_template(template, ctx)
            assert rendered != template, (
                f"Placeholder {expr} did not resolve: {rendered}"
            )
            assert rendered is not None and rendered != "None"


@pytest.mark.asyncio
class TestPlaceholderStability:
    """編集・同期・並べ替えシミュレーション後のプレースホルダ安定性を検証するクラス"""

    async def test_placeholder_stability_after_reorder(self, db_session):
        """
        配列の並び順を逆にして上書きインポートした後でも、キー参照プレースホルダが同じ実体を指し続けること。
        """
        company = await insert_company(db_session)
        worker1 = await insert_worker(db_session, company_id=company.id, name="作業者A")
        worker2 = await insert_worker(db_session, company_id=company.id, name="作業者B")
        instr = await insert_instrument(db_session, company_id=company.id)
        report = await insert_report(
            db_session, company_id=company.id, report_title="初回"
        )

        rw1 = await insert_report_worker(
            db_session,
            report_id=report.id,
            worker_id=worker1.id,
            role_key="leader",
            worker_role="leader",
            sort_order=0,
        )
        rw2 = await insert_report_worker(
            db_session,
            report_id=report.id,
            worker_id=worker2.id,
            role_key="assistant",
            worker_role="assistant",
            sort_order=1,
        )

        ti1 = await insert_target_instrument(
            db_session,
            report_id=report.id,
            instrument_id=instr.id,
            tag_number="TAG-001",
            sort_order=0,
        )
        ti2 = await insert_target_instrument(
            db_session,
            report_id=report.id,
            instrument_id=instr.id,
            tag_number="TAG-002",
            sort_order=1,
        )

        ctx1_model = await load_report_context(db_session, report.id)
        ctx1 = ctx1_model.model_dump(by_alias=True, mode="python")

        # 初回の解決結果（キー参照）
        worker_key = f"reportWorkersByWorkerId.{worker1.id}.worker.name"
        target_key = f"targetInstrumentsById.{ti1.id}.tagNumber"

        val_worker1 = _resolve_in_ctx(ctx1, worker_key)
        val_target1 = _resolve_in_ctx(ctx1, target_key)
        assert val_worker1 == "作業者A"
        assert val_target1 == "TAG-001"

        # 2. 編集・並び順を逆にして上書き
        rw1.sort_order = 1
        rw2.sort_order = 0
        ti1.sort_order = 1
        ti2.sort_order = 0
        await db_session.flush()

        ctx2_model = await load_report_context(db_session, report.id)
        ctx2 = ctx2_model.model_dump(by_alias=True, mode="python")

        # 3. 検証
        # キー参照は安定していること
        assert _resolve_in_ctx(ctx2, worker_key) == "作業者A"
        assert _resolve_in_ctx(ctx2, target_key) == "TAG-001"

        # インデックス参照 [1] は並び替えにより実体が入れ替わっていること
        assert _resolve_in_ctx(ctx1, "reportWorkersOrdered[1].worker.name") == "作業者A"
        assert _resolve_in_ctx(ctx2, "reportWorkersOrdered[1].worker.name") == "作業者B"
        assert (
            _resolve_in_ctx(ctx1, "targetInstrumentsOrdered[1].tagNumber") == "TAG-001"
        )
        assert (
            _resolve_in_ctx(ctx2, "targetInstrumentsOrdered[1].tagNumber") == "TAG-002"
        )
