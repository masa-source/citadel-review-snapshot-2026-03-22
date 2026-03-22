"""
exporter/stream.py のインテグレーションテスト
"""

import json

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from services.exporter.stream import export_db_to_ndjson_stream


@pytest.mark.asyncio
async def test_export_db_to_ndjson_stream_empty_db_emits_rows_empty(
    db_session: AsyncSession,
) -> None:
    """データが 0 件の場合に rows: [] が 1 行ずつ出力される。"""
    lines: list[str] = []
    async for line in export_db_to_ndjson_stream(db_session):
        lines.append(line)
    assert len(lines) >= 1
    for line in lines:
        data = json.loads(line)
        assert "table" in data
        assert data["rows"] == []
