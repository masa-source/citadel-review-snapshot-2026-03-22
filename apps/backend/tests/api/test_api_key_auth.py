"""
APIキー認証ミドルウェアの統合テスト

REQUIRE_API_KEY 環境変数による認証の動作を検証する。

注意: REQUIRE_API_KEY=true のテストは auth.py のユニットテスト (test_auth.py) で行う。
ここでは開発モード（REQUIRE_API_KEY=false）での統合テストを行う。
"""

import pytest
from httpx import AsyncClient


class TestApiKeyAuthDisabled:
    """REQUIRE_API_KEY=false（デフォルト）の場合のテスト"""

    async def test_no_api_key_allowed(self, client: AsyncClient) -> None:
        """APIキーなしでもアクセス可能"""
        response = await client.get("/api/reports")
        # 認証エラーではなく、正常なレスポンス（空リストなど）が返る
        assert response.status_code == 200

    async def test_invalid_api_key_allowed(self, client: AsyncClient) -> None:
        """無効なAPIキーでもアクセス可能（開発モード）"""
        response = await client.get(
            "/api/reports", headers={"X-API-Key": "invalid-key"}
        )
        assert response.status_code == 200

    async def test_docs_accessible(self, client: AsyncClient) -> None:
        """ドキュメントにアクセス可能"""
        response = await client.get("/docs")
        assert response.status_code == 200

    async def test_openapi_json_accessible(self, client: AsyncClient) -> None:
        """OpenAPI JSON にアクセス可能"""
        response = await client.get("/openapi.json")
        assert response.status_code == 200


class TestApiKeyHeader:
    """X-API-Key ヘッダーの処理テスト（開発モード）"""

    async def test_header_case_insensitive(self, client: AsyncClient) -> None:
        """ヘッダー名は大文字小文字を区別しない（HTTP 標準）"""
        # 小文字のヘッダー名でもアクセス可能
        response = await client.get("/api/reports", headers={"x-api-key": "any-key"})
        # 開発モードではアクセス可能
        assert response.status_code == 200

    async def test_empty_api_key(self, client: AsyncClient) -> None:
        """空のAPIキー"""
        response = await client.get("/api/reports", headers={"X-API-Key": ""})
        # 開発モードではアクセス可能
        assert response.status_code == 200

    async def test_with_valid_format_key(self, client: AsyncClient) -> None:
        """有効な形式のAPIキー"""
        response = await client.get(
            "/api/reports",
            headers={"X-API-Key": "abcd1234efgh5678ijkl9012mnop3456"},
        )
        assert response.status_code == 200


class TestSkipPaths:
    """認証をスキップするパスのテスト"""

    @pytest.mark.parametrize(
        "path",
        [
            "/docs",
            "/openapi.json",
            "/redoc",
            "/",
        ],
    )
    async def test_skip_paths_no_auth_required(
        self, client: AsyncClient, path: str
    ) -> None:
        """スキップパスは認証不要"""
        response = await client.get(path)
        # 401 以外のレスポンス（200, 404, 307 など）
        assert response.status_code != 401


class TestApiKeyWithDataOperations:
    """APIキーを使用したデータ操作テスト"""

    async def test_sync_upload_with_api_key(self, client: AsyncClient) -> None:
        """APIキー付きでデータアップロード"""
        from tests.factories import build_database_input

        data = build_database_input().model_dump(by_alias=True, mode="json")
        response = await client.post(
            "/api/sync/upload",
            json=data,
            headers={"X-API-Key": "test-key"},
        )
        assert response.status_code == 200

    async def test_sync_download_with_api_key(self, client: AsyncClient) -> None:
        """APIキー付きでデータダウンロード"""
        response = await client.get(
            "/api/sync/download",
            headers={"X-API-Key": "test-key"},
        )
        assert response.status_code == 200

    async def test_delta_sync_with_api_key(self, client: AsyncClient) -> None:
        """APIキー付きで差分同期"""
        response = await client.get(
            "/api/sync/delta",
            params={"since": "2020-01-01T00:00:00Z"},
            headers={"X-API-Key": "test-key"},
        )
        assert response.status_code == 200
