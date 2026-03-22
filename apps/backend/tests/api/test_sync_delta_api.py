"""
データ同期API（アップロード・ダウンロード）の統合テスト

移行元: test_api_upload.py
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

# テスト用の固定UUID
TEST_COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
TEST_REPORT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


class TestDeltaSync:
    """GET /api/sync/delta のテスト（差分同期）"""

    async def test_get_delta_when_db_empty_returns_200(
        self, client: AsyncClient
    ) -> None:
        """空のDBから差分同期"""
        response = await client.get(
            "/api/sync/delta",
            params={"since": "2020-01-01T00:00:00Z"},
        )

        assert response.status_code == 200
        data = response.json()

        # メタ情報の確認
        assert "_meta" in data
        assert data["_meta"]["syncType"] == "delta"
        assert data["_meta"]["reportCount"] == 0

        # 空のリストが返る
        assert data["reports"] == []
        assert data["companies"] == []

    async def test_get_delta_after_upload_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """
        差分同期が正しく機能することを検証する。
        """
        from datetime import datetime, timedelta

        from tests.factories import insert_report

        # since より後の updated_at を設定
        since_time = datetime.utcnow() - timedelta(hours=1)
        await insert_report(
            db_session,
            updated_at=datetime.utcnow(),
        )

        # 差分同期でレポートを取得
        delta_response = await client.get(
            "/api/sync/delta",
            params={"since": since_time.isoformat() + "Z"},
        )
        assert delta_response.status_code == 200
        data = delta_response.json()

        assert data["_meta"]["reportCount"] >= 1

    async def test_get_delta_with_masters_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """マスターデータを含む差分同期"""
        from datetime import datetime, timedelta

        from tests.factories import insert_report

        since_time = datetime.utcnow() - timedelta(hours=1)
        await insert_report(
            db_session,
            updated_at=datetime.utcnow(),
        )

        # マスターを含めて差分同期
        response = await client.get(
            "/api/sync/delta",
            params={"since": since_time.isoformat() + "Z", "include_master": "true"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["companies"]) >= 1

    async def test_get_delta_without_masters_returns_200(
        self, client: AsyncClient
    ) -> None:
        """マスターデータなしの差分同期"""
        response = await client.get(
            "/api/sync/delta",
            params={"since": "2020-01-01T00:00:00Z", "include_master": "false"},
        )

        assert response.status_code == 200
        data = response.json()
        # マスターは空
        assert data["companies"] == []
        assert data["workers"] == []

    async def test_get_delta_with_invalid_date_returns_422(
        self, client: AsyncClient
    ) -> None:
        """不正な日時形式でのリクエスト"""
        response = await client.get(
            "/api/sync/delta",
            params={"since": "invalid-date"},
        )

        assert response.status_code == 400

    async def test_get_delta_without_since_returns_422(
        self, client: AsyncClient
    ) -> None:
        """sinceパラメータなしでのリクエスト"""
        response = await client.get("/api/sync/delta")

        assert response.status_code == 422  # バリデーションエラー

    async def test_get_delta_with_metadata_returns_200(
        self, client: AsyncClient
    ) -> None:
        """メタ情報が正しく返されるか"""
        response = await client.get(
            "/api/sync/delta",
            params={"since": "2020-01-01T00:00:00Z"},
        )

        assert response.status_code == 200
        data = response.json()

        meta = data["_meta"]
        assert meta["syncType"] == "delta"
        assert "since" in meta
        assert "syncedAt" in meta
        assert "reportCount" in meta

    async def test_get_delta_with_timezone_returns_200(
        self, client: AsyncClient
    ) -> None:
        """タイムゾーン付き日時の処理"""
        # UTC
        response = await client.get(
            "/api/sync/delta",
            params={"since": "2020-01-01T00:00:00Z"},
        )
        assert response.status_code == 200

        # タイムゾーンオフセット付き
        response = await client.get(
            "/api/sync/delta",
            params={"since": "2020-01-01T09:00:00+09:00"},
        )
        assert response.status_code == 200
