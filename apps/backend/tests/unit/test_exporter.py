"""
exporter.py のユニットテスト
"""

import uuid

from models import Company, Worker
from services.exporter import _model_list_to_export_dicts
from tests.helpers import (
    UUID_COMPANY_1,
    UUID_COMPANY_2,
    UUID_WORKER_1,
)
from utils.serialization import model_to_export_dict, to_camel


class TestToCamel:
    """to_camel() 関数のテスト（utils.serialization）"""

    def test_single_word(self):
        """単一の単語は先頭小文字でそのまま"""
        assert to_camel("name") == "name"

    def test_two_words(self):
        """2単語のスネークケースをキャメルケースに"""
        assert to_camel("company_id") == "companyId"

    def test_multiple_words(self):
        """複数単語のスネークケースをキャメルケースに"""
        assert to_camel("custom_data") == "customData"

    def test_already_camel(self):
        """アンダースコアなしの場合は先頭を小文字にした形で返す"""
        assert to_camel("companyId") == "companyid"

    def test_empty_string(self):
        """空文字は空文字を返す"""
        assert to_camel("") == ""

    def test_single_underscore(self):
        """アンダースコアのみ"""
        assert to_camel("_") == ""

    def test_leading_underscore(self):
        """先頭アンダースコア"""
        assert to_camel("_private_field") == "PrivateField"


class TestModelToDict:
    """model_to_export_dict() 関数のテスト"""

    def test_convert_company(self):
        """Company モデルを辞書に変換"""
        test_uuid = uuid.UUID(UUID_COMPANY_1)
        company = Company(
            id=test_uuid,
            name="Test Company",
            department="Test Dept",
            postal_code="123-4567",
        )
        result = model_to_export_dict(company)
        # UUID は文字列に変換される
        assert result["id"] == str(test_uuid)
        assert result["name"] == "Test Company"
        assert result["department"] == "Test Dept"
        assert result["postalCode"] == "123-4567"

    def test_convert_worker(self):
        """Worker モデルを辞書に変換"""
        test_uuid = uuid.UUID(UUID_WORKER_1)
        company_uuid = uuid.UUID(UUID_COMPANY_1)
        worker = Worker(
            id=test_uuid,
            name="Test Worker",
            company_id=company_uuid,
            seal_image_url="http://example.com/seal.png",
        )
        result = model_to_export_dict(worker)
        # UUID は文字列に変換される
        assert result["id"] == str(test_uuid)
        assert result["name"] == "Test Worker"
        assert result["companyId"] == str(company_uuid)
        assert result["sealImageUrl"] == "http://example.com/seal.png"

    def test_exclude_fields(self):
        """指定したフィールドを除外"""
        test_uuid = uuid.UUID(UUID_COMPANY_1)
        company = Company(id=test_uuid, name="Test", department="Dept")
        result = model_to_export_dict(company, exclude={"department"})
        assert "department" not in result
        assert result["name"] == "Test"

    def test_none_object(self):
        """None を渡すと空辞書を返す"""
        result = model_to_export_dict(None)
        assert result == {}

    def test_none_values(self):
        """None 値を含むモデル"""
        test_uuid = uuid.UUID(UUID_COMPANY_1)
        company = Company(id=test_uuid, name="Test", department=None)
        result = model_to_export_dict(company)
        assert result["department"] is None


class TestModelListToDicts:
    """_model_list_to_export_dicts() 関数のテスト"""

    def test_convert_list(self):
        """モデルのリストを辞書のリストに変換"""
        companies = [
            Company(id=uuid.UUID(UUID_COMPANY_1), name="Company A"),
            Company(id=uuid.UUID(UUID_COMPANY_2), name="Company B"),
        ]
        result = _model_list_to_export_dicts(companies)
        assert len(result) == 2
        assert result[0]["name"] == "Company A"
        assert result[1]["name"] == "Company B"

    def test_empty_list(self):
        """空のリストは空のリストを返す"""
        result = _model_list_to_export_dicts([])
        assert result == []

    def test_exclude_fields(self):
        """除外フィールドを指定"""
        companies = [
            Company(id=uuid.UUID(UUID_COMPANY_1), name="Test", department="Dept")
        ]
        result = _model_list_to_export_dicts(companies, exclude={"department"})
        assert "department" not in result[0]
