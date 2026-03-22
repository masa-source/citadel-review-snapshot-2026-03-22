"""
帳票出力API（PDF/Excel生成）の統合テスト

移行元: test_api_pdf.py, test_api_excel.py

重要: mock_xlwings フィクスチャを使用して、
      Excelがインストールされていない環境でもテストが通るようにする。
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

# テスト用の存在しないレポートUUID（有効なUUID形式）
NON_EXISTENT_REPORT_ID = "00000000-0000-0000-0000-000000000000"
NON_EXISTENT_TEMPLATE_ID = "00000000-0000-0000-0000-000000000001"


class TestReportsListAPI:
    """GET /api/reports のテスト"""

    async def test_get_reports_when_empty_returns_200_with_empty_list(
        self, client: AsyncClient
    ) -> None:
        """レポート一覧取得（空の状態）"""
        response = await client.get("/api/reports")
        assert response.status_code == 200
        assert response.json() == []

    async def test_get_reports_after_upload_returns_200_with_reports(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """データアップロード後のレポート一覧取得"""
        from tests.factories import insert_report

        await insert_report(
            db_session,
            report_title="List Test Report",
        )

        # 一覧取得
        response = await client.get("/api/reports")
        assert response.status_code == 200
        reports = response.json()
        assert len(reports) >= 1

        # レポートの構造確認
        report = next(r for r in reports if r["reportTitle"] == "List Test Report")
        assert "id" in report
        assert report["reportTitle"] == "List Test Report"


class TestReportContextAPI:
    """GET /api/reports/{report_id}/context の正常系"""

    async def test_get_report_context_with_valid_id_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """正常系: コンテキスト取得"""
        from tests.factories import insert_report, insert_worker

        worker = await insert_worker(db_session)
        report = await insert_report(
            db_session,
            company_id=worker.company_id,
            report_title="Context Test Report",
        )

        from models import ReportWorker

        db_session.add(
            ReportWorker(report_id=report.id, worker_id=worker.id, worker_role="担当者")
        )
        await db_session.flush()

        response = await client.get(f"/api/reports/{report.id}/context")
        assert response.status_code == 200

        context = response.json()
        # コンテキストの必須キー確認
        required_keys = [
            "id",
            "reportTitle",
            "reportWorkersOrdered",
            "companyId",
        ]
        for key in required_keys:
            assert key in context, f"Missing context key: {key}"
        assert context["reportTitle"] == "Context Test Report"


class TestReportContextAPINotFound:
    """GET /api/reports/{report_id}/context の異常系（404）"""

    async def test_get_report_context_with_invalid_id_returns_404(
        self, client: AsyncClient
    ) -> None:
        """存在しないreport_idでコンテキスト取得"""
        response = await client.get(f"/api/reports/{NON_EXISTENT_REPORT_ID}/context")
        assert response.status_code == 404
