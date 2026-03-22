from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import (
    build_database_input,
    build_report_input,
)


class TestReportsAPI:
    """レポート関連APIの基本テスト"""

    async def test_get_reports_when_empty_returns_200_with_empty_list(
        self, client: AsyncClient
    ) -> None:
        """レポート一覧取得（空の状態）"""
        response = await client.get("/api/reports")
        assert response.status_code == 200
        assert response.json() == []

    async def test_get_companies_empty(self, client: AsyncClient) -> None:
        """会社一覧取得（空の状態）"""
        response = await client.get("/api/companies")
        assert response.status_code == 200
        assert response.json() == []

    async def test_get_workers_empty(self, client: AsyncClient) -> None:
        """作業者一覧取得（空の状態）"""
        response = await client.get("/api/workers")
        assert response.status_code == 200
        assert response.json() == []


class TestSyncUpload:
    """データ同期（アップロード）テスト"""

    async def test_sync_upload(self, client: AsyncClient) -> None:
        """db.json 形式のデータアップロード"""
        data = build_database_input().model_dump(by_alias=True, mode="json")
        response = await client.post("/api/sync/upload", json=data)
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert "counts" in data

    async def test_sync_upload_and_verify(self, client: AsyncClient) -> None:
        """アップロード後にデータを確認"""
        data = build_database_input(reports=[build_report_input()]).model_dump(
            by_alias=True, mode="json"
        )
        # アップロード
        upload_response = await client.post("/api/sync/upload", json=data)
        assert upload_response.status_code == 200

        # 会社一覧確認
        companies_response = await client.get("/api/companies")
        assert len(companies_response.json()) >= 1

        # レポート一覧確認
        reports_response = await client.get("/api/reports")
        assert len(reports_response.json()) >= 1


class TestSyncDownload:
    """データ同期（ダウンロード）テスト"""

    async def test_sync_download_empty(self, client: AsyncClient) -> None:
        """空のDBからダウンロード"""
        response = await client.get("/api/sync/download")
        assert response.status_code == 200
        data = response.json()
        # 必須キーの存在確認
        required_keys = [
            "companies",
            "workers",
            "instruments",
            "reports",
        ]
        for key in required_keys:
            assert key in data

    async def test_sync_download_with_data(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """データをアップロード後にダウンロード"""
        from tests.factories import insert_report

        await insert_report(db_session)

        # ダウンロード
        response = await client.get("/api/sync/download")
        assert response.status_code == 200
        data = response.json()
        assert len(data["companies"]) >= 1
        assert len(data["reports"]) >= 1
