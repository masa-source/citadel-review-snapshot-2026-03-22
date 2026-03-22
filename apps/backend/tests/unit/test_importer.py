"""
importer.py のユニットテスト
"""

from services.importer import _resolve
from tests.helpers import (
    UUID_COMPANY_1,
    UUID_COMPANY_2,
)


class TestResolve:
    """_resolve() 関数のテスト"""

    def test_resolve_existing_id(self):
        """存在するIDを解決できる"""
        id_map = {
            "companies": {
                UUID_COMPANY_1: "resolved-uuid-1",
                UUID_COMPANY_2: "resolved-uuid-2",
            }
        }
        result = _resolve(id_map, "companies", UUID_COMPANY_1)
        assert result == "resolved-uuid-1"

    def test_resolve_none_id(self):
        """None を渡すと None を返す"""
        id_map = {"companies": {UUID_COMPANY_1: "resolved-uuid"}}
        result = _resolve(id_map, "companies", None)
        assert result is None

    def test_resolve_missing_id(self):
        """存在しないIDは None を返す"""
        id_map = {"companies": {UUID_COMPANY_1: "resolved-uuid"}}
        result = _resolve(id_map, "companies", "99999999-9999-9999-9999-999999999999")
        assert result is None

    def test_resolve_missing_table(self):
        """存在しないテーブルは None を返す"""
        id_map = {"companies": {UUID_COMPANY_1: "resolved-uuid"}}
        result = _resolve(id_map, "workers", UUID_COMPANY_1)
        assert result is None

    def test_resolve_empty_map(self):
        """空のマップでも動作する"""
        id_map = {}
        result = _resolve(id_map, "companies", UUID_COMPANY_1)
        assert result is None
