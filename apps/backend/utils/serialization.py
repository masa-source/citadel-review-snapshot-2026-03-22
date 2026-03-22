"""
シリアライズ用ヘルパー: snake_case ↔ camelCase、UUID/datetime の文字列化など。
db_loader, exporter, binder, schemas で共通利用。
Pydantic v2 の model_dump(by_alias=True, mode='json') に一本化する。
"""

from __future__ import annotations

import logging
import uuid as uuid_module
from datetime import datetime
from typing import Any

from sqlalchemy import inspect as sa_inspect
from sqlmodel import SQLModel

logger = logging.getLogger(__name__)


def to_camel(name: str) -> str:
    """snake_case を camelCase に変換する。先頭は小文字。"""
    parts = name.split("_")
    return parts[0].lower() + "".join(p.capitalize() for p in parts[1:])


def context_to_json_serializable(obj: Any) -> Any:
    """
    レポートコンテキスト（datetime 含む）を再帰的に走査し、
    JSON シリアライズ可能な形に変換する。API レスポンス用。
    """
    if obj is None:
        return None
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, uuid_module.UUID):
        return str(obj)
    if isinstance(obj, dict):
        return {k: context_to_json_serializable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [context_to_json_serializable(item) for item in obj]
    return obj


def _get_relationship_names(model_class: type) -> set[str]:
    """SQLModel のリレーション名一覧を返す（model_dump の exclude 用）。"""
    try:
        mapper = sa_inspect(model_class)
        if hasattr(mapper, "relationships"):
            return set(mapper.relationships.keys())
    except Exception as e:
        logger.warning("SQLModel リレーション取得エラー: %s", e)
    return set()


def model_to_export_dict(obj: Any, exclude: set[str] | None = None) -> dict[str, Any]:
    """
    SQLModel インスタンスを camelCase キー・JSON 互換値の辞書に変換する。
    Pydantic v2 の model_dump(by_alias=True, mode='json') を使用し、
    リレーション属性は除外する。openapi.json と実装が一致する。
    """
    if obj is None:
        return {}
    if not isinstance(obj, SQLModel):
        return {}
    excl = set(exclude) if exclude else set()
    excl |= _get_relationship_names(obj.__class__)
    return obj.model_dump(by_alias=True, mode="json", exclude=excl)


def model_to_context_dict(obj: Any, exclude: set[str] | None = None) -> dict[str, Any]:
    """
    レポートコンテキスト用。camelCase キー・Python ネイティブ型の辞書に変換する。
    mode='python' により datetime がそのまま残り、Jinja2 で strftime 等が使える。
    """
    if obj is None:
        return {}
    if not isinstance(obj, SQLModel):
        return {}
    excl = set(exclude) if exclude else set()
    excl |= _get_relationship_names(obj.__class__)
    return obj.model_dump(by_alias=True, mode="python", exclude=excl)
