"""
upload_session.py のユニットテスト
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from services.upload_session import cleanup_expired_upload_sessions


class TestCleanupExpiredUploadSessions:
    """cleanup_expired_upload_sessions の JSONDecodeError / PermissionError 時も続行することを検証。"""

    def test_meta_json_decode_error_continues_without_crash(
        self, worker_tmp_dir: Path
    ) -> None:
        """meta.json が壊れている（JSONDecodeError）場合でもクラッシュせず続行する。"""
        base = worker_tmp_dir / "upload_sessions"
        base.mkdir(parents=True, exist_ok=True)
        session_dir = base / "some-session"
        session_dir.mkdir(exist_ok=True)
        (session_dir / "meta.json").write_text("not valid json {", encoding="utf-8")

        with patch("services.upload_session._get_base_dir", return_value=base):
            count = cleanup_expired_upload_sessions(base_path=worker_tmp_dir)
        assert count >= 0

    def test_rmtree_permission_error_continues_without_crash(
        self, worker_tmp_dir: Path
    ) -> None:
        """削除時に PermissionError が発生してもクラッシュせず続行する。"""
        base = worker_tmp_dir / "upload_sessions"
        base.mkdir(parents=True, exist_ok=True)
        session_dir = base / "expired-session"
        session_dir.mkdir(exist_ok=True)
        meta = {"expiresAt": "2000-01-01T00:00:00Z", "mode": "full"}
        (session_dir / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False), encoding="utf-8"
        )

        with (
            patch("services.upload_session._get_base_dir", return_value=base),
            patch("services.upload_session.is_session_expired", return_value=True),
            patch("shutil.rmtree", side_effect=PermissionError("Access denied")),
        ):
            count = cleanup_expired_upload_sessions(base_path=worker_tmp_dir)
        assert count == 0
