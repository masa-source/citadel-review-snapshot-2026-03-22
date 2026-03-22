"""
PostgreSQL 非同期接続設定 (SQLModel + asyncpg).
環境変数 DATABASE_URL を読み込み、get_session で AsyncSession を提供する。
"""

import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# postgresql+asyncpg://user:password@host:port/dbname
# .env で DATABASE_URL が未設定の場合はデフォルト接続先を使用
_default_url = "postgresql+asyncpg://postgres:postgres@localhost:5432/report_binder"
DATABASE_URL = os.getenv("DATABASE_URL", _default_url).replace(
    "postgresql://", "postgresql+asyncpg://", 1
)

# E2E/ローカル: Docker の PostgreSQL は SSL 未対応のため、asyncpg の SSL を無効化
# （有効のままだと connection_lost で接続失敗する）
_is_e2e = os.getenv("PLAYWRIGHT_E2E_BACKEND") == "1"
_is_localhost = "localhost" in DATABASE_URL or "127.0.0.1" in DATABASE_URL
_connect_args = {"ssl": False} if (_is_e2e or _is_localhost) else {}

engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "0").lower() in ("1", "true", "yes"),
    future=True,
    connect_args=_connect_args,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI 依存関係: リクエストごとに AsyncSession を取得する。"""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
