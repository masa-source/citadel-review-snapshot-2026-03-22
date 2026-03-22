"""
任務（Mission）API の統合テスト

Handoff による任務発行、Heartbeat、Purge、一覧、upload 時の _mission 検証をテスト。
"""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestMissionPurgeAPI:
    """POST /api/missions/{mission_id}/purge のテスト"""

    async def test_post_purge_with_valid_mission_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """任務の除名成功"""
        from tests.factories import insert_report

        report = await insert_report(db_session)

        await client.post(
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
        list_response = await client.get("/api/missions?status=Active")
        missions = list_response.json()
        mission_id = missions[0]["missionId"]

        response = await client.post(f"/api/missions/{mission_id}/purge")
        assert response.status_code == 200
        assert response.json().get("ok") is True

        list_after = await client.get("/api/missions?status=Active")
        active_ids = [m["missionId"] for m in list_after.json()]
        assert mission_id not in active_ids

    async def test_post_purge_with_invalid_id_returns_404(
        self, client: AsyncClient
    ) -> None:
        """存在しない任務の除名は 404"""
        fake_mission_id = str(uuid.uuid4())
        response = await client.post(f"/api/missions/{fake_mission_id}/purge")
        assert response.status_code == 404


class TestMissionUploadValidation:
    """任務状態（Purged 等）に基づいたアップロード制限のテスト"""

    async def test_post_upload_with_purged_mission_returns_403(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Purge された任務 ID を含むアップロードは 403 で拒絶される"""
        from tests.factories import insert_report

        report = await insert_report(db_session)
        report_id = str(report.id)

        # 1. 任務の発行
        handoff_res = await client.post(
            "/api/sync/handoff",
            json={
                "includeCompanies": True,
                "targetReportIds": [report_id],
                "permission": "Edit",
                "exportMode": "edit",
            },
        )
        ticket_id = handoff_res.json()["ticketId"]

        # 2. ステージデータから missionId を取得
        stage_res = await client.get(f"/api/sync/stage/{ticket_id}")
        mission_id = stage_res.json()["_mission"]["missionId"]

        # 3. 任務を Purge する (API経由)
        purge_res = await client.post(f"/api/missions/{mission_id}/purge")
        assert purge_res.status_code == 200

        # 4. 有効なデータだが、除名済み _mission を付けてアップロード
        upload_payload = {
            "companies": [],
            "reports": [
                {
                    "id": report_id,
                    "reportType": "inspection",
                    "reportTitle": "Purged Upload Test",
                    "companyId": None,
                    "updatedAt": "2026-03-05T00:00:00Z",
                }
            ],
            "_mission": {"missionId": mission_id},
        }

        response = await client.post("/api/sync/upload", json=upload_payload)
        assert response.status_code == 403
        assert response.json()["code"] == "PURGED"
