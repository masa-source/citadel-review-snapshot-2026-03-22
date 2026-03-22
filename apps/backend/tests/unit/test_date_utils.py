"""
日時変換ユーティリティ（parse_iso_to_utc_naive）の単体テスト

DB検索用に ISO 日時文字列を Naive UTC に変換する処理を検証する。
SQLite 環境のテストでも共通ユーティリティの動作を確認し、
本番環境（PostgreSQL TIMESTAMP WITHOUT TIME ZONE）での型不一致を防ぐ。
"""

from datetime import datetime

from utils.date_utils import parse_iso_to_utc_naive


class TestParseIsoToUtcNaive:
    """parse_iso_to_utc_naive の検証"""

    def test_utc_z_suffix(self) -> None:
        """UTC ("Z") 付き: 2024-01-01T10:00:00Z → 2024-01-01 10:00:00 (Naive)"""
        result = parse_iso_to_utc_naive("2024-01-01T10:00:00Z")
        assert result == datetime(2024, 1, 1, 10, 0, 0)
        assert result.tzinfo is None

    def test_jst_offset_converted_to_utc(self) -> None:
        """JST (+09:00) 付き: 2024-01-01T19:00:00+09:00 → 2024-01-01 10:00:00 (Naive) - 時間がずれてUTCになること"""
        result = parse_iso_to_utc_naive("2024-01-01T19:00:00+09:00")
        assert result == datetime(2024, 1, 1, 10, 0, 0)
        assert result.tzinfo is None

    def test_naive_unchanged(self) -> None:
        """タイムゾーンなし: 2024-01-01T10:00:00 → 2024-01-01 10:00:00 (Naive) - そのまま"""
        result = parse_iso_to_utc_naive("2024-01-01T10:00:00")
        assert result == datetime(2024, 1, 1, 10, 0, 0)
        assert result.tzinfo is None
