from __future__ import annotations

import datetime
import json
from typing import Any

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from models import Report
from services.exporter.stream import (
    CHUNK_SIZE,
    DELTA_REPORT_CHUNK_SIZE,
    export_db_to_ndjson_stream,
    export_delta_ndjson_stream,
)
from tests.factories import insert_company, insert_report, insert_worker


@pytest.mark.asyncio
async def test_export_db_to_ndjson_stream_empty_db_returns_empty_rows(
    db_session: AsyncSession,
) -> None:
    """空DBでは全テーブルについて rows=[] の行が1つずつ返る。"""
    lines = [
        json.loads(line)
        async for line in export_db_to_ndjson_stream(db_session, chunk_size=2)
    ]
    tables: dict[str, list[dict[str, Any]]] = {
        item["table"]: item["rows"] for item in lines
    }

    # 代表的なテーブルについて rows が空配列であることを確認
    for table in ("companies", "workers", "reports"):
        assert table in tables
        assert tables[table] == []


@pytest.mark.asyncio
async def test_export_db_to_ndjson_stream_honors_chunk_boundaries(
    db_session: AsyncSession,
) -> None:
    """チャンク境界（<, ==, > chunk_size）に応じて行数が分割されることを確認。"""
    # companies: 3件作成し、chunk_size=2 で 2+1 に分割されることを検証
    for _ in range(3):
        await insert_company(db_session)

    chunk_size = 2
    lines = [
        json.loads(line)
        async for line in export_db_to_ndjson_stream(db_session, chunk_size=chunk_size)
    ]

    company_lines = [item for item in lines if item["table"] == "companies"]
    lengths = [len(item["rows"]) for item in company_lines]

    # 3件を chunk_size=2 で区切るので [2,1] になるはず
    assert sorted(lengths) == [1, 2]


@pytest.mark.asyncio
async def test_export_db_to_ndjson_stream_raises_on_stream_error(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """session.stream 内で例外が発生した場合、そのまま再スローされる。"""

    async def bad_stream(
        *_: Any, **__: Any
    ) -> Any:  # pragma: no cover - behaviour tested via raise
        raise RuntimeError("db down")

    monkeypatch.setattr(db_session, "stream", bad_stream)

    with pytest.raises(RuntimeError):
        async for _ in export_db_to_ndjson_stream(db_session, chunk_size=CHUNK_SIZE):
            pass


@pytest.mark.asyncio
async def test_export_delta_stream_without_masters_and_no_reports_returns_meta_only(
    db_session: AsyncSession,
) -> None:
    """include_master=False かつ 差分0件では meta 行だけが返る。"""
    since = datetime.datetime.utcnow()

    lines = [
        json.loads(line)
        async for line in export_delta_ndjson_stream(
            db_session,
            since,
            include_master=False,
            chunk_size=CHUNK_SIZE,
            report_chunk_size=DELTA_REPORT_CHUNK_SIZE,
        )
    ]

    assert len(lines) == 1
    meta = lines[0]
    assert meta["type"] == "meta"
    assert meta["syncType"] == "delta"
    assert meta["reportCount"] == 0


@pytest.mark.asyncio
async def test_export_delta_stream_with_reports_and_chunking(
    db_session: AsyncSession,
) -> None:
    """差分レポートが複数あり、report_chunk_size 境界でレポート数と meta.reportCount が一致する。"""
    company = await insert_company(db_session)
    since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)

    # 3レポートを作成し、updated_at>=since となるように調整
    reports: list[Report] = []
    for i in range(3):
        r = await insert_report(
            db_session,
            company_id=company.id,
            report_title=f"Stream Report {i}",
        )
        reports.append(r)

    now = datetime.datetime.utcnow()
    await db_session.execute(
        update(Report)
        .where(Report.id.in_([r.id for r in reports]))
        .values(updated_at=now)
    )
    await db_session.flush()

    report_chunk_size = 2
    lines = [
        json.loads(line)
        async for line in export_delta_ndjson_stream(
            db_session,
            since,
            include_master=False,
            chunk_size=CHUNK_SIZE,
            report_chunk_size=report_chunk_size,
        )
    ]

    *data_lines, meta_line = lines
    meta = meta_line
    assert meta["type"] == "meta"
    assert meta["reportCount"] == 3

    reports_rows = [item for item in data_lines if item["table"] == "reports"]
    total_reports = sum(len(item["rows"]) for item in reports_rows)
    assert total_reports == 3


@pytest.mark.asyncio
async def test_export_delta_stream_include_master_true_streams_masters_and_meta(
    db_session: AsyncSession,
) -> None:
    """include_master=True のとき、マスタ部と meta 行が少なくとも1つずつ返る。"""
    # 最低限、1レポートだけ作成しておく
    worker = await insert_worker(db_session)
    await insert_report(db_session, company_id=worker.company_id)

    since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)

    lines = [
        json.loads(line)
        async for line in export_delta_ndjson_stream(
            db_session,
            since,
            include_master=True,
            chunk_size=1,
            report_chunk_size=1,
        )
    ]

    assert any(item.get("type") == "meta" for item in lines)
    tables = {item.get("table") for item in lines if "table" in item}
    # 代表的なマスタキーが少なくとも1つ含まれていることだけ確認（厳密な順序には依存しない）
    assert "companies" in tables


@pytest.mark.asyncio
async def test_export_delta_stream_raises_when_master_stream_fails(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """マスタ部ストリーム中に例外が起きた場合、その場で再スローされる。"""

    async def bad_stream(
        *_: Any, **__: Any
    ) -> Any:  # pragma: no cover - behaviour tested via raise
        raise RuntimeError("master down")

    monkeypatch.setattr(db_session, "stream", bad_stream)

    since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)

    with pytest.raises(RuntimeError):
        async for _ in export_delta_ndjson_stream(
            db_session,
            since,
            include_master=True,
            chunk_size=CHUNK_SIZE,
        ):
            pass


@pytest.mark.asyncio
async def test_export_delta_stream_raises_when_extract_report_relations_fails(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """差分レポート抽出中に extract_report_relations が失敗した場合、例外が再スローされる。"""
    # 差分対象となるレポートを1件だけ用意
    company = await insert_company(db_session)
    since = datetime.datetime.utcnow() - datetime.timedelta(hours=1)
    await insert_report(
        db_session, company_id=company.id, updated_at=datetime.datetime.utcnow()
    )

    from services.exporter import stream as stream_module

    async def bad_extract(
        *_: Any, **__: Any
    ) -> Any:  # pragma: no cover - behaviour tested via raise
        raise RuntimeError("extract failed")

    monkeypatch.setattr(stream_module, "extract_report_relations", bad_extract)

    with pytest.raises(RuntimeError):
        async for _ in export_delta_ndjson_stream(
            db_session,
            since,
            include_master=False,
            chunk_size=CHUNK_SIZE,
            report_chunk_size=1,
        ):
            pass
