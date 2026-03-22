"""
Importer 用ユーティリティ: ID 正規化・解決・スキーマ→モデル変換。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlmodel import SQLModel

# フロント ID -> DB ID のマッピング (テーブル名 -> { 入力id: db_id })
IdMap = dict[str, dict[Any, Any]]


def _id_for_import(optional_id: uuid.UUID | None, overwrite: bool) -> uuid.UUID:
    """overwrite 時は入力 id を保持（キー参照の安定化）。copy 時は常に新規 UUID（同一 payload 再送で重複しない）。"""
    if overwrite and optional_id is not None:
        return optional_id
    return uuid.uuid4()


def _id_for_master(optional_id: uuid.UUID | None) -> uuid.UUID:
    """マスタ用: 入力 id があればそのまま使い、なければ新規 UUID。キー参照・reportWorkersByWorkerId 等の安定化のため。"""
    return optional_id if optional_id is not None else uuid.uuid4()


def _resolve(id_map: IdMap, table: str, frontend_id: Any) -> Any:
    if frontend_id is None:
        return None
    return id_map.get(table, {}).get(frontend_id)


def _model_columns(model_class: type[SQLModel]) -> set[str]:
    """SQLModel のカラム名一覧（リレーション除く）"""
    return set(model_class.__table__.c.keys())  # type: ignore[union-attr]  # SQLModel/ORM の __table__.c 動的属性の型が未解決


def _schema_to_model_dict(
    schema_obj: Any, model_class: type[SQLModel]
) -> dict[str, Any]:
    """Pydantic スキーマのフィールドのうち、モデルに存在するカラムだけを dict で返す（動的マッピング）。
    id は呼び出し元で id= として渡すため、payload には含めない（二重渡し防止）。"""
    columns = _model_columns(model_class)
    return {
        k: getattr(schema_obj, k)
        for k in columns
        if hasattr(schema_obj, k) and k != "id"
    }
