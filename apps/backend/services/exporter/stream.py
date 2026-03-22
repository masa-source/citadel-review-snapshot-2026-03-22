"""
NDJSON ストリーミングエクスポート。yield_per でチャンク取得し、1行1JSONで yield する。
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import (
    Report,
)
from services.sync_meta import SYNC_TABLES
from utils.serialization import model_to_export_dict, to_camel

from ._serialize import extract_report_relations

logger = logging.getLogger(__name__)


# フルエクスポートのテーブル順（camelCase）。フロントの TABLE_KEYS と一致させる。
FULL_EXPORT_TABLES: list[tuple[str, type]] = [
    (to_camel(t.table_name), t.model_class) for t in SYNC_TABLES
]

CHUNK_SIZE = 500


def _rows_to_ndjson_line(table: str, rows: list[dict[str, Any]]) -> str:
    """1行の NDJSON 文字列を返す（末尾に改行付き）。"""
    return json.dumps({"table": table, "rows": rows}, ensure_ascii=False) + "\n"


async def export_db_to_ndjson_stream(
    session: AsyncSession,
    *,
    chunk_size: int = CHUNK_SIZE,
) -> AsyncGenerator[str, None]:
    """
    全テーブルを yield_per でチャンク取得し、NDJSON 形式で yield する。
    各行は {"table": "companies", "rows": [...]} の形。空テーブルは rows: [] を1行送る。
    """
    for table_name, model_class in FULL_EXPORT_TABLES:
        try:
            stmt = select(model_class).execution_options(yield_per=chunk_size)
            emitted_any = False
            result = await session.stream(stmt)
            try:
                chunk: list = []
                async for row in result:
                    # row は Row。select(Model) のため row[0] が ORM インスタンス。
                    chunk.append(model_to_export_dict(row[0]))
                    if len(chunk) >= chunk_size:
                        yield _rows_to_ndjson_line(table_name, chunk)
                        emitted_any = True
                        chunk = []
                if chunk:
                    yield _rows_to_ndjson_line(table_name, chunk)
                    emitted_any = True
            finally:
                await result.close()
            if not emitted_any:
                yield _rows_to_ndjson_line(table_name, [])
        except Exception as e:
            logger.exception("NDJSON stream テーブル %s でエラー: %s", table_name, e)
            raise


# Delta 用: マスタは is_master == True のもの
DELTA_MASTER_TABLES = [
    (to_camel(t.table_name), t.model_class) for t in SYNC_TABLES if t.is_master
]

# 差分レポートのチャンクサイズ（レポート件数）
DELTA_REPORT_CHUNK_SIZE = 50


async def export_delta_ndjson_stream(
    session: AsyncSession,
    since: datetime,
    include_master: bool = False,
    *,
    chunk_size: int = CHUNK_SIZE,
    report_chunk_size: int = DELTA_REPORT_CHUNK_SIZE,
) -> AsyncGenerator[str, None]:
    """
    指定日時以降に更新されたレポートとその関連データを NDJSON で yield する。
    include_master 時は先にマスタ 7 テーブルをフルと同様にストリームし、続けて差分レポートをチャンクで送る。
    最後にメタ行を1行送る: {"type": "meta", "syncType": "delta", "since": "...", "syncedAt": "...", "reportCount": N}
    """
    if include_master:
        for table_name, model_class in DELTA_MASTER_TABLES:
            try:
                stmt = select(model_class).execution_options(yield_per=chunk_size)
                emitted_any = False
                result = await session.stream(stmt)
                try:
                    chunk_list: list = []
                    async for row in result:
                        chunk_list.append(model_to_export_dict(row[0]))
                        if len(chunk_list) >= chunk_size:
                            yield _rows_to_ndjson_line(table_name, chunk_list)
                            emitted_any = True
                            chunk_list = []
                    if chunk_list:
                        yield _rows_to_ndjson_line(table_name, chunk_list)
                        emitted_any = True
                finally:
                    await result.close()
                if not emitted_any:
                    yield _rows_to_ndjson_line(table_name, [])
            except Exception as e:
                logger.exception(
                    "NDJSON delta stream マスタ %s でエラー: %s", table_name, e
                )
                raise

    # 差分レポート ID 一覧を取得
    id_result = await session.execute(
        select(Report.id).where(Report.updated_at >= since)  # type: ignore[reportCallIssue]  # SQLAlchemy select().where() の型が pyright で未解決
    )
    report_ids = [row[0] for row in id_result.all()]
    logger.info("Delta stream: %d 件のレポートを取得", len(report_ids))

    report_count = 0
    for i in range(0, len(report_ids), report_chunk_size):
        chunk_ids = report_ids[i : i + report_chunk_size]
        result = await session.execute(
            select(Report)
            .where(Report.id.in_(chunk_ids))
            .options(
                selectinload(Report.report_sites),
                selectinload(Report.report_clients),
                selectinload(Report.report_workers),
                selectinload(Report.target_instruments),
                selectinload(Report.target_instrument_tables),
                selectinload(Report.report_owned_instruments),
            )
        )
        report_objs = result.scalars().all()

        extracted = await extract_report_relations(session, report_objs)

        report_count += len(report_objs)

        yield _rows_to_ndjson_line("reports", extracted["reports"])
        yield _rows_to_ndjson_line("reportSites", extracted["reportSites"])
        yield _rows_to_ndjson_line("reportClients", extracted["reportClients"])
        yield _rows_to_ndjson_line("reportWorkers", extracted["reportWorkers"])
        yield _rows_to_ndjson_line("targetInstruments", extracted["targetInstruments"])
        yield _rows_to_ndjson_line(
            "targetInstrumentTables", extracted["targetInstrumentTables"]
        )
        yield _rows_to_ndjson_line("usedParts", extracted["usedParts"])
        yield _rows_to_ndjson_line(
            "reportOwnedInstruments", extracted["reportOwnedInstruments"]
        )

    meta_line = (
        json.dumps(
            {
                "type": "meta",
                "syncType": "delta",
                "since": since.isoformat(),
                "syncedAt": datetime.utcnow().isoformat(),
                "reportCount": report_count,
            },
            ensure_ascii=False,
        )
        + "\n"
    )
    yield meta_line
