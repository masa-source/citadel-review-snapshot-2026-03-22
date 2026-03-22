import uuid
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import (
    build_company_input,
    build_database_input,
    build_report_input,
    build_schema_definition_input,
    build_site_input,
    build_worker_input,
)

# =============================================================================
# Sample Data Fixtures
# =============================================================================

# テスト用の固定UUID（再現性のため固定値を使用）
SAMPLE_COMPANY_ID = "11111111-1111-1111-1111-111111111111"
SAMPLE_WORKER_ID = "22222222-2222-2222-2222-222222222222"


@pytest.fixture
def sample_company_data() -> dict[str, Any]:
    """テスト用の会社データ"""
    return {
        "name": "テスト株式会社",
        "department": "開発部",
        "postalCode": "100-0001",
        "address": "東京都千代田区1-1-1",
        "phone": "03-1234-5678",
        "fax": "03-1234-5679",
        "email": "test@example.com",
    }


@pytest.fixture
def sample_worker_data() -> dict[str, Any]:
    """テスト用の作業者データ"""
    return {
        "name": "山田太郎",
        "companyId": SAMPLE_COMPANY_ID,
        "sealImageUrl": "https://example.com/seal.png",
    }


@pytest.fixture
def sample_report_data() -> dict[str, Any]:
    """テスト用のレポートデータ"""
    return {
        "reportType": "作業報告書",
        "reportTitle": "テストレポート",
        "controlNumber": "TEST-001",
        "createdAt": "2026-01-01T00:00",
        "companyId": SAMPLE_COMPANY_ID,
    }


@pytest.fixture
def sample_database_input() -> dict[str, Any]:
    """テスト用の db.json 形式データ（UUID形式）。Polyfactory で無作為生成。"""
    company = build_company_input(id=uuid.UUID(SAMPLE_COMPANY_ID))
    worker = build_worker_input(id=uuid.UUID(SAMPLE_WORKER_ID), company_id=company.id)
    site = build_site_input(id=uuid.uuid4(), company_id=company.id)
    schema = build_schema_definition_input(id=uuid.uuid4())
    report = build_report_input(
        id=uuid.uuid4(), company_id=company.id, schema_id=schema.id
    )

    db_input = build_database_input(
        companies=[company],
        workers=[worker],
        sites=[site],
        schema_definitions=[schema],
        reports=[report],
        report_clients=[{"report_id": str(report.id), "company_id": str(company.id)}],
        report_workers=[
            {
                "id": str(uuid.uuid4()),
                "report_id": str(report.id),
                "worker_id": str(worker.id),
                "worker_role": "担当者",
            }
        ],
        report_sites=[
            {
                "id": str(uuid.uuid4()),
                "report_id": str(report.id),
                "site_id": str(site.id),
                "role_key": "main",
                "sort_order": 0,
            }
        ],
    )
    return db_input.model_dump(by_alias=True, mode="json")


@pytest_asyncio.fixture
async def setup_report_template(
    db_session: AsyncSession, worker_tmp_dir: Path, monkeypatch: pytest.MonkeyPatch
):
    """
    レポート生成テスト用のテンプレート構成をセットアップする。
    1. ReportFormat ("作業報告書") を作成。
    2. ReportTemplate (dummy file) を作成。
    3. 両者をリンク。
    4. get_assets_base を worker_tmp_dir に差し替え。
    """
    from tests.factories import (
        insert_report_format,
        insert_report_format_template,
        insert_report_template,
    )

    # assets base を worker_tmp_dir に
    monkeypatch.setattr("routers.reports.get_assets_base", lambda: worker_tmp_dir)

    # 検疫チェックをパスさせる（モック化）
    monkeypatch.setattr("routers.reports.verify_template_safety", AsyncMock())

    # テンプレートファイルの実体作成
    template_dir = worker_tmp_dir / "templates"
    template_dir.mkdir(parents=True, exist_ok=True)
    dummy_xlsx = template_dir / "dummy.xlsx"
    dummy_xlsx.touch()

    # DB レコード作成 (Factory経由)
    fmt = await insert_report_format(db_session, name="作業報告書")
    tpl = await insert_report_template(
        db_session, name="dummy_template", file_path="templates/dummy.xlsx"
    )
    await insert_report_format_template(
        db_session, report_format_id=fmt.id, report_template_id=tpl.id, sort_order=1
    )

    return tpl
