"""
demo_data.py のユニットテスト

デモデータの投入・削除・状態取得機能をテスト。
デモデータは data/demo_data.json から読み込む。
"""

import pytest

from services.demo_data import (
    DEMO_PREFIX,
    clear_demo_data,
    get_demo_status,
    load_demo_data,
    seed_demo_data,
)


def _expected_counts():
    """JSON で定義されたデモデータの件数（load_demo_data から取得）"""
    data = load_demo_data()
    return {
        "companies": len(data.companies),
        "workers": len(data.workers),
        "instruments": len(data.instruments),
        "parts": len(data.parts),
        "schema_definitions": len(data.schema_definitions),
        "sites": len(data.sites),
        "owned_instruments": len(data.owned_instruments),
        "reports": len(data.reports),
    }


class TestDemoDataConstants:
    """デモデータ定数・JSON 構造のテスト"""

    def test_demo_prefix(self) -> None:
        """デモプレフィックスが定義されている（スキーマの禁止文字 .[]{} を含まない）"""
        assert DEMO_PREFIX == "DEMO "

    def test_demo_json_companies_defined(self) -> None:
        """デモ会社データが JSON に定義されている"""
        data = load_demo_data()
        assert len(data.companies) >= 1
        for company in data.companies:
            assert (company.name or "").startswith(DEMO_PREFIX)

    def test_demo_json_workers_defined(self) -> None:
        """デモ作業者データが JSON に定義されている"""
        data = load_demo_data()
        assert len(data.workers) >= 1
        for worker in data.workers:
            assert (worker.name or "").startswith(DEMO_PREFIX)

    def test_demo_json_instruments_defined(self) -> None:
        """デモ計器データが JSON に定義されている"""
        data = load_demo_data()
        assert len(data.instruments) >= 1
        for instrument in data.instruments:
            assert (instrument.name or "").startswith(DEMO_PREFIX)

    def test_demo_json_parts_defined(self) -> None:
        """デモ部品データが JSON に定義されている"""
        data = load_demo_data()
        assert len(data.parts) >= 1
        for part in data.parts:
            assert (part.name or "").startswith(DEMO_PREFIX)

    def test_demo_json_schema_definitions_defined(self) -> None:
        """デモスキーマ定義が1件以上ある"""
        data = load_demo_data()
        assert len(data.schema_definitions) >= 1
        for definition in data.schema_definitions:
            assert definition.target_entity
            assert definition.version

    def test_demo_json_sites_defined(self) -> None:
        """デモ現場が1件以上あり、DEMO プレフィックスを持つ"""
        data = load_demo_data()
        assert len(data.sites) >= 1
        for site in data.sites:
            assert (site.name or "").startswith(DEMO_PREFIX)

    def test_demo_json_owned_instruments_defined(self) -> None:
        """デモ所有計器データが JSON に定義されている"""
        data = load_demo_data()
        assert len(data.owned_instruments) >= 1
        for owned in data.owned_instruments:
            assert (owned.equipment_name or "").startswith(DEMO_PREFIX)


class TestSeedDemoData:
    """seed_demo_data() 関数のテスト"""

    @pytest.mark.asyncio
    async def test_seed_creates_data(self, db_session) -> None:
        """デモデータが正しく作成される"""
        result = await seed_demo_data(db_session)

        assert result["success"] is True
        assert "counts" in result
        counts = result["counts"]
        expected = _expected_counts()

        assert counts["companies"] == expected["companies"]
        assert counts["workers"] == expected["workers"]
        assert counts["instruments"] == expected["instruments"]
        assert counts["parts"] == expected["parts"]
        assert counts["schema_definitions"] == expected["schema_definitions"]
        assert counts["sites"] == expected["sites"]
        assert counts["owned_instruments"] == expected["owned_instruments"]
        assert counts["reports"] == expected["reports"]

    @pytest.mark.asyncio
    async def test_seed_is_idempotent(self, db_session) -> None:
        """デモデータの投入は冪等（2回実行しても同じ結果）"""
        result1 = await seed_demo_data(db_session)
        counts1 = result1["counts"]

        result2 = await seed_demo_data(db_session)
        counts2 = result2["counts"]

        assert counts1["companies"] == counts2["companies"]
        assert counts1["workers"] == counts2["workers"]
        assert counts1["reports"] == counts2["reports"]

    @pytest.mark.asyncio
    async def test_seed_creates_related_data(self, db_session) -> None:
        """レポートに関連データが正しく作成される"""
        result = await seed_demo_data(db_session)
        counts = result["counts"]

        assert counts["reports"] >= 1


class TestClearDemoData:
    """clear_demo_data() 関数のテスト"""

    @pytest.mark.asyncio
    async def test_clear_removes_demo_data(self, db_session) -> None:
        """デモデータが正しく削除される"""
        await seed_demo_data(db_session)

        result = await clear_demo_data(db_session)

        assert result["success"] is True
        assert "counts" in result

        status = await get_demo_status(db_session)
        assert status["has_demo_data"] is False
        assert status["total"] == 0

    @pytest.mark.asyncio
    async def test_clear_on_empty_db(self, db_session) -> None:
        """空のDBで clear しても正常動作"""
        result = await clear_demo_data(db_session)

        assert result["success"] is True
        total = sum(result["counts"].values())
        assert total == 0

    @pytest.mark.asyncio
    async def test_clear_only_removes_demo_prefix(self, db_session) -> None:
        """デモプレフィックスを持つデータのみ削除される"""
        from models import Company

        normal_company = Company(name="通常の会社")
        db_session.add(normal_company)
        await db_session.commit()

        await seed_demo_data(db_session)
        await clear_demo_data(db_session)

        from sqlalchemy import select

        result = await db_session.execute(
            select(Company).where(Company.name == "通常の会社")
        )
        remaining = result.scalar_one_or_none()
        assert remaining is not None
        assert remaining.name == "通常の会社"


class TestGetDemoStatus:
    """get_demo_status() 関数のテスト"""

    @pytest.mark.asyncio
    async def test_status_empty_db(self, db_session) -> None:
        """空のDBでの状態取得"""
        result = await get_demo_status(db_session)

        assert result["has_demo_data"] is False
        assert result["total"] == 0
        assert "counts" in result
        assert result["counts"]["companies"] == 0
        assert result["counts"]["workers"] == 0
        assert result["counts"]["reports"] == 0

    @pytest.mark.asyncio
    async def test_status_with_demo_data(self, db_session) -> None:
        """デモデータ投入後の状態取得"""
        await seed_demo_data(db_session)

        result = await get_demo_status(db_session)
        expected = _expected_counts()

        assert result["has_demo_data"] is True
        assert result["total"] > 0
        assert result["counts"]["companies"] == expected["companies"]
        assert result["counts"]["workers"] == expected["workers"]
        assert result["counts"]["instruments"] == expected["instruments"]
        assert result["counts"]["reports"] == expected["reports"]
        assert result["counts"]["schema_definitions"] == expected["schema_definitions"]
        assert result["counts"]["sites"] == expected["sites"]

    @pytest.mark.asyncio
    async def test_status_after_clear(self, db_session) -> None:
        """デモデータ削除後の状態取得"""
        await seed_demo_data(db_session)
        await clear_demo_data(db_session)

        result = await get_demo_status(db_session)

        assert result["has_demo_data"] is False
        assert result["total"] == 0
