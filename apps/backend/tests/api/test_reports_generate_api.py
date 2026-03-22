"""
帳票出力API（PDF/Excel生成）の統合テスト

移行元: test_api_pdf.py, test_api_excel.py

重要: mock_xlwings フィクスチャを使用して、
      Excelがインストールされていない環境でもテストが通るようにする。
"""

import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

# テスト用の存在しないレポートUUID（有効なUUID形式）
NON_EXISTENT_REPORT_ID = "00000000-0000-0000-0000-000000000000"
NON_EXISTENT_TEMPLATE_ID = "00000000-0000-0000-0000-000000000001"


class TestGenerateReportPDF:
    """POST /api/generate-report (PDF生成) の正常系

    注意: このテストは mock_xlwings を使用して、
          Excelがなくても実行できるようにモック化している。
    """

    async def test_generate_pdf_with_valid_report_returns_200(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        mock_xlwings,
        setup_report_template,
    ) -> None:
        """モックを使用したPDF生成の検証: プレースホルダが置換されているか確認"""
        from tests.factories import insert_company, insert_report

        company = await insert_company(db_session, name="Test Company")
        report = await insert_report(
            db_session,
            company_id=company.id,
            report_title="PDF Test Report",
            report_format_name="作業報告書",
        )

        # 内部で xlwings モックが呼ばれる
        response = await client.post(f"/api/generate-report?report_id={report.id}")
        assert response.status_code == 200

        # mock_xlwings から作成されたブックを取得して検証
        books = mock_xlwings.created_books
        assert len(books) > 0
        sheet = books[0].sheets[0]
        cells = list(sheet.used_range)

        # プレースホルダが置換されていることをアサート
        assert cells[0].value == "PDF Test Report"
        assert cells[1].value == "Test Company"

    @pytest.mark.skipif(
        sys.platform != "win32",
        reason="On Linux/CI the app lifespan may create templates and xlwings is unavailable; skip to avoid 500 from xlwings.",
    )
    async def test_generate_pdf_without_templates_returns_404(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """テンプレートが登録されていない場合"""
        from tests.factories import insert_report

        report = await insert_report(db_session)

        # テンプレートがない場合は404
        response = await client.post(f"/api/generate-report?report_id={report.id}")
        assert response.status_code == 404

    async def test_generate_pdf_when_file_locked_returns_500(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        mock_xlwings,
        setup_report_template,
    ) -> None:
        # テンプレートファイルがロックされている (PermissionError) 場合、適切にハンドリングされることを検証
        from tests.factories import insert_report

        report = await insert_report(
            db_session,
            report_format_name="作業報告書",
        )

        # レポート生成過程で呼ばれる _fill_sheet_placeholders で PermissionError が発生する状況をモック
        with patch(
            "services.binder.pdf_zip._fill_sheet_placeholders",
            side_effect=PermissionError("File in use"),
        ):
            response = await client.post(f"/api/generate-report?report_id={report.id}")
            assert response.status_code == 500
            detail = response.json()["detail"]
            assert "PermissionError" in detail or "File in use" in detail

    async def test_generate_pdf_when_template_file_missing_returns_404(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        mock_xlwings,
        setup_report_template,
        worker_tmp_dir: Path,
    ) -> None:
        """テンプレートレコードはあるが実ファイルが無い場合は404になる。"""
        from pathlib import Path

        from tests.factories import insert_company, insert_report

        # setup_report_template で ReportFormat / ReportTemplate / ReportFormatTemplate を作成し、
        # assets base を worker_tmp_dir に差し替える。
        tpl = setup_report_template

        # 実ファイルを事前に削除して「DB上は存在するがディスク上は無い」状態を作る
        missing_path = Path(worker_tmp_dir) / tpl.file_path  # type: ignore[arg-type]
        if missing_path.exists():
            missing_path.unlink()

        company = await insert_company(db_session, name="Missing Template Company")
        report = await insert_report(
            db_session,
            company_id=company.id,
            report_title="Missing Template Report",
            report_format_name="作業報告書",
        )

        response = await client.post(f"/api/generate-report?report_id={report.id}")
        assert response.status_code == 404
        detail = response.json()["detail"]
        assert "テンプレートファイルが見つかりません" in detail

    @pytest.mark.skipif(
        not os.environ.get("RUN_REAL_EXCEL") or sys.platform != "win32",
        reason="Requires Windows and RUN_REAL_EXCEL=1 environment variable with real Excel installed",
    )
    async def test_generate_pdf_with_real_excel_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """
        実際のExcelを使用したPDF生成テスト（手動実行用）
        """
        from tests.factories import insert_report

        report = await insert_report(db_session)

        response = await client.post(f"/api/generate-report?report_id={report.id}")

        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        assert len(response.content) > 0


class TestGenerateReportPDFNotFound:
    """POST /api/generate-report の異常系（404）"""

    async def test_generate_pdf_with_invalid_id_returns_404(
        self, client: AsyncClient
    ) -> None:
        """存在しないreport_idでPDF生成"""
        response = await client.post(
            f"/api/generate-report?report_id={NON_EXISTENT_REPORT_ID}"
        )
        assert response.status_code == 404

    async def test_generate_pdf_without_id_returns_422(
        self, client: AsyncClient
    ) -> None:
        """report_id パラメータが欠落している場合"""
        response = await client.post("/api/generate-report")
        assert response.status_code == 422

    async def test_generate_pdf_with_malformed_id_returns_422(
        self, client: AsyncClient
    ) -> None:
        """UUID 形式ではない不正な文字列の場合"""
        response = await client.post("/api/generate-report?report_id=not-a-uuid")
        assert response.status_code == 422


class TestGenerateExcelZip:
    """POST /api/generate-excel (Excel ZIP生成) の正常系

    注意: このテストは mock_xlwings を使用して、
          Excelがなくても実行できるようにモック化している。
    """

    async def test_generate_excel_without_templates_returns_404(
        self, client: AsyncClient, db_session: AsyncSession, mock_xlwings
    ) -> None:
        """テンプレートが登録されていない場合"""
        from tests.factories import insert_report

        report = await insert_report(db_session)

        # テンプレートがない場合は404
        response = await client.post(f"/api/generate-excel?report_id={report.id}")
        assert response.status_code == 404

    async def test_generate_excel_with_valid_report_returns_200(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        mock_xlwings,
        setup_report_template,
    ) -> None:
        """モックを使用したExcel生成の検証: プレースホルダが置換されているか確認"""
        from tests.factories import insert_company, insert_report

        company = await insert_company(db_session, name="Test Company")
        report = await insert_report(
            db_session,
            company_id=company.id,
            report_title="Excel Test Report",
            report_format_name="作業報告書",
        )

        response = await client.post(f"/api/generate-excel?report_id={report.id}")
        assert response.status_code == 200

        books = mock_xlwings.created_books
        assert len(books) > 0
        sheet = books[0].sheets[0]
        cells = list(sheet.used_range)

        assert cells[0].value == "Excel Test Report"
        assert cells[1].value == "Test Company"

    @pytest.mark.skipif(
        not os.environ.get("RUN_REAL_EXCEL") or sys.platform != "win32",
        reason="Requires Windows and RUN_REAL_EXCEL=1 environment variable with real Excel installed",
    )
    async def test_generate_excel_with_real_excel_returns_200(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """
        実際のExcelを使用したExcel ZIP生成テスト（手動実行用）
        """
        from tests.factories import insert_report

        report = await insert_report(db_session)

        response = await client.post(f"/api/generate-excel?report_id={report.id}")

        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/zip"
        assert len(response.content) > 0


class TestGenerateExcelZipNotFound:
    """POST /api/generate-excel の異常系（404）"""

    async def test_generate_excel_with_invalid_id_returns_404(
        self, client: AsyncClient
    ) -> None:
        """存在しないreport_idでExcel生成"""
        response = await client.post(
            f"/api/generate-excel?report_id={NON_EXISTENT_REPORT_ID}"
        )
        assert response.status_code == 404

    async def test_generate_excel_without_id_returns_422(
        self, client: AsyncClient
    ) -> None:
        """report_id パラメータが欠落している場合"""
        response = await client.post("/api/generate-excel")
        assert response.status_code == 422

    async def test_generate_excel_with_malformed_id_returns_422(
        self, client: AsyncClient
    ) -> None:
        """UUID 形式ではない不正な文字列の場合"""
        response = await client.post("/api/generate-excel?report_id=not-a-uuid")
        assert response.status_code == 422
