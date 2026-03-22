"""
db.json 準拠のリレーショナルモデル定義 (SQLModel).
テーブル名・カラム名は snake_case。API/JSON は Pydantic の model_dump(by_alias=True) で camelCase に統一。
"""

import enum
import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import ConfigDict
from sqlalchemy import Column, Date, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import JSON, TypeDecorator
from sqlmodel import Field, Relationship, SQLModel

from config.validation import (
    MAX_ADDRESS_LENGTH,
    MAX_COMPANY_NAME_LENGTH,
    MAX_CONTROL_NUMBER_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_EMAIL_LENGTH,
    MAX_FAX_LENGTH,
    MAX_INSTRUMENT_NAME_LENGTH,
    MAX_LOCATION_LENGTH,
    MAX_MAINTENANCE_CYCLE_LENGTH,
    MAX_MODEL_NUMBER_LENGTH,
    MAX_PART_NAME_LENGTH,
    MAX_PART_NUMBER_LENGTH,
    MAX_PHONE_LENGTH,
    MAX_POSTAL_CODE_LENGTH,
    MAX_REPORT_TITLE_LENGTH,
    MAX_SITE_NAME_LENGTH,
    MAX_WORKER_NAME_LENGTH,
)
from utils.serialization import to_camel

# 全テーブルモデルで camelCase エイリアスを有効化（model_dump(by_alias=True) と openapi 一致用）
_table_config = ConfigDict(alias_generator=to_camel)
# Base クラス（Schema と共有）用。API で extra 無視・populate_by_name を有効にする
_base_schema_config = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    extra="ignore",
)


class GUID(TypeDecorator):
    """
    PostgreSQL ネイティブの UUID 型。
    SQLite 依存を排除し、PostgreSQL 専用の実装に一本化。
    """

    impl = PG_UUID(as_uuid=True)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(PG_UUID(as_uuid=True))

    def process_bind_param(self, value, dialect):
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        # 文字列として入っている場合
        return uuid.UUID(str(value))


# UUID 主キー用のヘルパー関数
def uuid_pk() -> Field:
    return Field(
        default_factory=uuid.uuid4,
        sa_column=Column(GUID(), primary_key=True),
    )


def uuid_fk(foreign_key: str) -> Field:
    return Field(
        default=None,
        sa_column=Column(GUID(), ForeignKey(foreign_key)),
    )


# --- マスタ系 ---


class CompanyBase(SQLModel, table=False):
    """会社の共通フィールド。Model と Schema で継承する。"""

    model_config = _base_schema_config
    name: str | None = Field(default=None, max_length=MAX_COMPANY_NAME_LENGTH)
    department: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=MAX_POSTAL_CODE_LENGTH)
    address: str | None = Field(default=None, max_length=MAX_ADDRESS_LENGTH)
    phone: str | None = Field(default=None, max_length=MAX_PHONE_LENGTH)
    fax: str | None = Field(default=None, max_length=MAX_FAX_LENGTH)
    email: str | None = Field(default=None, max_length=MAX_EMAIL_LENGTH)


class Company(CompanyBase, table=True):
    __tablename__ = "companies"
    model_config = _table_config
    id: uuid.UUID = uuid_pk()

    workers: list["Worker"] = Relationship(back_populates="company")
    instruments: list["Instrument"] = Relationship(back_populates="company")
    parts: list["Part"] = Relationship(back_populates="company")
    owned_instruments: list["OwnedInstrument"] = Relationship(back_populates="company")
    sites: list["Site"] = Relationship(back_populates="company")
    reports: list["Report"] = Relationship(back_populates="company")
    report_clients: list["ReportClient"] = Relationship(back_populates="company")


class WorkerBase(SQLModel, table=False):
    """作業者の共通フィールド。"""

    model_config = _base_schema_config
    name: str | None = Field(default=None, max_length=MAX_WORKER_NAME_LENGTH)
    company_id: uuid.UUID | None = None
    seal_image_url: str | None = None


class Worker(WorkerBase, table=True):
    __tablename__ = "workers"
    model_config = _table_config
    id: uuid.UUID = uuid_pk()
    company_id: uuid.UUID | None = uuid_fk("companies.id")

    company: Company | None = Relationship(back_populates="workers")
    report_workers: list["ReportWorker"] = Relationship(back_populates="worker")


class InstrumentBase(SQLModel, table=False):
    """計器の共通フィールド。"""

    model_config = _base_schema_config
    name: str | None = Field(default=None, max_length=MAX_INSTRUMENT_NAME_LENGTH)
    company_id: uuid.UUID | None = None
    model_number: str | None = Field(default=None, max_length=MAX_MODEL_NUMBER_LENGTH)
    maintenance_cycle: str | None = Field(
        default=None, max_length=MAX_MAINTENANCE_CYCLE_LENGTH
    )


class Instrument(InstrumentBase, table=True):
    __tablename__ = "instruments"
    model_config = _table_config
    id: uuid.UUID = uuid_pk()
    company_id: uuid.UUID | None = uuid_fk("companies.id")

    company: Company | None = Relationship(back_populates="instruments")
    owned_instruments: list["OwnedInstrument"] = Relationship(
        back_populates="instrument"
    )
    target_instruments: list["TargetInstrument"] = Relationship(
        back_populates="instrument"
    )


class ReportTemplate(SQLModel, table=True):
    """テンプレート部品（物理的な Excel ファイル）を管理。種別・順序は ReportFormatTemplate で管理。"""

    __tablename__ = "report_templates"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()
    name: str | None = None
    file_path: str | None = None
    # スマート検疫: 最終検疫時に記録したファイルの mtime（一致すれば検疫スキップ）
    last_verified_mtime: float | None = Field(
        default=None, sa_column=Column(Float, nullable=True)
    )
    # シート名不一致検知用: JSON 配列文字列（例: ["Sheet1","Sheet2"]）
    sheet_names: str | None = None

    report_format_templates: list["ReportFormatTemplate"] = Relationship(
        back_populates="report_template"
    )


class ReportFormat(SQLModel, table=True):
    """レポート種別（例: 定期点検報告書）を管理する親モデル。ReportFormat.id が Report.report_format_id と対応し、name は表示用ラベルとして扱う。"""

    __tablename__ = "report_formats"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()
    name: str | None = None

    report_format_templates: list["ReportFormatTemplate"] = Relationship(
        back_populates="report_format"
    )
    reports: list["Report"] = Relationship(back_populates="report_format")


class ReportFormatTemplate(SQLModel, table=True):
    """どの種別に・どのテンプレートを・何番目(sort_order)に出力するかを管理する中継モデル。"""

    __tablename__ = "report_format_templates"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()
    report_format_id: uuid.UUID | None = uuid_fk("report_formats.id")
    report_template_id: uuid.UUID | None = uuid_fk("report_templates.id")
    sort_order: int | None = None

    report_format: ReportFormat | None = Relationship(
        back_populates="report_format_templates"
    )
    report_template: ReportTemplate | None = Relationship(
        back_populates="report_format_templates"
    )


class SchemaDefinitionBase(SQLModel, table=False):
    """SchemaDefinition の共通フィールド。"""

    model_config = _base_schema_config
    target_entity: str | None = None  # "report" | "target_instrument" 等
    version: str | None = None
    json_schema: dict | None = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
    )
    ui_schema: dict | None = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
    )


class SchemaDefinition(SchemaDefinitionBase, table=True):
    """動的フォーム・帳票用の JSON Schema 定義。target_entity は "report" | "target_instrument" 等。"""

    __tablename__ = "schema_definitions"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()

    reports: list["Report"] = Relationship(back_populates="schema_definition")
    target_instruments: list["TargetInstrument"] = Relationship(
        back_populates="schema_definition"
    )


class TableDefinitionBase(SQLModel, table=False):
    """TableDefinition の共通フィールド。"""

    model_config = _base_schema_config
    name: str | None = None
    role_key: str | None = (
        None  # Scout の役割キーフォームのデフォルト（例: pressure_measurement）
    )
    columns: list | None = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
    )


class TableDefinition(TableDefinitionBase, table=True):
    """表定義マスタ。列構成を JSON で保持し、TargetInstrumentTable から参照される。"""

    __tablename__ = "table_definitions"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()

    target_instrument_tables: list["TargetInstrumentTable"] = Relationship(
        back_populates="table_definition"
    )


class SiteBase(SQLModel, table=False):
    """現場・プロジェクトの共通フィールド。"""

    model_config = _base_schema_config
    name: str | None = Field(default=None, max_length=MAX_SITE_NAME_LENGTH)
    company_id: uuid.UUID | None = None
    location: str | None = Field(default=None, max_length=MAX_LOCATION_LENGTH)
    description: str | None = Field(default=None, max_length=MAX_DESCRIPTION_LENGTH)


class Site(SiteBase, table=True):
    """現場・プロジェクト。Report は ReportSite 経由で多対多紐づく。"""

    __tablename__ = "sites"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()
    company_id: uuid.UUID | None = uuid_fk("companies.id")

    company: Company | None = Relationship(back_populates="sites")
    report_sites: list["ReportSite"] = Relationship(back_populates="site")


class PartBase(SQLModel, table=False):
    """部品の共通フィールド。"""

    model_config = _base_schema_config
    name: str | None = Field(default=None, max_length=MAX_PART_NAME_LENGTH)
    part_number: str | None = Field(default=None, max_length=MAX_PART_NUMBER_LENGTH)
    company_id: uuid.UUID | None = None
    category: str | None = None  # 用途カテゴリの論理キー（例: seal, consumables）


class Part(PartBase, table=True):
    __tablename__ = "parts"
    model_config = _table_config
    id: uuid.UUID = uuid_pk()
    company_id: uuid.UUID | None = uuid_fk("companies.id")

    company: Company | None = Relationship(back_populates="parts")
    used_parts: list["UsedPart"] = Relationship(back_populates="part")


class OwnedInstrumentBase(SQLModel, table=False):
    """所有計器の共通フィールド。Model と Schema で継承する。"""

    model_config = _base_schema_config
    equipment_name: str | None = None
    equipment_number: str | None = None
    management_number: str | None = None
    instrument_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None
    cal_at: date | None = Field(
        default=None,
        sa_column=Column(Date, nullable=True),
    )
    cal_number: str | None = None
    instrument_type: str | None = (
        None  # 種別の論理キー（例: standard_pressure_gauge, digital_multimeter）
    )


class OwnedInstrument(OwnedInstrumentBase, table=True):
    __tablename__ = "owned_instruments"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()
    instrument_id: uuid.UUID | None = uuid_fk("instruments.id")
    company_id: uuid.UUID | None = uuid_fk("companies.id")

    instrument: Instrument | None = Relationship(back_populates="owned_instruments")
    company: Company | None = Relationship(back_populates="owned_instruments")
    report_owned_instruments: list["ReportOwnedInstrument"] = Relationship(
        back_populates="owned_instrument"
    )


# --- トランザクション系 (Report 関連) ---


class ReportBase(SQLModel, table=False):
    """Report の共通フィールド。"""

    model_config = _base_schema_config
    report_title: str | None = Field(default=None, max_length=MAX_REPORT_TITLE_LENGTH)
    control_number: str | None = Field(
        default=None, max_length=MAX_CONTROL_NUMBER_LENGTH
    )
    company_id: uuid.UUID | None = None
    schema_id: uuid.UUID | None = None
    custom_data: dict | None = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=True),
    )


class Report(ReportBase, table=True):
    __tablename__ = "reports"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()
    created_at: datetime | None = Field(default_factory=datetime.utcnow)
    updated_at: datetime | None = Field(default_factory=datetime.utcnow)
    company_id: uuid.UUID | None = uuid_fk("companies.id")
    schema_id: uuid.UUID | None = uuid_fk("schema_definitions.id")
    report_format_id: uuid.UUID | None = uuid_fk("report_formats.id")
    report_snapshot: dict | None = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
    )

    company: Company | None = Relationship(back_populates="reports")
    report_format: ReportFormat | None = Relationship(back_populates="reports")
    report_sites: list["ReportSite"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    schema_definition: Optional["SchemaDefinition"] = Relationship(
        back_populates="reports"
    )
    report_workers: list["ReportWorker"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    report_clients: list["ReportClient"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    target_instruments: list["TargetInstrument"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    report_owned_instruments: list["ReportOwnedInstrument"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    used_parts: list["UsedPart"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    target_instrument_tables: list["TargetInstrumentTable"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    mission_reports: list["MissionReport"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class ReportSiteBase(SQLModel, table=False):
    """ReportSite の共通フィールド。"""

    model_config = _base_schema_config
    report_id: uuid.UUID | None = None
    site_id: uuid.UUID | None = None
    role_key: str | None = None  # テンプレート用論理キー（例: main, sub）
    sort_order: int | None = Field(default=0)


class ReportSite(ReportSiteBase, table=True):
    """報告書と現場（Site）の多対多中間テーブル。ReportClient と同様に role_key でテンプレート参照可能。"""

    __tablename__ = "report_sites"
    model_config = _table_config
    __table_args__ = (
        UniqueConstraint(
            "report_id",
            "role_key",
            name="uq_report_sites_report_role_key",
        ),
    )

    id: uuid.UUID = uuid_pk()
    report_id: uuid.UUID | None = uuid_fk("reports.id")
    site_id: uuid.UUID | None = uuid_fk("sites.id")

    report: Report | None = Relationship(back_populates="report_sites")
    site: Optional["Site"] = Relationship(back_populates="report_sites")


class ReportClientBase(SQLModel, table=False):
    """ReportClient の共通フィールド。"""

    model_config = _base_schema_config
    report_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None
    role_key: str | None = None  # テンプレート用論理キー（同一 report 内で一意）
    sort_order: int | None = Field(default=0)


class ReportClient(ReportClientBase, table=True):
    """報告書とクライアント（会社）の多対多中間テーブル。Report に直接紐づく。"""

    __tablename__ = "report_clients"
    model_config = _table_config
    __table_args__ = (
        UniqueConstraint(
            "report_id",
            "role_key",
            name="uq_report_clients_report_role_key",
        ),
    )

    id: uuid.UUID = uuid_pk()
    report_id: uuid.UUID | None = uuid_fk("reports.id")
    company_id: uuid.UUID | None = uuid_fk("companies.id")

    report: Report | None = Relationship(back_populates="report_clients")
    company: Company | None = Relationship(back_populates="report_clients")


class ReportWorkerBase(SQLModel, table=False):
    """ReportWorker の共通フィールド。"""

    model_config = _base_schema_config
    report_id: uuid.UUID | None = None
    worker_id: uuid.UUID | None = None
    worker_role: str | None = None  # 表示用ラベル（主担当、副担当など）
    role_key: str | None = None  # テンプレート用論理キー（同一 report 内で一意）
    sort_order: int | None = Field(default=0)


class ReportWorker(ReportWorkerBase, table=True):
    __tablename__ = "report_workers"
    model_config = _table_config
    __table_args__ = (
        UniqueConstraint(
            "report_id",
            "role_key",
            name="uq_report_workers_report_role_key",
        ),
    )

    id: uuid.UUID = uuid_pk()
    report_id: uuid.UUID | None = uuid_fk("reports.id")
    worker_id: uuid.UUID | None = uuid_fk("workers.id")

    report: Report | None = Relationship(back_populates="report_workers")
    worker: Worker | None = Relationship(back_populates="report_workers")


class TargetInstrumentBase(SQLModel, table=False):
    """TargetInstrument の共通フィールド。"""

    model_config = _base_schema_config
    instrument_id: uuid.UUID | None = None
    report_id: uuid.UUID | None = None
    schema_id: uuid.UUID | None = None
    tag_number: str | None = None
    sort_order: int | None = Field(default=0)
    custom_data: dict | None = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=True),
    )


class TargetInstrument(TargetInstrumentBase, table=True):
    __tablename__ = "target_instruments"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()
    instrument_id: uuid.UUID | None = uuid_fk("instruments.id")
    report_id: uuid.UUID | None = uuid_fk("reports.id")
    schema_id: uuid.UUID | None = uuid_fk("schema_definitions.id")

    instrument: Instrument | None = Relationship(back_populates="target_instruments")
    report: Report | None = Relationship(back_populates="target_instruments")
    schema_definition: Optional["SchemaDefinition"] = Relationship(
        back_populates="target_instruments"
    )
    target_instrument_tables: list["TargetInstrumentTable"] = Relationship(
        back_populates="target_instrument",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class TargetInstrumentTableBase(SQLModel, table=False):
    """TargetInstrumentTable の共通フィールド。"""

    model_config = _base_schema_config
    target_instrument_id: uuid.UUID | None = None
    table_definition_id: uuid.UUID | None = None
    report_id: uuid.UUID | None = None
    role_key: str | None = None
    sort_order: int | None = Field(default=0)
    rows: list | None = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
    )


class TargetInstrumentTable(TargetInstrumentTableBase, table=True):
    """対象機器に紐づく表データ。表定義(TableDefinition)の列構成に従い、行データを JSON で保持する。"""

    __tablename__ = "target_instrument_tables"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()
    target_instrument_id: uuid.UUID | None = uuid_fk("target_instruments.id")
    table_definition_id: uuid.UUID | None = uuid_fk("table_definitions.id")
    report_id: uuid.UUID | None = uuid_fk("reports.id")

    target_instrument: TargetInstrument | None = Relationship(
        back_populates="target_instrument_tables"
    )
    table_definition: TableDefinition | None = Relationship(
        back_populates="target_instrument_tables"
    )
    report: Report | None = Relationship(back_populates="target_instrument_tables")


class ReportOwnedInstrumentBase(SQLModel, table=False):
    """ReportOwnedInstrument の共通フィールド。"""

    model_config = _base_schema_config
    report_id: uuid.UUID | None = None
    owned_instrument_id: uuid.UUID | None = None
    sort_order: int | None = Field(default=0)


class ReportOwnedInstrument(ReportOwnedInstrumentBase, table=True):
    __tablename__ = "report_owned_instruments"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()
    report_id: uuid.UUID | None = uuid_fk("reports.id")
    owned_instrument_id: uuid.UUID | None = uuid_fk("owned_instruments.id")

    report: Report | None = Relationship(back_populates="report_owned_instruments")
    owned_instrument: OwnedInstrument | None = Relationship(
        back_populates="report_owned_instruments"
    )


class UsedPartBase(SQLModel, table=False):
    """UsedPart の共通フィールド。"""

    model_config = _base_schema_config
    report_id: uuid.UUID | None = None
    part_id: uuid.UUID | None = None
    quantity: int | None = Field(default=0)
    notes: str | None = None
    sort_order: int | None = Field(default=0)


class UsedPart(UsedPartBase, table=True):
    __tablename__ = "used_parts"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()
    report_id: uuid.UUID | None = uuid_fk("reports.id")
    part_id: uuid.UUID | None = uuid_fk("parts.id")

    report: Report | None = Relationship(back_populates="used_parts")
    part: Part | None = Relationship(back_populates="used_parts")


# --- 任務管理 (Mission / MissionReport) ---


class MissionStatus(enum.StrEnum):
    ACTIVE = "Active"
    EXPIRED = "Expired"
    PURGED = "Purged"
    RETURNED = "Returned"


class Mission(SQLModel, table=True):
    """任務のメタデータ。1 handoff = 1 Mission レコード。"""

    __tablename__ = "missions"
    model_config = _table_config

    mission_id: uuid.UUID = Field(
        sa_column=Column(GUID(), primary_key=True),
    )
    permission: str = Field(
        sa_column=Column("permission", String(20), nullable=False)
    )  # "Edit" | "View"
    issued_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime  # 発行から24時間
    status: str = Field(
        sa_column=Column("status", String(20), nullable=False)
    )  # "Active" | "Expired" | "Purged" | "Returned"
    heartbeat_at: datetime | None = Field(default_factory=datetime.utcnow)
    device_id: str | None = None  # Scout識別子（派遣名簿表示用）

    mission_reports: list["MissionReport"] = Relationship(back_populates="mission")


class MissionReport(SQLModel, table=True):
    """任務とレポートの紐付け（多対多中間テーブル）。"""

    __tablename__ = "mission_reports"
    model_config = _table_config

    id: uuid.UUID = uuid_pk()
    mission_id: uuid.UUID = Field(
        sa_column=Column(
            GUID(),
            ForeignKey("missions.mission_id"),
            nullable=False,
            index=True,
        )
    )
    report_id: uuid.UUID | None = uuid_fk("reports.id")

    mission: Mission | None = Relationship(back_populates="mission_reports")
    report: Report | None = Relationship(back_populates="mission_reports")
