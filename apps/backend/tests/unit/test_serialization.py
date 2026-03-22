import uuid

from models import Company
from utils.serialization import model_to_export_dict, to_camel


class TestToCamel:
    """to_camel() 関数のテスト（utils.serialization）"""

    def test_snake_to_camel(self):
        """スネークケースをキャメルケースに変換"""
        assert to_camel("company_id") == "companyId"
        assert to_camel("report_title") == "reportTitle"


class TestModelToDict:
    """model_to_export_dict() 関数のテスト"""

    def test_convert_company(self):
        """Company モデルを辞書に変換"""
        test_uuid = uuid.uuid4()
        company = Company(id=test_uuid, name="Test", postal_code="123-4567")
        result = model_to_export_dict(company)
        # UUID は文字列に変換される
        assert result["id"] == str(test_uuid)
        assert result["name"] == "Test"
        assert result["postalCode"] == "123-4567"

    def test_none_returns_empty_dict(self):
        """None は空の辞書を返す"""
        result = model_to_export_dict(None)
        assert result == {}


class TestModelListToDicts:
    """model_to_export_dict() をリストに適用するテスト"""

    def test_convert_list(self):
        """リストを変換"""
        uuid1 = uuid.uuid4()
        uuid2 = uuid.uuid4()
        companies = [
            Company(id=uuid1, name="A"),
            Company(id=uuid2, name="B"),
        ]
        result = [model_to_export_dict(c) for c in companies]
        assert len(result) == 2
        assert result[0]["name"] == "A"
        assert result[1]["name"] == "B"
        assert result[0]["id"] == str(uuid1)
        assert result[1]["id"] == str(uuid2)
