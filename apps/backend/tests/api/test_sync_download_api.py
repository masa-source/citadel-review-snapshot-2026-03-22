"""
データ同期API（アップロード・ダウンロード）の統合テスト

移行元: test_api_upload.py
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

# テスト用の固定UUID
TEST_COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
TEST_REPORT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


class TestSyncDownload:
    """GET /api/sync/download のテスト"""

    async def test_get_download_when_db_empty_returns_200(
        self, client: AsyncClient
    ) -> None:
        """空のDBからダウンロード"""
        response = await client.get("/api/sync/download")

        assert response.status_code == 200
        data = response.json()

        # 必須キーの存在確認
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
        ]
        for key in required_keys:
            assert key in data, f"Missing key: {key}"
            assert isinstance(data[key], list), f"{key} should be a list"

    async def test_get_download_after_upload_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """アップロード後にデータが正しく取得できるか"""
        from tests.factories import insert_report

        await insert_report(
            db_session,
            report_title="Download Test Report",
        )

        # ダウンロード
        download_response = await client.get("/api/sync/download")
        assert download_response.status_code == 200
        data = download_response.json()
        assert "reports" in data
        assert isinstance(data["reports"], list)
        assert any(r["reportTitle"] == "Download Test Report" for r in data["reports"])
