import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestDirectHandoff:
    """POST /api/sync/stage & GET /api/sync/stage/{ticket_id} のテスト"""

    async def test_post_stage_and_get_with_valid_data_returns_200(
        self, client: AsyncClient
    ) -> None:
        from schemas import CompanyInput, DatabaseInput

        data = DatabaseInput(
            companies=[
                CompanyInput(
                    id="11111111-1111-1111-1111-111111111111", name="Test Company"
                )
            ]
        ).model_dump(by_alias=True, mode="json")
        # ステージング
        stage_response = await client.post("/api/sync/stage", json=data)

        assert stage_response.status_code == 200
        stage_data = stage_response.json()
        assert stage_data["ok"] is True
        assert "ticketId" in stage_data
        ticket_id = stage_data["ticketId"]

        # ステージデータを取得
        retrieve_response = await client.get(f"/api/sync/stage/{ticket_id}")

        assert retrieve_response.status_code == 200
        retrieved_data = retrieve_response.json()
        # 元のデータと同じ構造か確認
        assert "companies" in retrieved_data
        assert "workers" in retrieved_data

    async def test_get_stage_already_retrieved_returns_404(
        self, client: AsyncClient
    ) -> None:
        from schemas import CompanyInput, DatabaseInput

        data = DatabaseInput(
            companies=[
                CompanyInput(
                    id="11111111-1111-1111-1111-111111111111", name="Test Company"
                )
            ]
        ).model_dump(by_alias=True, mode="json")
        # ステージング
        stage_response = await client.post("/api/sync/stage", json=data)
        ticket_id = stage_response.json()["ticketId"]

        # 1回目の取得 - 成功
        first_retrieve = await client.get(f"/api/sync/stage/{ticket_id}")
        assert first_retrieve.status_code == 200

        # 2回目の取得 - 失敗（既に削除済み）
        second_retrieve = await client.get(f"/api/sync/stage/{ticket_id}")
        assert second_retrieve.status_code == 404

    async def test_get_stage_with_invalid_ticket_returns_404(
        self, client: AsyncClient
    ) -> None:
        """存在しないチケットIDで取得"""
        response = await client.get("/api/sync/stage/invalid-ticket-id-12345")
        assert response.status_code == 404


class TestDirectHandoffAPI:
    """POST /api/sync/handoff のテスト（エクスポート＋ステージング一括）"""

    async def test_post_handoff_flow_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Direct Handoff フロー全体のテスト"""
        # Direct Handoff 実行（permission 付き）。閲覧・編集は対象レポート必須のため、レポート0件では Collect を使用
        handoff_payload = {
            "includeCompanies": True,
            "includeWorkers": True,
            "includeInstruments": True,
            "includeParts": True,
            "includeOwnedInstruments": True,
            "targetReportIds": [],
            "exportMode": "edit",
            "permission": "Collect",
        }
        handoff_response = await client.post("/api/sync/handoff", json=handoff_payload)

        assert handoff_response.status_code == 200
        handoff_data = handoff_response.json()
        assert handoff_data["ok"] is True
        ticket_id = handoff_data["ticketId"]

        # ステージデータを取得
        retrieve_response = await client.get(f"/api/sync/stage/{ticket_id}")
        assert retrieve_response.status_code == 200

        data = retrieve_response.json()
        assert "companies" in data
        assert "_mission" in data
        assert "missionId" in data["_mission"]
        assert data["_mission"].get("permission") == "Collect"

    async def test_post_handoff_with_copy_permission_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Copy 権限の Handoff では MissionReport が作成されず、200 と _mission.permission=Copy が返る"""
        from tests.factories import insert_report

        report = await insert_report(db_session)
        report_id = str(report.id)

        handoff_payload = {
            "includeCompanies": True,
            "includeWorkers": True,
            "includeInstruments": True,
            "includeParts": True,
            "includeOwnedInstruments": True,
            "targetReportIds": [report_id],
            "exportMode": "edit",
            "permission": "Copy",
        }
        handoff_response = await client.post("/api/sync/handoff", json=handoff_payload)
        assert handoff_response.status_code == 200
        handoff_data = handoff_response.json()
        assert handoff_data["ok"] is True
        ticket_id = handoff_data["ticketId"]

        retrieve_response = await client.get(f"/api/sync/stage/{ticket_id}")
        assert retrieve_response.status_code == 200
        data = retrieve_response.json()
        assert data["_mission"]["permission"] == "Copy"

    @pytest.mark.parametrize(
        "permission, target_report_ids, expected_status, detail_match",
        [
            ("Edit", [], 400, "対象レポートを1件以上指定してください"),
            ("View", [], 400, "対象レポートを1件以上指定してください"),
            ("Copy", [], 400, "対象レポートを1件以上指定してください"),
            ("Collect", [], 200, None),
        ],
    )
    async def test_post_handoff_with_invalid_permission_returns_400(
        self,
        client: AsyncClient,
        permission,
        target_report_ids,
        expected_status,
        detail_match,
    ) -> None:
        """不正な権限とレポートIDの組み合わせで 400 エラーになることを検証"""
        payload = {
            "includeCompanies": True,
            "targetReportIds": target_report_ids,
            "permission": permission,
            "exportMode": "edit",
        }
        response = await client.post("/api/sync/handoff", json=payload)
        assert response.status_code == expected_status
        if detail_match:
            assert detail_match in response.json()["detail"]

    async def test_post_handoff_when_locked_returns_409(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """既存の Active な Edit 任務がある場合、新規の Edit 任務発行を 409 Conflict で拒否する"""
        from tests.factories import insert_report

        report = await insert_report(db_session)
        report_id = str(report.id)

        payload = {
            "includeCompanies": True,
            "targetReportIds": [report_id],
            "permission": "Edit",
            "exportMode": "edit",
        }

        # 1. 1回目の Handoff (成功)
        res1 = await client.post("/api/sync/handoff", json=payload)
        assert res1.status_code == 200

        # 2. 2回目の Handoff (競合)
        res2 = await client.post("/api/sync/handoff", json=payload)
        assert res2.status_code == 409
        assert "既にこのレポートに Edit 任務が発行されています" in res2.json()["detail"]

    async def test_post_handoff_with_invalid_schema_returns_422(
        self, client: AsyncClient
    ) -> None:
        """スキーマ違反（型不詳など）の場合は 422 が返る"""
        payload = {
            "includeCompanies": "not_a_boolean",  # 型不正
            "targetReportIds": [],
            "permission": "Edit",
        }
        response = await client.post("/api/sync/handoff", json=payload)
        assert response.status_code == 422

    async def test_post_handoff_with_invalid_report_uuid_returns_422(
        self, client: AsyncClient
    ) -> None:
        """UUID 形式ではない不正な文字列を渡した場合は 422 が返る"""
        payload = {
            "includeCompanies": True,
            "targetReportIds": ["not-a-uuid"],
            "permission": "Edit",
        }
        response = await client.post("/api/sync/handoff", json=payload)
        assert response.status_code == 422

    async def test_post_handoff_with_unknown_permission_returns_422(
        self, client: AsyncClient
    ) -> None:
        """定義されていない権限（Enum外）を渡した場合は 422 が返る"""
        payload = {
            "includeCompanies": True,
            "targetReportIds": ["11111111-1111-1111-1111-111111111111"],
            "permission": "SuperAdminFakePermission",
        }
        response = await client.post("/api/sync/handoff", json=payload)
        assert response.status_code == 422
