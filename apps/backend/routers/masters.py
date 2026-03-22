"""マスタ系テーブルの一括 CRUD API ルーターの定義。"""

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Company,
    Instrument,
    OwnedInstrument,
    Part,
    ReportClient,
    SchemaDefinition,
    Site,
    TableDefinition,
    Worker,
)
from schemas import (
    CompanyCreate,
    CompanyInput,
    InstrumentCreate,
    InstrumentInput,
    OwnedInstrumentCreate,
    OwnedInstrumentInput,
    PartCreate,
    PartInput,
    SchemaDefinitionCreate,
    SchemaDefinitionInput,
    SiteCreate,
    SiteInput,
    TableDefinitionCreate,
    TableDefinitionInput,
    WorkerCreate,
    WorkerInput,
)


async def _delete_related_report_clients(
    session: AsyncSession, item_id: object
) -> None:
    """会社削除前に関連する ReportClient レコードを削除する（外部キー整合性）。"""
    await session.execute(
        delete(ReportClient).where(ReportClient.company_id == item_id)
    )  # type: ignore[arg-type]


# make_crud_router() に渡すパラメータ定義のリスト
MASTER_ROUTERS_CONFIG = [
    {
        "model": Company,
        "create_schema": CompanyCreate,
        "update_schema": CompanyInput,
        "prefix": "/companies",
        "tags": ["companies"],
        "label": "会社",
        "on_delete": _delete_related_report_clients,
    },
    {
        "model": Worker,
        "create_schema": WorkerCreate,
        "update_schema": WorkerInput,
        "prefix": "/workers",
        "tags": ["workers"],
        "label": "作業者",
    },
    {
        "model": Instrument,
        "create_schema": InstrumentCreate,
        "update_schema": InstrumentInput,
        "prefix": "/instruments",
        "tags": ["instruments"],
        "label": "計器",
    },
    {
        "model": Part,
        "create_schema": PartCreate,
        "update_schema": PartInput,
        "prefix": "/parts",
        "tags": ["parts"],
        "label": "部品",
    },
    {
        "model": OwnedInstrument,
        "create_schema": OwnedInstrumentCreate,
        "update_schema": OwnedInstrumentInput,
        "prefix": "/owned-instruments",
        "tags": ["owned-instruments"],
        "label": "所有計器",
    },
    {
        "model": SchemaDefinition,
        "create_schema": SchemaDefinitionCreate,
        "update_schema": SchemaDefinitionInput,
        "prefix": "/schema-definitions",
        "tags": ["schema-definitions"],
        "label": "スキーマ定義",
    },
    {
        "model": TableDefinition,
        "create_schema": TableDefinitionCreate,
        "update_schema": TableDefinitionInput,
        "prefix": "/table-definitions",
        "tags": ["table-definitions"],
        "label": "表定義",
    },
    {
        "model": Site,
        "create_schema": SiteCreate,
        "update_schema": SiteInput,
        "prefix": "/sites",
        "tags": ["sites"],
        "label": "現場",
    },
]
