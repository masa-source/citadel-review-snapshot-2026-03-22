"""
auth.py のユニットテスト

APIキー認証モジュールのテスト。
"""

import os
from unittest.mock import patch

import pytest

# テスト用の固定APIキー
TEST_SCOUT_KEY = "test-scout-key-12345"
TEST_ADMIN_KEY = "test-admin-key-67890"


class TestGetApiKeyInfo:
    """get_api_key_info() 関数のテスト"""

    @pytest.mark.normal
    def test_no_api_key(self) -> None:
        """APIキーがない場合"""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("API_KEY_SCOUT", None)
            os.environ.pop("API_KEY_ADMIN", None)
            # モジュールを再読み込み
            import importlib

            import auth

            importlib.reload(auth)

            result = auth.get_api_key_info(None)
            assert result["client"] == "unknown"
            assert result["authenticated"] is False

    @pytest.mark.normal
    def test_empty_api_key(self) -> None:
        """空のAPIキー"""
        import importlib

        import auth

        importlib.reload(auth)

        result = auth.get_api_key_info("")
        assert result["client"] == "unknown"
        assert result["authenticated"] is False

    @pytest.mark.normal
    def test_scout_api_key(self) -> None:
        """Scout APIキーの場合"""
        with patch.dict(
            os.environ,
            {"API_KEY_SCOUT": TEST_SCOUT_KEY, "API_KEY_ADMIN": TEST_ADMIN_KEY},
        ):
            import importlib

            import auth

            importlib.reload(auth)

            result = auth.get_api_key_info(TEST_SCOUT_KEY)
            assert result["client"] == "scout"
            assert result["authenticated"] is True

    @pytest.mark.normal
    def test_admin_api_key(self) -> None:
        """Admin APIキーの場合"""
        with patch.dict(
            os.environ,
            {"API_KEY_SCOUT": TEST_SCOUT_KEY, "API_KEY_ADMIN": TEST_ADMIN_KEY},
        ):
            import importlib

            import auth

            importlib.reload(auth)

            result = auth.get_api_key_info(TEST_ADMIN_KEY)
            assert result["client"] == "admin"
            assert result["authenticated"] is True

    @pytest.mark.error
    def test_invalid_api_key(self) -> None:
        """無効なAPIキーの場合"""
        with patch.dict(
            os.environ,
            {"API_KEY_SCOUT": TEST_SCOUT_KEY, "API_KEY_ADMIN": TEST_ADMIN_KEY},
        ):
            import importlib

            import auth

            importlib.reload(auth)

            result = auth.get_api_key_info("invalid-key")
            assert result["client"] == "unknown"
            assert result["authenticated"] is False
