"""
任務（Mission）API の統合テスト

Handoff による任務発行、Heartbeat、Purge、一覧、upload 時の _mission 検証をテスト。
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestMissionStatusAPI:
    """GET /api/missions/{mission_id}/status のテスト"""

    async def test_get_mission_status_with_valid_id_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """任務の状態取得"""
        from tests.factories import insert_report

        report = await insert_report(db_session)
        report_id = str(report.id)

        await client.post(
            "/api/sync/handoff",
            json={
                "includeCompanies": True,
                "targetReportIds": [report_id],
                "exportMode": "edit",
                "permission": "View",
            },
        )
        list_response = await client.get("/api/missions?status=Active")
        missions = list_response.json()
        mission_id = missions[0]["missionId"]

        response = await client.get(f"/api/missions/{mission_id}/status")
        assert response.status_code == 200
        assert response.json().get("status") == "Active"


class TestHandoffEditConflict:
    """Handoff で Edit 任務の重複発行が 409 になるテスト"""

    async def test_post_handoff_with_existing_edit_mission_returns_409(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """同一レポートに既に Active な Edit 任務がある場合、新規 Edit 任務は 409"""
        from tests.factories import insert_report

        report = await insert_report(db_session)
        report_id = str(report.id)

        payload = {
            "includeCompanies": True,
            "targetReportIds": [report_id],
            "exportMode": "edit",
            "permission": "Edit",
        }

        first = await client.post("/api/sync/handoff", json=payload)
        assert first.status_code == 200

        second = await client.post("/api/sync/handoff", json=payload)
        assert second.status_code == 409
        assert (
            "既にこのレポートに Edit 任務が発行されています" in second.json()["detail"]
        )
