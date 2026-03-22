"""
汎用 CRUD ルーター ファクトリ。

make_crud_router() にモデルとスキーマを渡すだけで
GET(一覧) / POST(作成) / PUT(更新) / DELETE(削除) の
エンドポイントを持つ APIRouter を生成する。

URL パスパラメータは統一して `{item_id}` を使用する。
（例: PUT /companies/{item_id}）
"""

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

from database import get_session
from services.crud.base import (
    create_entity,
    delete_entity,
    list_entities,
    update_entity,
)


def make_crud_router(
    *,
    model: type[SQLModel],
    create_schema: type[BaseModel],
    update_schema: type[BaseModel],
    prefix: str,
    tags: list[str],
    label: str,
    on_delete: Callable[[AsyncSession, Any], Awaitable[None]] | None = None,
) -> APIRouter:
    """
    汎用 CRUD エンドポイント群を持つ APIRouter を生成して返す。

    Parameters
    ----------
    model         : SQLModel サブクラス（テーブルモデル）
    create_schema : POST リクエストボディの Pydantic スキーマ
    update_schema : PUT リクエストボディの Pydantic スキーマ
    prefix        : URL プレフィックス（例: "/companies"）
    tags          : OpenAPI タグ
    label         : エラーメッセージ用日本語名（例: "会社"）
    on_delete     : 削除前に実行する非同期フック (session, item_id) -> None。
                    外部キー制約による関連レコードの手動削除などに使用する。
    """
    router = APIRouter(tags=tags)

    # --- GET: 一覧取得 ---
    @router.get(prefix)
    async def list_items(session: AsyncSession = Depends(get_session)):
        return await list_entities(session, model)

    list_items.__name__ = f"list_{prefix.lstrip('/').replace('-', '_')}"

    # --- POST: 新規作成 ---
    @router.post(prefix)
    async def create_item(
        data: create_schema,  # type: ignore[valid-type]
        session: AsyncSession = Depends(get_session),
    ):
        fields = data.model_dump(exclude_none=True, exclude={"id"})
        return await create_entity(session, model, **fields)

    create_item.__name__ = f"create_{prefix.lstrip('/').replace('-', '_').rstrip('s')}"

    # --- PUT: 更新 ---
    @router.put(f"{prefix}/{{item_id}}")
    async def update_item(
        item_id: UUID,
        data: update_schema,  # type: ignore[valid-type]
        session: AsyncSession = Depends(get_session),
    ):
        fields = data.model_dump(exclude_none=True, exclude={"id"})
        result = await update_entity(session, model, item_id, **fields)
        if result is None:
            raise HTTPException(status_code=404, detail=f"{label}が見つかりません。")
        return result

    update_item.__name__ = f"update_{prefix.lstrip('/').replace('-', '_').rstrip('s')}"

    # --- DELETE: 削除 ---
    @router.delete(f"{prefix}/{{item_id}}")
    async def delete_item(
        item_id: UUID,
        session: AsyncSession = Depends(get_session),
    ):
        if on_delete is not None:
            await on_delete(session, item_id)
        ok = await delete_entity(session, model, item_id)
        if not ok:
            raise HTTPException(status_code=404, detail=f"{label}が見つかりません。")
        return {"ok": True, "message": f"{label} ID={item_id} を削除しました。"}

    delete_item.__name__ = f"delete_{prefix.lstrip('/').replace('-', '_').rstrip('s')}"

    return router
