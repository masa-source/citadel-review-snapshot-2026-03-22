import uuid
from datetime import datetime
from typing import Generic, TypeVar

from polyfactory import Use
from polyfactory.factories.pydantic_factory import ModelFactory
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Company,
    Instrument,
    OwnedInstrument,
    Part,
    Report,
    ReportFormat,
    ReportFormatTemplate,
    ReportTemplate,
    ReportWorker,
    SchemaDefinition,
    Site,
    TableDefinition,
    TargetInstrument,
    UsedPart,
    Worker,
)
from schemas import (
    CompanyInput,
    DatabaseInput,
    InstrumentInput,
    PartInput,
    ReportInput,
    SchemaDefinitionInput,
    SiteInput,
    WorkerInput,
)
from utils.serialization import to_camel

# --- Factories (polyfactory) ---

T = TypeVar("T")


class BaseTestFactory(ModelFactory[T], Generic[T]):
    __is_base_factory__ = True

    @classmethod
    def build(cls, factory_use_constructs: bool = False, **kwargs) -> T:
        expected_fields = {f.name for f in cls.get_model_fields()}
        final_kwargs = {}
        for k, v in kwargs.items():
            if k in expected_fields:
                final_kwargs[k] = v
            else:
                camel_k = to_camel(k)
                if camel_k in expected_fields:
                    final_kwargs[camel_k] = v
                else:
                    final_kwargs[k] = v
        return super().build(
            factory_use_constructs=factory_use_constructs, **final_kwargs
        )


class CompanyFactory(BaseTestFactory[Company]):
    __model__ = Company
    id = Use(uuid.uuid4)
    name = Use(lambda: f"Test Company {uuid.uuid4().hex[:8]}")


class WorkerFactory(BaseTestFactory[Worker]):
    __model__ = Worker
    id = Use(uuid.uuid4)
    name = Use(lambda: f"Test Worker {uuid.uuid4().hex[:8]}")


class InstrumentFactory(BaseTestFactory[Instrument]):
    __model__ = Instrument
    id = Use(uuid.uuid4)
    name = Use(lambda: f"Test Instrument {uuid.uuid4().hex[:8]}")


class ReportFactory(BaseTestFactory[Report]):
    __model__ = Report
    id = Use(uuid.uuid4)
    schema_id = Use(lambda: None)
    report_format_id = Use(lambda: None)
    report_title = Use(lambda: f"Test Report {uuid.uuid4().hex[:8]}")
    custom_data = Use(lambda: {"test": "data"})
    report_snapshot = Use(lambda: {})
    schema_id = None


class SiteFactory(BaseTestFactory[Site]):
    __model__ = Site
    id = Use(uuid.uuid4)
    name = Use(lambda: f"Test Site {uuid.uuid4().hex[:8]}")


class PartFactory(BaseTestFactory[Part]):
    __model__ = Part
    id = Use(uuid.uuid4)
    name = Use(lambda: f"Test Part {uuid.uuid4().hex[:8]}")


class SchemaDefinitionFactory(BaseTestFactory[SchemaDefinition]):
    __model__ = SchemaDefinition
    id = Use(uuid.uuid4)
    target_entity = "report"
    version = "1.0.0"
    json_schema = Use(lambda: {})
    ui_schema = Use(lambda: {})


class TableDefinitionFactory(BaseTestFactory[TableDefinition]):
    __model__ = TableDefinition
    name = Use(lambda: f"Test Table {uuid.uuid4().hex[:8]}")


class OwnedInstrumentFactory(BaseTestFactory[OwnedInstrument]):
    __model__ = OwnedInstrument
    equipment_name = Use(lambda: f"Equip {uuid.uuid4().hex[:8]}")


class CompanyInputFactory(BaseTestFactory[CompanyInput]):
    __model__ = CompanyInput
    name = Use(lambda: f"Input Company {uuid.uuid4().hex[:8]}")


class WorkerInputFactory(BaseTestFactory[WorkerInput]):
    __model__ = WorkerInput
    name = Use(lambda: f"Input Worker {uuid.uuid4().hex[:8]}")


class InstrumentInputFactory(BaseTestFactory[InstrumentInput]):
    __model__ = InstrumentInput
    name = Use(lambda: f"Input Instrument {uuid.uuid4().hex[:8]}")


class ReportInputFactory(BaseTestFactory[ReportInput]):
    __model__ = ReportInput
    schema_id = Use(lambda: None)
    report_format_id = Use(lambda: None)
    report_title = Use(lambda: f"Input Report {uuid.uuid4().hex[:8]}")
    custom_data = Use(lambda: {"test": "data"})
    created_at = Use(lambda: datetime.now().isoformat())
    schema_id = None


class SiteInputFactory(BaseTestFactory[SiteInput]):
    __model__ = SiteInput
    name = Use(lambda: f"Input Site {uuid.uuid4().hex[:8]}")


class PartInputFactory(BaseTestFactory[PartInput]):
    __model__ = PartInput
    name = Use(lambda: f"Input Part {uuid.uuid4().hex[:8]}")


class SchemaDefinitionInputFactory(BaseTestFactory[SchemaDefinitionInput]):
    __model__ = SchemaDefinitionInput
    target_entity = "report"
    version = "1.0.0"
    json_schema = Use(lambda: {})
    ui_schema = Use(lambda: {})


class ReportFormatFactory(BaseTestFactory[ReportFormat]):
    __model__ = ReportFormat
    name = Use(lambda: f"Test Format {uuid.uuid4().hex[:8]}")


class ReportTemplateFactory(BaseTestFactory[ReportTemplate]):
    __model__ = ReportTemplate
    name = Use(lambda: f"Test Template {uuid.uuid4().hex[:8]}")
    filePath = Use(lambda: None)
    sheetNames = Use(lambda: None)
    lastVerifiedMtime = Use(lambda: None)


class ReportFormatTemplateFactory(BaseTestFactory[ReportFormatTemplate]):
    __model__ = ReportFormatTemplate
    sortOrder = 1
    reportFormatId = Use(lambda: None)
    reportTemplateId = Use(lambda: None)


class TargetInstrumentFactory(BaseTestFactory[TargetInstrument]):
    __model__ = TargetInstrument
    sort_order = 0
    instrument_id = Use(lambda: None)
    schema_id = Use(lambda: None)
    report_id = Use(lambda: None)
    custom_data = Use(lambda: {})


class ReportWorkerFactory(BaseTestFactory[ReportWorker]):
    __model__ = ReportWorker
    worker_role = "主担当"
    sort_order = 0
    worker_id = Use(lambda: None)
    report_id = Use(lambda: None)
    worker_id = None
    report_id = None


class UsedPartFactory(BaseTestFactory[UsedPart]):
    __model__ = UsedPart
    quantity = 1
    sort_order = 0
    part_id = Use(lambda: None)
    report_id = Use(lambda: None)
    part_id = None
    report_id = None


# --- Helpers ---


def _rand_id() -> uuid.UUID:
    return uuid.uuid4()


def _rand_str(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


# --- Model Factories (make_xxx) ---


def make_company(**kwargs) -> Company:
    return CompanyFactory.build(**kwargs)


def make_worker(**kwargs) -> Worker:
    return WorkerFactory.build(**kwargs)


def make_instrument(**kwargs) -> Instrument:
    return InstrumentFactory.build(**kwargs)


def make_report(**kwargs) -> Report:
    return ReportFactory.build(**kwargs)


def make_site(**kwargs) -> Site:
    return SiteFactory.build(**kwargs)


def make_part(**kwargs) -> Part:
    return PartFactory.build(**kwargs)


def make_schema_definition(**kwargs) -> SchemaDefinition:
    return SchemaDefinitionFactory.build(**kwargs)


def make_table_definition(**kwargs) -> TableDefinition:
    return TableDefinitionFactory.build(**kwargs)


def make_report_format(**kwargs) -> ReportFormat:
    return ReportFormatFactory.build(**kwargs)


def make_report_template(**kwargs) -> ReportTemplate:
    return ReportTemplateFactory.build(**kwargs)


def make_report_format_template(**kwargs) -> ReportFormatTemplate:
    return ReportFormatTemplateFactory.build(**kwargs)


def make_owned_instrument(**kwargs) -> OwnedInstrument:
    return OwnedInstrumentFactory.build(**kwargs)


def make_used_part(**kwargs) -> UsedPart:
    return UsedPartFactory.build(**kwargs)


def make_target_instrument(**kwargs) -> TargetInstrument:
    return TargetInstrumentFactory.build(**kwargs)


def make_report_worker(**kwargs) -> ReportWorker:
    return ReportWorkerFactory.build(**kwargs)


# --- DB Insert Helpers (insert_xxx) ---


async def insert_company(session: AsyncSession, **kwargs) -> Company:
    obj = make_company(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_owned_instrument(session: AsyncSession, **kwargs) -> OwnedInstrument:
    if "company_id" not in kwargs:
        company = await insert_company(session)
        kwargs["company_id"] = company.id
    obj = make_owned_instrument(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_worker(session: AsyncSession, **kwargs) -> Worker:
    if "company_id" not in kwargs:
        company = await insert_company(session)
        kwargs["company_id"] = company.id
    obj = make_worker(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_instrument(session: AsyncSession, **kwargs) -> Instrument:
    if "company_id" not in kwargs:
        company = await insert_company(session)
        kwargs["company_id"] = company.id
    obj = make_instrument(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def ensure_report_format(
    session: AsyncSession,
    name: str = "作業報告書",
) -> ReportFormat:
    """
    テスト用のヘルパー: 指定された name の ReportFormat を取得し、
    なければ新規作成して返す。
    """
    result = await session.execute(
        select(ReportFormat).where(ReportFormat.name == name).limit(1)
    )
    fmt = result.scalars().first()
    if fmt:
        return fmt
    return await insert_report_format(session, name=name)


async def insert_report(session: AsyncSession, **kwargs) -> Report:
    if "company_id" not in kwargs:
        company = await insert_company(session)
        kwargs["company_id"] = company.id

    if "schema_id" not in kwargs:
        schema = await insert_schema_definition(session)
        kwargs["schema_id"] = schema.id

    # report_format_name が明示されていればそれを優先し、無ければデフォルト種別を使用
    fmt_name = kwargs.pop("report_format_name", None)
    if "report_format_id" not in kwargs:
        name = fmt_name or "作業報告書"
        fmt = await ensure_report_format(session, name)
        kwargs["report_format_id"] = fmt.id

    obj = make_report(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_site(session: AsyncSession, **kwargs) -> Site:
    if "company_id" not in kwargs:
        company = await insert_company(session)
        kwargs["company_id"] = company.id
    obj = make_site(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_part(session: AsyncSession, **kwargs) -> Part:
    if "company_id" not in kwargs:
        company = await insert_company(session)
        kwargs["company_id"] = company.id
    obj = make_part(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_schema_definition(session: AsyncSession, **kwargs) -> SchemaDefinition:
    obj = make_schema_definition(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_report_format(session: AsyncSession, **kwargs) -> ReportFormat:
    obj = make_report_format(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_report_template(session: AsyncSession, **kwargs) -> ReportTemplate:
    obj = make_report_template(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_report_format_template(
    session: AsyncSession, **kwargs
) -> ReportFormatTemplate:
    obj = make_report_format_template(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_target_instrument(session: AsyncSession, **kwargs) -> TargetInstrument:
    obj = make_target_instrument(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_report_worker(session: AsyncSession, **kwargs) -> ReportWorker:
    obj = make_report_worker(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


async def insert_used_part(session: AsyncSession, **kwargs) -> UsedPart:
    obj = make_used_part(**kwargs)
    session.add(obj)
    await session.flush()
    return obj


# --- Input Schema Builders (build_xxx_input) ---


def build_company_input(**kwargs) -> CompanyInput:
    return CompanyInputFactory.build(**kwargs)


def build_worker_input(**kwargs) -> WorkerInput:
    return WorkerInputFactory.build(**kwargs)


def build_instrument_input(**kwargs) -> InstrumentInput:
    return InstrumentInputFactory.build(**kwargs)


def build_report_input(**kwargs) -> ReportInput:
    return ReportInputFactory.build(**kwargs)


def build_site_input(**kwargs) -> SiteInput:
    return SiteInputFactory.build(**kwargs)


def build_part_input(**kwargs) -> PartInput:
    return PartInputFactory.build(**kwargs)


def build_schema_definition_input(**kwargs) -> SchemaDefinitionInput:
    return SchemaDefinitionInputFactory.build(**kwargs)


def build_database_input(**kwargs) -> DatabaseInput:
    """
    指定された引数に基づいて DatabaseInput を構築する。
    デフォルトで最小限のマスタデータを含める。
    """
    company = build_company_input()
    worker = build_worker_input(company_id=company.id)
    instrument = build_instrument_input(company_id=company.id)
    part = build_part_input(company_id=company.id)
    site = build_site_input(company_id=company.id)
    schema_def = build_schema_definition_input()

    base_data = {
        "companies": kwargs.get("companies", [company]),
        "workers": kwargs.get("workers", [worker]),
        "instruments": kwargs.get("instruments", [instrument]),
        "parts": kwargs.get("parts", [part]),
        "sites": kwargs.get("sites", [site]),
        "schema_definitions": kwargs.get("schema_definitions", [schema_def]),
    }

    # その他のフィールドを追加＋必要なら辞書を Pydantic モデルへ明示的に変換
    for key, value in kwargs.items():
        if key not in base_data:
            if key == "report_clients" and value and isinstance(value[0], dict):
                from schemas import ReportClientInput

                cleaned_value = []
                for item in value:
                    cleaned_item = {
                        k: (None if v == "None" else v) for k, v in item.items()
                    }
                    cleaned_value.append(ReportClientInput(**cleaned_item))
                base_data[key] = cleaned_value
            elif key == "report_workers" and value and isinstance(value[0], dict):
                from schemas import ReportWorkerInput

                cleaned_value = []
                for item in value:
                    cleaned_item = {
                        k: (None if v == "None" else v) for k, v in item.items()
                    }
                    cleaned_value.append(ReportWorkerInput(**cleaned_item))
                base_data[key] = cleaned_value
            elif key == "target_instruments" and value and isinstance(value[0], dict):
                from schemas import TargetInstrumentInput

                cleaned_value = []
                for item in value:
                    cleaned_item = {
                        k: (None if v == "None" else v) for k, v in item.items()
                    }
                    cleaned_value.append(TargetInstrumentInput(**cleaned_item))
                base_data[key] = cleaned_value
            elif key == "used_parts" and value and isinstance(value[0], dict):
                from schemas import UsedPartInput

                cleaned_value = []
                for item in value:
                    cleaned_item = {
                        k: (None if v == "None" else v) for k, v in item.items()
                    }
                    cleaned_value.append(UsedPartInput(**cleaned_item))
                base_data[key] = cleaned_value
            elif key == "owned_instruments" and value and isinstance(value[0], dict):
                from schemas import OwnedInstrumentInput

                cleaned_value = []
                for item in value:
                    cleaned_item = {
                        k: (None if v == "None" else v) for k, v in item.items()
                    }
                    cleaned_value.append(OwnedInstrumentInput(**cleaned_item))
                base_data[key] = cleaned_value
            else:
                base_data[key] = value

    return DatabaseInput(**base_data)
