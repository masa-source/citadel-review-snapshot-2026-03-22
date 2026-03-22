import asyncio
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text

from tests.factories import (
    build_company_input,
    build_database_input,
    build_report_input,
    build_worker_input,
)


def _base_payload(report_id: str, report_title: str) -> dict:
    """minimal_data をベースに report_id / report_title を差し替えたペイロード"""
    company = build_company_input()
    worker = build_worker_input(company_id=company.id)

    payload = build_database_input(
        companies=[company],
        workers=[worker],
        reports=[
            build_report_input(
                id=report_id,
                report_type="作業報告書",
                report_title=report_title,
                company_id=company.id,
            )
        ],
        report_clients=[{"report_id": str(report_id), "company_id": str(company.id)}],
        report_workers=[
            {
                "id": str(uuid.uuid4()),
                "report_id": str(report_id),
                "worker_id": str(worker.id),
                "worker_role": "担当者",
            }
        ],
    )
    return payload.model_dump(by_alias=True, mode="json")


@pytest_asyncio.fixture
async def parallel_execution_env(monkeypatch: pytest.MonkeyPatch, test_session_maker):
    """
    並列アップロードテスト用の安全な環境を提供するフィクスチャ。
    - Setup: APIがリクエストごとに独立したDBセッションを使用するようフラグを立てる
    - Teardown: テスト結果にかかわらず、フラグを元に戻し、物理的にコミットされたデータを確実に削除する
    """
    from main import app

    # Setup: 並列リクエスト用に独立セッションを強制
    monkeypatch.setattr(app, "_force_new_session_per_request", True, raising=False)

    yield

    # Teardown: 確実にクリーンアップを実行
    # cascade により companies に紐づく worker, report などのトランザクションデータも一括で削除される
    async with test_session_maker() as session:
        await session.execute(text("TRUNCATE TABLE companies CASCADE"))
        await session.commit()


class TestSyncConflict:
    """POST /api/sync/upload の競合・連続更新"""

    async def test_sequential_upload_same_id_no_500(
        self, client: AsyncClient, setup_db
    ) -> None:
        """同一 report id で連続アップロードしても 500 が発生しない"""
        report_id = str(uuid.uuid4())
        r1 = await client.post(
            "/api/sync/upload",
            json=_base_payload(report_id, "タイトル1"),
        )
        assert r1.status_code == 200, r1.text

        r2 = await client.post(
            "/api/sync/upload",
            json=_base_payload(report_id, "タイトル2"),
        )
        assert r2.status_code == 200, r2.text

        list_res = await client.get("/api/reports")
        assert list_res.status_code == 200
        reports = list_res.json()
        assert len(reports) >= 1

    @pytest.mark.asyncio
    async def test_parallel_upload_no_500(
        self,
        client: AsyncClient,
        parallel_execution_env,
    ) -> None:
        """異なるリソースで並列アップロードしても 500 が発生しない"""
        report_id_a = str(uuid.uuid4())
        report_id_b = str(uuid.uuid4())

        payload_a = _base_payload(report_id_a, "並列A")
        payload_b = _base_payload(report_id_b, "並列B")

        async def upload(json: dict):
            return await client.post("/api/sync/upload", json=json)

        results = await asyncio.gather(
            upload(payload_a),
            upload(payload_b),
            return_exceptions=True,
        )

        for i, res in enumerate(results):
            if isinstance(res, Exception):
                pytest.fail(f"upload {i} raised: {res}")
            assert res.status_code == 200, (
                f"upload {i} failed: {res.status_code} {res.text}"
            )
