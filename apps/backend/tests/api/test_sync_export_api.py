"""
データ同期API（アップロード・ダウンロード）の統合テスト

移行元: test_api_upload.py
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

# テスト用の固定UUID
TEST_COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
TEST_REPORT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


class TestSyncExport:
    """POST /api/sync/export のテスト（カスタムエクスポート）"""

    async def test_post_export_with_masters_only_returns_200(
        self, client: AsyncClient
    ) -> None:
        """マスタデータのみエクスポート"""
        payload = {
            "includeCompanies": True,
            "includeWorkers": True,
            "includeInstruments": True,
            "includeParts": True,
            "includeOwnedInstruments": True,
            "targetReportIds": [],
            "exportMode": "edit",
        }
        response = await client.post("/api/sync/export", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert "companies" in data
        assert "workers" in data
        assert "reports" in data
        # レポートは空のはず
        assert data["reports"] == []

    async def test_post_export_with_reports_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """レポートを含むエクスポート"""
        from tests.factories import insert_report

        await insert_report(
            db_session,
            id=TEST_REPORT_ID,
        )

        payload = {
            "includeCompanies": True,
            "includeWorkers": True,
            "includeInstruments": False,
            "includeParts": False,
            "includeOwnedInstruments": False,
            "targetReportIds": [str(TEST_REPORT_ID)],
            "exportMode": "edit",
        }
        response = await client.post("/api/sync/export", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert "reports" in data
        assert isinstance(data["reports"], list)
        assert any(r["id"] == str(TEST_REPORT_ID) for r in data["reports"])
