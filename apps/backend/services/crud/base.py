"""
汎用 CRUD ヘルパー。
サービス層では HTTPException を投げず、None 返却で 404 を表現する。
"""

from typing import Any, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

M = TypeVar("M", bound=SQLModel)


async def get_one_or_none(
    session: AsyncSession,
    model: type[M],
    pk_value: UUID,
    pk_attr: str = "id",
) -> M | None:
    """主キーで 1 件取得。存在しなければ None。"""
    pk_column = getattr(model, pk_attr)
    result = await session.execute(select(model).where(pk_column == pk_value))
    return result.scalar_one_or_none()


async def list_entities(
    session: AsyncSession,
    model: type[M],
    order_by: str = "id",
) -> list[M]:
    """全件取得し、指定カラムでソートして返す。"""
    order_column = getattr(model, order_by)
    result = await session.execute(select(model).order_by(order_column))
    return list(result.scalars().all())


async def create_entity(
    session: AsyncSession,
    model: type[M],
    **kwargs: Any,
) -> M:
    """エンティティを作成し、DBに保存して返す。"""
    entity = model(**kwargs)
    session.add(entity)
    await session.commit()
    await session.refresh(entity)
    return entity


async def update_entity(
    session: AsyncSession,
    model: type[M],
    pk_value: UUID,
    pk_attr: str = "id",
    **kwargs: Any,
) -> M | None:
    """指定された主キーのエンティティを更新し、保存して返す。存在しなければNone。"""
    entity = await get_one_or_none(session, model, pk_value, pk_attr)
    if not entity:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(entity, key):
            setattr(entity, key, value)
    await session.commit()
    await session.refresh(entity)
    return entity


async def delete_entity(
    session: AsyncSession,
    model: type[M],
    pk_value: UUID,
    pk_attr: str = "id",
) -> bool:
    """指定された主キーのエンティティを削除する。存在しなければ False を返す。"""
    entity = await get_one_or_none(session, model, pk_value, pk_attr)
    if not entity:
        return False
    await session.delete(entity)
    await session.commit()
    return True
