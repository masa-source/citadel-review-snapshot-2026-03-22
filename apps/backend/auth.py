"""
APIキー認証モジュール

シンプルなAPIキー認証を提供する。
- Scout と Admin で異なるAPIキーを使用可能
- 開発時はAPIキーなしでも動作可能（環境変数で制御）
"""

import logging
import os

from fastapi.security import APIKeyHeader

logger = logging.getLogger(__name__)

# 環境変数から設定を読み込み
API_KEY_SCOUT = os.getenv("API_KEY_SCOUT")
API_KEY_ADMIN = os.getenv("API_KEY_ADMIN")
REQUIRE_API_KEY = os.getenv("REQUIRE_API_KEY", "false").lower() == "true"

# 有効なAPIキーのセット
VALID_API_KEYS: set[str] = set()
if API_KEY_SCOUT:
    VALID_API_KEYS.add(API_KEY_SCOUT)
if API_KEY_ADMIN:
    VALID_API_KEYS.add(API_KEY_ADMIN)

# APIキーヘッダーの定義
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def get_api_key_info(api_key: str | None) -> dict:
    """
    APIキーからクライアント情報を取得する。

    Returns:
        dict: {"client": "scout" | "admin" | "unknown", "authenticated": bool}
    """
    if not api_key:
        return {"client": "unknown", "authenticated": False}

    if api_key == API_KEY_SCOUT:
        return {"client": "scout", "authenticated": True}
    elif api_key == API_KEY_ADMIN:
        return {"client": "admin", "authenticated": True}
    elif api_key in VALID_API_KEYS:
        return {"client": "unknown", "authenticated": True}
    else:
        return {"client": "unknown", "authenticated": False}
