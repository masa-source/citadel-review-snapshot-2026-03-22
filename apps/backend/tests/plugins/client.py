from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
)

from database import get_session
from main import app

# =============================================================================
# AsyncClient Fixture
# =============================================================================


@pytest_asyncio.fixture(scope="function")
async def client(
    db_session: AsyncSession,
    db_engine: Any,
    test_session_maker: async_sessionmaker[AsyncSession],
    test_db_url: str,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncGenerator[AsyncClient, None]:
    """
    FastAPI アプリに対するテスト用 AsyncClient。
    get_session をテスト用セッションでオーバーライドし、テストごとにロールバックを保証する。
    """

    async def override_get_session_inner() -> AsyncGenerator[AsyncSession, None]:
        # 並列リクエストテスト用の特別モード。
        # 同一セッションでの並列操作はエラーになるため、リクエストごとに独立したセッションを発行する。
        # ※このモードで発行されたリクエスト内で commit() されたデータは SAVEPOINT 外となるため、
        #   テスト側で明示的なクリーンアップ (TRUNCATE等) が必要。
        if getattr(app, "_force_new_session_per_request", False):
            async with test_session_maker() as session:
                yield session
        else:
            # 通常モード: pytest フィクスチャが管理するセッション（SAVEPOINT ロールバック対応）を使用。
            yield db_session

    # 依存関係をオーバーライド
    app.dependency_overrides[get_session] = override_get_session_inner

    # database モジュールなどのエンジンとセッションメーカーをテスト用に差し替え
    import database
    import main

    monkeypatch.setattr(database, "engine", db_engine)
    monkeypatch.setattr(database, "async_session_maker", test_session_maker)
    monkeypatch.setattr(main, "engine", db_engine)
    monkeypatch.setattr(main, "async_session_maker", test_session_maker)

    # 依存関係をオーバーライド（直接 get_session を差し替えるのが最も確実）
    app.dependency_overrides[get_session] = override_get_session_inner

    # lifespan 内の DB 初期化がテストデータと衝突するため、テスト時は DB 初期化をスキップさせる。
    # ここでは lifespan 関数自体をラップして DB 処理を無効化する。

    @asynccontextmanager
    async def dummy_lifespan(app_inner):
        yield

    monkeypatch.setattr(app.router, "lifespan_context", dummy_lifespan)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    # オーバーライドをクリア
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def seeded_db_session(db_session: AsyncSession) -> AsyncSession:
    """
    APIを経由せず、サービス層を直接呼び出して高速にテストデータを投入するフィクスチャ。
    既存コードへの影響を最小化するために Factory パターンで必要最小限のデータセットを構築します。
    """
    from datetime import datetime

    from tests.factories import (
        insert_company,
        insert_instrument,
        insert_part,
        insert_report,
        insert_schema_definition,
        insert_site,
        insert_target_instrument,
        insert_worker,
    )

    # 既存テストのアサーションと互換性を持つように特定の名称で生成
    company = await insert_company(db_session, name="テスト会社")
    await insert_worker(db_session, company_id=company.id)
    await insert_site(db_session, company_id=company.id)
    await insert_part(db_session, company_id=company.id)
    instrument = await insert_instrument(db_session, company_id=company.id)

    schema = await insert_schema_definition(db_session)
    report = await insert_report(
        db_session,
        company_id=company.id,
        schema_id=schema.id,
        report_title="テストレポート",
        report_type="作業報告書",
        updated_at=datetime.utcnow(),
    )
    await insert_target_instrument(
        db_session,
        report_id=report.id,
        instrument_id=instrument.id,
        schema_id=schema.id,
    )

    await db_session.flush()
    return db_session


@pytest_asyncio.fixture(scope="function")
async def seeded_client(
    client: AsyncClient, seeded_db_session: AsyncSession
) -> AsyncGenerator[AsyncClient, None]:
    """シードデータが投入済みの AsyncClient（高速版）"""
    yield client


@pytest_asyncio.fixture(scope="function")
async def client_no_db() -> AsyncGenerator[AsyncClient, None]:
    """
    DBセットアップなしの AsyncClient。
    DB に依存しないエンドポイントのテスト用。
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
