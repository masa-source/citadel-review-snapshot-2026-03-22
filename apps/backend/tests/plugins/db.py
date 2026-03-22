import os
from collections.abc import AsyncGenerator
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

# =============================================================================
# テスト用データベース構成 (pytest-xdist 対応)
# =============================================================================


@pytest.fixture(scope="session")
def worker_id(request: pytest.FixtureRequest) -> str:
    """pytest-xdist のワーカーIDを取得。単一実行時は 'master'。"""
    if hasattr(request.config, "workerinput"):
        return request.config.workerinput["workerid"]
    return "master"


@pytest.fixture(scope="session")
def base_db_url(request: pytest.FixtureRequest) -> str:
    """
    環境変数 `DATABASE_URL` または `TEST_DATABASE_URL` からベースDB URLを取得。
    Testcontainers による一時サーバは conftest.py のマスターノードで起動済。
    """
    url = os.getenv("TEST_DATABASE_URL", "") or os.getenv("DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "TEST_DATABASE_URL is not set. Did Testcontainers fail to start in conftest.py?"
        )
    return url


@pytest.fixture(scope="session")
def test_db_url(worker_id: str, base_db_url: str) -> str:
    """
    ワーカーごとに独立した PostgreSQL データベースの URL を生成する。
    """
    from sqlalchemy.engine.url import make_url

    # 同期エンジンのために非同期ドライバの場合は除去
    parsed_base = make_url(base_db_url)
    sync_url = parsed_base.set(drivername="postgresql").render_as_string(
        hide_password=False
    )

    # ワーカー用のDBを作成
    db_name = f"testdb_{worker_id}"
    engine = create_engine(sync_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS {db_name}"))
        conn.execute(text(f"CREATE DATABASE {db_name}"))

    # asyncpg 用のURLに変換して返す
    async_url = parsed_base.set(drivername="postgresql+asyncpg", database=db_name)
    return async_url.render_as_string(hide_password=False)


@pytest_asyncio.fixture(scope="session")
async def db_engine(test_db_url: str) -> AsyncGenerator[Any, None]:
    """ワーカープロセスの生存期間中、単一のエンジンを維持する。"""
    engine_kw: dict[str, Any] = {
        "echo": False,
        "future": True,
        "poolclass": NullPool,
    }

    engine = create_async_engine(test_db_url, **engine_kw)

    # ワーカー開始時に1度だけすべてのテーブルを作成する
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_connection(
    db_engine: Any, test_db_url: str
) -> AsyncGenerator[AsyncConnection, None]:
    """テストごとに独立したDB接続を維持する（初期化は db_engine にて完了済）。"""
    async with db_engine.connect() as conn:
        yield conn


@pytest_asyncio.fixture(scope="session")
async def test_session_maker(db_engine: Any) -> async_sessionmaker[AsyncSession]:
    """ワーカープロセス用のセッションメーカー。"""
    return async_sessionmaker(
        db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )


# =============================================================================
# Database Fixtures (Function Scope)
# =============================================================================


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_database() -> AsyncGenerator[None, None]:
    """下位互換性のための session ダミー。テーブル作成は db_connection に統合済。"""
    yield


@pytest_asyncio.fixture(scope="function")
async def db_session(
    db_connection: AsyncConnection,
    request: pytest.FixtureRequest,
) -> AsyncGenerator[AsyncSession, None]:
    """
    テスト用DBセッション。
    接続レベルで SAVEPOINT を開始し、テスト終了時にロールバックすることで、
    セッション内での commit() を物理的な DB 保存から保護する。
    """
    from sqlalchemy import event

    # 接続レベルでの SAVEPOINT 開始
    nested = await db_connection.begin_nested()

    session = AsyncSession(
        bind=db_connection,
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
    )

    # アプリ側が session.commit() を呼んだ際に SAVEPOINT を再開させるためのリスナー
    @event.listens_for(session.sync_session, "after_transaction_end")
    def restart_savepoint(session_inner, transaction):
        if session_inner.is_active and not session_inner.in_nested_transaction():
            session_inner.begin_nested()

    # セッション内での最初の SAVEPOINT を開始
    await session.begin()

    try:
        yield session
    finally:
        # セッションを閉じる
        await session.close()
        # テスト終了時に必ずロールバックしてデータを破棄
        if nested.is_active:
            await nested.rollback()


@pytest_asyncio.fixture(scope="function", autouse=True)
async def init_database(db_connection: AsyncConnection) -> AsyncGenerator[None, None]:
    """下位互換性のためのダミー。実体は db_connection に移行。"""
    yield


@pytest_asyncio.fixture(scope="function")
async def setup_db(db_session: AsyncSession) -> AsyncGenerator[None, None]:
    """下位互換性のため残置。実体は db_session によるロールバック管理に移行。"""
    yield
