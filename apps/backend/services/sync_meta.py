"""
バックエンドの同期（インポート・エクスポート）におけるテーブルメタデータの統合定義。
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlmodel import SQLModel

from models import (
    Company,
    Instrument,
    OwnedInstrument,
    Part,
    Report,
    ReportClient,
    ReportFormat,
    ReportOwnedInstrument,
    ReportSite,
    ReportWorker,
    SchemaDefinition,
    Site,
    TableDefinition,
    TargetInstrument,
    TargetInstrumentTable,
    UsedPart,
    Worker,
)


@dataclass
class SyncTableConfig:
    table_name: str
    model_class: type[SQLModel]
    is_master: bool
    items_attr: str

    # マスタテーブル用: (親テーブル名, 親の外部キー属性名) のリスト
    parent_resolvers: list[tuple[str, str]] | None = None

    # 子テーブル（レポート関連）用
    fk_mappings: dict[str, str] | None = None
    role_key_prefix: str | None = None
    extra_fields_extractor: Callable[[Any, int], dict] | None = None
    sort_order_attr: str = "sort_order"
    id_map_key: str | None = None


def _worker_role_extra(rw: Any, idx: int) -> dict:
    return {"worker_role": getattr(rw, "worker_role", None)}


def _target_instrument_extra(item: Any, idx: int) -> dict:
    cd = getattr(item, "custom_data", None)
    return {
        "tag_number": getattr(item, "tag_number", None),
        "custom_data": cd if isinstance(cd, dict) else None,
    }


def _target_instrument_table_extra(item: Any, idx: int) -> dict:
    rows = getattr(item, "rows", None)
    return {
        "role_key": getattr(item, "role_key", None),
        "rows": rows if isinstance(rows, list) else None,
    }


def _used_part_extra(item: Any, idx: int) -> dict:
    return {
        "quantity": getattr(item, "quantity", 0) or 0,
        "notes": getattr(item, "notes", None),
    }


# --- 各テーブル名に対応する Pydantic(SQLModel) クラスのマップ ---
MODEL_MAP: dict[str, type[SQLModel]] = {
    "companies": Company,
    "workers": Worker,
    "instruments": Instrument,
    "schema_definitions": SchemaDefinition,
    "sites": Site,
    "parts": Part,
    "owned_instruments": OwnedInstrument,
    "table_definitions": TableDefinition,
    "report_formats": ReportFormat,
    "reports": Report,
    "report_sites": ReportSite,
    "report_clients": ReportClient,
    "report_workers": ReportWorker,
    "target_instruments": TargetInstrument,
    "target_instrument_tables": TargetInstrumentTable,
    "used_parts": UsedPart,
    "report_owned_instruments": ReportOwnedInstrument,
}

# --- Generator で指定された抽出関数名に対する実際の関数のマップ ---
EXTRA_EXTRACTOR_MAP: dict[str, Callable[[Any, int], dict]] = {
    "_worker_role_extra": _worker_role_extra,
    "_target_instrument_extra": _target_instrument_extra,
    "_target_instrument_table_extra": _target_instrument_table_extra,
    "_used_part_extra": _used_part_extra,
}

# --- config に自動生成されたメタデータをインポート ---
try:
    from config.schema_meta_generated import GENERATED_SYNC_TABLES_META
except ImportError:
    GENERATED_SYNC_TABLES_META = []

# --- ジェネレータのメタデータを展開して SyncTableConfig のリストを生成 ---
SYNC_TABLES: list[SyncTableConfig] = []
for meta_data in GENERATED_SYNC_TABLES_META:
    table_name = meta_data["table_name"]
    kwargs = {
        "table_name": table_name,
        "model_class": MODEL_MAP[table_name],
        "is_master": meta_data["is_master"],
        "items_attr": meta_data["items_attr"],
    }

    if "parent_resolvers" in meta_data:
        # Tupleのリストなどに再構築
        kwargs["parent_resolvers"] = [tuple(p) for p in meta_data["parent_resolvers"]]
    if "fk_mappings" in meta_data:
        kwargs["fk_mappings"] = meta_data["fk_mappings"]
    if "role_key_prefix" in meta_data:
        kwargs["role_key_prefix"] = meta_data["role_key_prefix"]
    if "id_map_key" in meta_data:
        kwargs["id_map_key"] = meta_data["id_map_key"]

    if "extra_fields_extractor_name" in meta_data:
        func_name = meta_data["extra_fields_extractor_name"]
        kwargs["extra_fields_extractor"] = EXTRA_EXTRACTOR_MAP.get(func_name)

    SYNC_TABLES.append(SyncTableConfig(**kwargs))
