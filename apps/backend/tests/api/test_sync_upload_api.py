from httpx import AsyncClient

from tests.factories import (
    build_company_input,
    build_database_input,
    build_report_input,
)


class TestSyncUpload:
    """POST /api/sync/upload のテスト"""

    async def test_post_upload_with_valid_data_returns_200(
        self, client: AsyncClient
    ) -> None:
        """正常系: Factoryで生成したデータアップロード"""
        data = build_database_input(reports=[build_report_input()]).model_dump(
            by_alias=True, mode="json"
        )
        response = await client.post("/api/sync/upload", json=data)

        assert response.status_code == 200
        result = response.json()
        assert result["ok"] is True
        assert "counts" in result
        counts = result["counts"]
        assert counts.get("companies", 0) >= 1
        assert counts.get("reports", 0) >= 1

    async def test_post_upload_with_empty_data_returns_200(
        self, client: AsyncClient
    ) -> None:
        """空のデータをアップロード"""
        response = await client.post(
            "/api/sync/upload", json={"companies": [], "workers": [], "reports": []}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True

    async def test_post_upload_with_report_clients_returns_200(
        self, client: AsyncClient
    ) -> None:
        """reportClients を使用したクライアント紐付けのアップロード"""
        company = build_company_input()
        report = build_report_input(company_id=company.id)

        data = build_database_input(
            companies=[company],
            reports=[report],
            report_clients=[{"reportId": str(report.id), "companyId": str(company.id)}],
        ).model_dump(by_alias=True, mode="json")

        response = await client.post("/api/sync/upload", json=data)

        assert response.status_code == 200
        result = response.json()
        assert result["ok"] is True

    async def test_post_upload_with_overwrite_mode_returns_200(
        self, client: AsyncClient
    ) -> None:
        """mode=overwrite で同一IDのレポートが上書き（API境界の確認のみ）"""
        report = build_report_input()
        data = build_database_input(reports=[report]).model_dump(
            by_alias=True, mode="json"
        )

        # 1. 初回インポート
        await client.post("/api/sync/upload", json=data)

        # 2. 同一IDで別タイトルを overwrite=True でインポート
        report.report_title = "Overwritten Title"
        payload2 = build_database_input(reports=[report]).model_dump(
            by_alias=True, mode="json"
        )

        r2 = await client.post(
            "/api/sync/upload",
            params={"mode": "overwrite"},
            json=payload2,
        )
        assert r2.status_code == 200
        assert r2.json()["ok"] is True

    async def test_post_upload_with_copy_mode_returns_200(
        self, client: AsyncClient
    ) -> None:
        """mode=copy（デフォルト）で 200 OK が返る"""
        data = build_database_input().model_dump(by_alias=True, mode="json")

        # 1. 初回送信
        r1 = await client.post("/api/sync/upload", json=data)
        assert r1.status_code == 200
        assert r1.json()["ok"] is True

        # 2. 同じ payload で再送信（mode=copy）
        r2 = await client.post(
            "/api/sync/upload",
            params={"mode": "copy"},
            json=data,
        )
        assert r2.status_code == 200
        assert r2.json()["ok"] is True

    async def test_post_upload_with_invalid_mode_returns_422(
        self, client: AsyncClient
    ) -> None:
        """存在しない mode パラメータを指定した場合は 422 が返る"""
        data = build_database_input().model_dump(by_alias=True, mode="json")
        response = await client.post(
            "/api/sync/upload",
            params={"mode": "invalid_mode_xyz"},
            json=data,
        )
        assert response.status_code == 422

    async def test_post_upload_with_invalid_schema_returns_422(
        self, client: AsyncClient
    ) -> None:
        """DatabaseInput のスキーマに違反するペイロード（型が違う等）の場合は 422 が返る"""
        data = build_database_input().model_dump(by_alias=True, mode="json")
        # わざと companies を不正な型（文字列）にする
        data["companies"] = "invalid_format"
        response = await client.post("/api/sync/upload", json=data)
        assert response.status_code == 422


class TestSyncUploadChunk:
    """POST /api/sync/upload/begin, chunk, commit と GET .../sessions/{id}/status のテスト"""

    async def test_post_upload_chunk_flow_with_valid_data_returns_200(
        self, client: AsyncClient
    ) -> None:
        """正常系: Begin → Chunk 複数回 → Commit で一括アップロードと同等になる"""
        input_data = build_database_input().model_dump(by_alias=True, mode="json")

        # Begin
        begin_res = await client.post(
            "/api/sync/upload/begin",
            json={"mode": "copy"},
        )
        assert begin_res.status_code == 200
        begin_data = begin_res.json()
        session_id = begin_data["sessionId"]
        expected_order = begin_data["expectedOrder"]

        # Chunks
        for seq, table in enumerate(expected_order):
            rows = input_data.get(table, [])
            chunk_res = await client.post(
                "/api/sync/upload/chunk",
                json={
                    "sessionId": session_id,
                    "sequenceIndex": seq,
                    "table": table,
                    "rows": rows,
                },
            )
            assert chunk_res.status_code == 200
            assert chunk_res.json().get("ok") is True

        # Commit
        commit_res = await client.post(
            "/api/sync/upload/commit",
            json={"sessionId": session_id},
        )
        assert commit_res.status_code == 200
        assert commit_res.json()["ok"] is True

    async def test_get_upload_session_status_with_valid_session_returns_200(
        self, client: AsyncClient
    ) -> None:
        """Begin 後に status を取得し、チャンク送信後に受信済みが増えることを確認"""
        input_data = build_database_input().model_dump(by_alias=True, mode="json")

        begin_res = await client.post(
            "/api/sync/upload/begin",
            json={"mode": "copy"},
        )
        assert begin_res.status_code == 200
        session_id = begin_res.json()["sessionId"]
        expected_order = begin_res.json()["expectedOrder"]

        # 1 チャンク送信後の status
        table0 = expected_order[0]
        rows0 = input_data.get(table0, [])
        await client.post(
            "/api/sync/upload/chunk",
            json={
                "sessionId": session_id,
                "sequenceIndex": 0,
                "table": table0,
                "rows": rows0,
            },
        )
        status_res = await client.get(f"/api/sync/upload/sessions/{session_id}/status")
        assert status_res.status_code == 200
        assert 0 in status_res.json()["receivedSequenceIndices"]

        # 残りチャンクを送って commit
        for seq in range(1, len(expected_order)):
            table = expected_order[seq]
            rows = input_data.get(table, [])
            await client.post(
                "/api/sync/upload/chunk",
                json={
                    "sessionId": session_id,
                    "sequenceIndex": seq,
                    "table": table,
                    "rows": rows,
                },
            )
        await client.post("/api/sync/upload/commit", json={"sessionId": session_id})

        # セッション削除後は status が 404
        status_after = await client.get(
            f"/api/sync/upload/sessions/{session_id}/status"
        )
        assert status_after.status_code == 404

    async def test_post_upload_chunk_with_invalid_session_returns_404(
        self, client: AsyncClient
    ) -> None:
        """存在しない sessionId に chunk を送信した場合は 404 または 400エラー等で弾かれる"""
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        response = await client.post(
            "/api/sync/upload/chunk",
            json={
                "sessionId": fake_uuid,
                "sequenceIndex": 0,
                "table": "companies",
                "rows": [],
            },
        )
        # 存在しないセッションの場合は 404
        assert response.status_code == 404

    async def test_post_upload_chunk_with_invalid_schema_returns_422(
        self, client: AsyncClient
    ) -> None:
        """チャンクのスキーマ違反（必要なフィールドが足りないなど）の場合は 422 が返る"""
        response = await client.post(
            "/api/sync/upload/chunk",
            json={
                # sessionId や sequenceIndex が欠落している不正なリクエスト
                "table": "companies",
                "rows": [],
            },
        )
        assert response.status_code == 422
