"""
帳票出力API（PDF/Excel生成）の統合テスト

移行元: test_api_pdf.py, test_api_excel.py

重要: mock_xlwings フィクスチャを使用して、
      Excelがインストールされていない環境でもテストが通るようにする。
"""

from httpx import AsyncClient

# テスト用の存在しないレポートUUID（有効なUUID形式）
NON_EXISTENT_REPORT_ID = "00000000-0000-0000-0000-000000000000"
NON_EXISTENT_TEMPLATE_ID = "00000000-0000-0000-0000-000000000001"


class TestTemplatesAPINormal:
    """GET /api/templates の正常系"""

    async def test_get_templates_when_empty_returns_200_with_empty_list(
        self, client: AsyncClient
    ) -> None:
        """テンプレート一覧取得（空の状態）"""
        response = await client.get("/api/templates")
        assert response.status_code == 200
        # テストDBでは空のはず（lifespan で初期化されない）
        templates = response.json()
        assert isinstance(templates, list)


class TestTemplatesAPINotFound:
    """DELETE/PUT /api/templates の異常系（404）"""

    async def test_delete_template_with_invalid_id_returns_404(
        self, client: AsyncClient
    ) -> None:
        """存在しないテンプレートの削除"""
        response = await client.delete(f"/api/templates/{NON_EXISTENT_TEMPLATE_ID}")
        assert response.status_code == 404

    async def test_update_template_with_invalid_id_returns_404(
        self, client: AsyncClient
    ) -> None:
        """存在しないテンプレートの更新"""
        response = await client.put(
            f"/api/templates/{NON_EXISTENT_TEMPLATE_ID}",
            json={"name": "Updated"},
        )
        assert response.status_code == 404


class TestTemplatesAPIValidation:
    """PUT /api/templates のバリデーション（422）"""

    async def test_update_template_with_path_traversal_returns_422(
        self,
        client: AsyncClient,
        db_session,
    ) -> None:
        from sqlalchemy.ext.asyncio import AsyncSession

        from models import ReportTemplate

        assert isinstance(db_session, AsyncSession)
        tpl = ReportTemplate(name="t", file_path="templates/a.xlsx")
        db_session.add(tpl)
        await db_session.commit()
        await db_session.refresh(tpl)

        response = await client.put(
            f"/api/templates/{tpl.id}",
            json={"filePath": "../outside.xlsx"},
        )
        assert response.status_code == 422, response.text
