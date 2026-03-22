"""
日時変換ユーティリティ（DB検索用）

PostgreSQL の TIMESTAMP WITHOUT TIME ZONE 型に合わせて、
クライアントから送られる ISO 日時文字列を安全に Naive UTC に変換する。
"""

from datetime import UTC, datetime


def parse_iso_to_utc_naive(date_str: str) -> datetime:
    """
    ISO 8601 形式の日時文字列をパースし、
    DB検索用（TIMESTAMP WITHOUT TIME ZONE）の Naive UTC datetime に変換する。

    Args:
        date_str: ISO 8601形式の文字列 (例: "2024-01-01T09:00:00+09:00", "2024-01-01T00:00:00Z")

    Returns:
        datetime: タイムゾーン情報を持たない UTC 日時
    """
    # 1. タイムゾーン対応でパース（Python 3.11+ では "Z" をネイティブ解釈）
    dt = datetime.fromisoformat(date_str)

    # 2. タイムゾーン情報がある場合は UTC に変換してから削除
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC).replace(tzinfo=None)

    return dt
