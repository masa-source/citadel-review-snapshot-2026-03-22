"""
レポートコンテキスト用の Pydantic モデル。
ORM (SQLModel) から `ReportContextRoot.model_validate(report)` で生成し、
@computed_field を用いてフロントエンドや PDF/Excel 出力用の階層データ（ByRole 等）を自動構築する枠組みを提供する。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field

from utils.serialization import to_camel


class ContextBaseModel(BaseModel):
    """
    設定のベースクラス：
    - ORM インスタンスから生成可能 (from_attributes=True)
    - フィールドのキャメルケース別名を自動生成し出力する (alias_generator)
    - 未定義の DB 列が新設されても落ちないようにする (extra="allow")
    """

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
        extra="allow",
    )


class CompanyContext(ContextBaseModel):
    id: UUID
    name: str | None = None
    department: str | None = None
    postal_code: str | None = None
    address: str | None = None
    phone: str | None = None
    fax: str | None = None
    email: str | None = None


class WorkerContext(ContextBaseModel):
    id: UUID
    name: str | None = None
    company_id: UUID | None = None
    seal_image_url: str | None = None
    company: CompanyContext | None = None


class ReportWorkerItemContext(ContextBaseModel):
    id: UUID
    report_id: UUID | None = None
    worker_id: UUID | None = None
    worker_role: str | None = None
    role_key: str | None = None
    sort_order: int | None = None
    worker: WorkerContext | None = None


class InstrumentContext(ContextBaseModel):
    id: UUID
    name: str | None = None
    company_id: UUID | None = None
    model_number: str | None = None
    maintenance_cycle: str | None = None
    company: CompanyContext | None = None


class TargetInstrumentTableItemContext(ContextBaseModel):
    id: UUID
    target_instrument_id: UUID | None = None
    table_definition_id: UUID | None = None
    report_id: UUID | None = None
    role_key: str | None = None
    sort_order: int | None = None
    rows: list[dict[str, Any]] | None = None


class TargetInstrumentContext(ContextBaseModel):
    id: UUID
    instrument_id: UUID | None = None
    report_id: UUID | None = None
    schema_id: UUID | None = None
    tag_number: str | None = None
    sort_order: int | None = None
    custom_data: dict[str, Any] | None = None
    instrument: InstrumentContext | None = None
    target_instrument_tables: list[TargetInstrumentTableItemContext] = []

    @computed_field
    def tables_by_role(self) -> dict[str, TargetInstrumentTableItemContext]:
        tables = sorted(self.target_instrument_tables, key=lambda x: x.sort_order or 0)
        return {str(t.role_key): t for t in tables if t.role_key}

    @computed_field
    def tables_ordered(self) -> list[TargetInstrumentTableItemContext | None]:
        tables = sorted(self.target_instrument_tables, key=lambda x: x.sort_order or 0)
        return [None] + tables if tables else []


class PartContext(ContextBaseModel):
    id: UUID
    name: str | None = None
    part_number: str | None = None
    company_id: UUID | None = None
    category: str | None = None
    company: CompanyContext | None = None


class UsedPartItemContext(ContextBaseModel):
    id: UUID
    report_id: UUID | None = None
    part_id: UUID | None = None
    quantity: int | None = None
    notes: str | None = None
    sort_order: int | None = None
    part: PartContext | None = None


class SiteContext(ContextBaseModel):
    id: UUID
    name: str | None = None
    company_id: UUID | None = None


class ReportSiteItemContext(ContextBaseModel):
    id: UUID
    report_id: UUID | None = None
    site_id: UUID | None = None
    role_key: str | None = None
    sort_order: int | None = None
    site: SiteContext | None = None


class ReportClientItemContext(ContextBaseModel):
    id: UUID
    report_id: UUID | None = None
    company_id: UUID | None = None
    role_key: str | None = None
    sort_order: int | None = None
    company: CompanyContext | None = None


class OwnedInstrumentContext(ContextBaseModel):
    id: UUID
    company_id: UUID | None = None
    instrument_id: UUID | None = None
    instrument_type: str | None = None
    instrument: InstrumentContext | None = None
    company: CompanyContext | None = None


class ReportOwnedInstrumentItemContext(ContextBaseModel):
    id: UUID
    report_id: UUID | None = None
    owned_instrument_id: UUID | None = None
    sort_order: int | None = None
    owned_instrument: OwnedInstrumentContext | None = None


class ReportContextRoot(ContextBaseModel):
    """
    レポートコンテキストのルート。
    リレーションを Pydantic モデルのリストとして持ち、
    @computed_field を通じて旧辞書互換の ByRole や Ordered キーを展開する。
    """

    id: UUID
    report_type: str | None = None
    report_title: str | None = None
    control_number: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    company_id: UUID | None = None
    schema_id: UUID | None = None
    custom_data: dict[str, Any] | None = None
    report_snapshot: dict[str, Any] | None = None

    company: CompanyContext | None = None

    report_sites: list[ReportSiteItemContext] = Field(
        default_factory=list, exclude=True
    )
    report_clients: list[ReportClientItemContext] = Field(
        default_factory=list, exclude=True
    )
    report_workers: list[ReportWorkerItemContext] = Field(
        default_factory=list, exclude=True
    )
    target_instruments: list[TargetInstrumentContext] = Field(
        default_factory=list, exclude=True
    )
    report_owned_instruments: list[ReportOwnedInstrumentItemContext] = Field(
        default_factory=list, exclude=True
    )
    used_parts: list[UsedPartItemContext] = Field(default_factory=list, exclude=True)

    # --- Computed properties (Report Sites) ---
    @computed_field
    def report_sites_by_role(self) -> dict[str, ReportSiteItemContext]:
        return {str(i.role_key): i for i in self.report_sites if i.role_key}

    @computed_field
    def report_sites_ordered(self) -> list[ReportSiteItemContext | None]:
        return [None] + self.report_sites if self.report_sites else []

    @computed_field
    def report_site_primary(self) -> ReportSiteItemContext | None:
        return self.report_sites[0] if self.report_sites else None

    # --- Computed properties (Report Clients) ---
    @computed_field
    def report_clients_by_company_id(self) -> dict[str, ReportClientItemContext]:
        return {str(i.company_id): i for i in self.report_clients if i.company_id}

    @computed_field
    def report_clients_by_role(self) -> dict[str, ReportClientItemContext]:
        return {str(i.role_key): i for i in self.report_clients if i.role_key}

    @computed_field
    def report_clients_ordered(self) -> list[ReportClientItemContext | None]:
        return [None] + self.report_clients if self.report_clients else []

    @computed_field
    def report_client_primary(self) -> ReportClientItemContext | None:
        return self.report_clients[0] if self.report_clients else None

    # --- Computed properties (Report Workers) ---
    @computed_field
    def report_workers_by_worker_id(self) -> dict[str, ReportWorkerItemContext]:
        return {str(i.worker_id): i for i in self.report_workers if i.worker_id}

    @computed_field
    def report_workers_by_role(self) -> dict[str, ReportWorkerItemContext]:
        return {str(i.role_key): i for i in self.report_workers if i.role_key}

    @computed_field
    def report_workers_ordered(self) -> list[ReportWorkerItemContext | None]:
        return [None] + self.report_workers if self.report_workers else []

    @computed_field
    def report_worker_primary(self) -> ReportWorkerItemContext | None:
        return self.report_workers[0] if self.report_workers else None

    # --- Computed properties (Target Instruments) ---
    @computed_field
    def target_instruments_by_id(self) -> dict[str, TargetInstrumentContext]:
        return {str(i.id): i for i in self.target_instruments if i.id}

    @computed_field
    def target_instruments_by_tag_number(self) -> dict[str, TargetInstrumentContext]:
        return {str(i.tag_number): i for i in self.target_instruments if i.tag_number}

    @computed_field
    def target_instruments_ordered(self) -> list[TargetInstrumentContext | None]:
        return [None] + self.target_instruments if self.target_instruments else []

    @computed_field
    def target_instrument_primary(self) -> TargetInstrumentContext | None:
        return self.target_instruments[0] if self.target_instruments else None

    # --- Computed properties (Report Owned Instruments) ---
    @computed_field
    def report_owned_instruments_by_owned_instrument_id(
        self,
    ) -> dict[str, ReportOwnedInstrumentItemContext]:
        return {
            str(i.owned_instrument_id): i
            for i in self.report_owned_instruments
            if i.owned_instrument_id
        }

    @computed_field
    def report_owned_instruments_by_type(
        self,
    ) -> dict[str, list[ReportOwnedInstrumentItemContext]]:
        res: dict[str, list[ReportOwnedInstrumentItemContext]] = {}
        for i in self.report_owned_instruments:
            k = "_"
            if i.owned_instrument and i.owned_instrument.instrument_type:
                k = str(i.owned_instrument.instrument_type).strip() or "_"
            if k not in res:
                res[k] = []
            res[k].append(i)
        return res

    @computed_field
    def report_owned_instruments_ordered(
        self,
    ) -> list[ReportOwnedInstrumentItemContext | None]:
        return (
            [None] + self.report_owned_instruments
            if self.report_owned_instruments
            else []
        )

    @computed_field
    def report_owned_instrument_primary(
        self,
    ) -> ReportOwnedInstrumentItemContext | None:
        return (
            self.report_owned_instruments[0] if self.report_owned_instruments else None
        )

    # --- Computed properties (Used Parts) ---
    @computed_field
    def used_parts_by_id(self) -> dict[str, UsedPartItemContext]:
        return {str(i.id): i for i in self.used_parts if i.id}

    @computed_field
    def used_parts_by_category(self) -> dict[str, list[UsedPartItemContext]]:
        res: dict[str, list[UsedPartItemContext]] = {}
        for i in self.used_parts:
            k = "_"
            if i.part and i.part.category:
                k = str(i.part.category).strip() or "_"
            if k not in res:
                res[k] = []
            res[k].append(i)
        return res

    @computed_field
    def used_parts_ordered(self) -> list[UsedPartItemContext | None]:
        return [None] + self.used_parts if self.used_parts else []

    @computed_field
    def used_part_primary(self) -> UsedPartItemContext | None:
        return self.used_parts[0] if self.used_parts else None
