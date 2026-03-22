"""
任務（Mission）API の統合テスト

Handoff による任務発行、Heartbeat、Purge、一覧、upload 時の _mission 検証をテスト。
"""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestMissionHeartbeatAPI:
    """POST /api/missions/{mission_id}/heartbeat のテスト"""

    async def test_post_heartbeat_with_valid_mission_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Handoff で発行した任務への Heartbeat 成功"""
        from tests.factories import insert_report

        report = await insert_report(db_session)
        report_id = str(report.id)

        handoff_response = await client.post(
            "/api/sync/handoff",
            json={
                "includeCompanies": True,
                "targetReportIds": [report_id],
                "exportMode": "edit",
                "permission": "Edit",
            },
        )
        assert handoff_response.status_code == 200

        list_response = await client.get("/api/missions?status=Active")
        missions = list_response.json()
        assert len(missions) >= 1
        mission_id = missions[0]["missionId"]

        response = await client.post(
            f"/api/missions/{mission_id}/heartbeat",
            json={"deviceId": "test-device-1"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") is True
        assert "expiresAt" in data

    async def test_post_heartbeat_with_invalid_id_returns_404(
        self, client: AsyncClient
    ) -> None:
        """存在しない任務への Heartbeat は 404"""
        fake_mission_id = str(uuid.uuid4())
        response = await client.post(
            f"/api/missions/{fake_mission_id}/heartbeat",
            json={"deviceId": "test"},
        )
        assert response.status_code == 404

    async def test_post_heartbeat_when_purged_returns_403(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Purge された任務への Heartbeat は 403 と code PURGED"""
        from tests.factories import insert_report

        report = await insert_report(db_session)
        report_id = str(report.id)

        handoff_response = await client.post(
            "/api/sync/handoff",
            json={
                "includeCompanies": True,
                "targetReportIds": [report_id],
                "exportMode": "edit",
                "permission": "View",
            },
        )
        assert handoff_response.status_code == 200
        list_response = await client.get("/api/missions?status=Active")
        missions = list_response.json()
        assert len(missions) >= 1
        mission_id = missions[0]["missionId"]

        purge_response = await client.post(f"/api/missions/{mission_id}/purge")
        assert purge_response.status_code == 200

        heartbeat_response = await client.post(
            f"/api/missions/{mission_id}/heartbeat",
            json={"deviceId": "test"},
        )
        assert heartbeat_response.status_code == 403
        body = heartbeat_response.json()
        assert body.get("code") == "PURGED"
