"""
テンプレートディレクトリ管理および一時ファイルクリーンアップのテスト
"""

import time
from pathlib import Path
from unittest.mock import MagicMock

from main import should_cleanup_item


class TestGetAssetsTemplatesDir:
    """get_assets_templates_dir のテスト"""

    def test_returns_path_object(self) -> None:
        """戻り値が Path オブジェクトであることを確認"""
        from utils.paths import get_assets_templates_dir

        path = get_assets_templates_dir()
        assert isinstance(path, Path)

    def test_default_path_structure(self) -> None:
        """デフォルトのパス構造を確認"""
        from utils.paths import get_assets_templates_dir

        path = get_assets_templates_dir()
        assert "templates" in str(path)


class TestCleanupLogic:
    """should_cleanup_item のロジックテスト（副作用なし・並列実行でも安定）"""

    def test_should_cleanup_old_file(self):
        """24時間以上前のファイルは削除対象"""
        item = MagicMock(spec=Path)
        item.name = "old.txt"
        item.stat.return_value.st_mtime = 1000.0
        now = 1000.0 + (25 * 3600)  # 25時間後
        assert should_cleanup_item(item, now, max_age_hours=24) is True

    def test_should_keep_recent_file(self):
        """24時間以内のファイルは保持"""
        item = MagicMock(spec=Path)
        item.name = "recent.txt"
        item.stat.return_value.st_mtime = 1000.0
        now = 1000.0 + (23 * 3600)  # 23時間後
        assert should_cleanup_item(item, now, max_age_hours=24) is False

    def test_should_keep_staging_dir(self):
        """staging ディレクトリは古くても保持"""
        item = MagicMock(spec=Path)
        item.name = "staging"
        item.stat.return_value.st_mtime = 1000.0
        now = 1000.0 + (100 * 3600)
        assert should_cleanup_item(item, now, max_age_hours=24) is False

    def test_should_keep_upload_sessions_dir(self):
        """upload_sessions ディレクトリは保持"""
        item = MagicMock(spec=Path)
        item.name = "upload_sessions"
        item.stat.return_value.st_mtime = 1000.0
        now = 1000.0 + (100 * 3600)
        assert should_cleanup_item(item, now, max_age_hours=24) is False

    def test_handle_stat_error(self):
        """stat 失敗時は削除しない（安全側）"""
        item = MagicMock(spec=Path)
        item.stat.side_effect = OSError()
        assert should_cleanup_item(item, time.time(), max_age_hours=24) is False


class TestAllowedOrigins:
    """ALLOWED_ORIGINS 環境変数のテスト"""

    def test_default_origins_exist(self) -> None:
        """デフォルトのオリジン設定が存在することを確認"""
        import main

        assert "http://localhost:3000" in main.ALLOWED_ORIGINS
        assert "http://localhost:3001" in main.ALLOWED_ORIGINS
