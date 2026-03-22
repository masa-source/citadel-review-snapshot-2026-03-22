"""
schemas.py のバリデーションが API で適用され、不正データで 422 Unprocessable Entity が返ることを検証する。
"""

from httpx import AsyncClient

from tests.factories import (
    build_company_input,
    build_database_input,
    build_report_input,
    build_schema_definition_input,
    build_site_input,
    build_worker_input,
)


def _valid_database_payload() -> dict:
    """バリデーション用の最小有効ペイロード。Polyfactory を利用。"""
    import uuid

    company = build_company_input(id=uuid.uuid4())
    worker = build_worker_input(id=uuid.uuid4(), company_id=company.id)
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


class TestValidationSyncUploadNormal:
    """POST /api/sync/upload の正常系"""

    async def test_valid_payload_returns_200(
        self, client: AsyncClient, setup_db
    ) -> None:
        """有効なペイロードは 200"""
        response = await client.post("/api/sync/upload", json=_valid_database_payload())
        assert response.status_code == 200
