"""
任務（Mission）API の統合テスト

Handoff による任務発行、Heartbeat、Purge、一覧、upload 時の _mission 検証をテスト。
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestMissionsListAPI:
    """GET /api/missions のテスト"""

    async def test_get_missions_when_empty_returns_200_with_empty_list(
        self, client: AsyncClient
    ) -> None:
        """任務が無い場合は空リスト"""
        response = await client.get("/api/missions")
        assert response.status_code == 200
        assert response.json() == []

    async def test_get_missions_after_handoff_returns_200_with_active_missions(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Handoff 後に Active 任務が一覧に含まれる"""
        from tests.factories import insert_report

        report = await insert_report(db_session)

        handoff_response = await client.post(
            "/api/sync/handoff",
            json={
                "includeCompanies": True,
                "includeWorkers": True,
                "includeInstruments": True,
                "includeParts": True,
                "includeOwnedInstruments": True,
                "targetReportIds": [str(report.id)],
                "exportMode": "edit",
                "permission": "View",
            },
        )
        assert handoff_response.status_code == 200

        list_response = await client.get("/api/missions?status=Active")
        assert list_response.status_code == 200
        data = list_response.json()
        assert len(data) >= 1
        assert any(m["permission"] == "View" for m in data)

    async def test_get_missions_with_collect_handoff_returns_200_with_active_missions(
        self, client: AsyncClient
    ) -> None:
        """レポートを選択しない Handoff（Collect）でも任務が作成され、派遣名簿に載る"""
        # 閲覧・編集は対象レポート必須のため、レポート0件の場合は Collect を使用
        handoff_response = await client.post(
            "/api/sync/handoff",
            json={
                "includeCompanies": True,
                "includeWorkers": True,
                "includeInstruments": True,
                "includeParts": True,
                "includeOwnedInstruments": True,
                "targetReportIds": [],
                "exportMode": "edit",
                "permission": "Collect",
            },
        )
        assert handoff_response.status_code == 200

        list_response = await client.get("/api/missions?status=Active")
        assert list_response.status_code == 200
        data = list_response.json()
        assert len(data) >= 1
        assert any(m.get("permission") == "Collect" for m in data)
