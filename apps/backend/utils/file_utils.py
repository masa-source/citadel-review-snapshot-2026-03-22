"""ファイル操作のヘルパー。"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def remove_file(path: Path) -> None:
    """レスポンス送信後に一時ファイルを削除する（BackgroundTask 用）。"""
    try:
        if path.exists():
            path.unlink()
    except OSError as err:
        logger.warning("一時ファイル削除エラー: %s", err)
