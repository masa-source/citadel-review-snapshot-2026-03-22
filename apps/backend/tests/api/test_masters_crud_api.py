"""
帳票出力API（PDF/Excel生成）の統合テスト

移行元: test_api_pdf.py, test_api_excel.py

重要: mock_xlwings フィクスチャを使用して、
      Excelがインストールされていない環境でもテストが通るようにする。
"""

# テスト用の存在しないレポートUUID（有効なUUID形式）
NON_EXISTENT_REPORT_ID = "00000000-0000-0000-0000-000000000000"
NON_EXISTENT_TEMPLATE_ID = "00000000-0000-0000-0000-000000000001"


class TestMastersCRUD:
    """マスタ系CRUD APIの追加テスト"""
