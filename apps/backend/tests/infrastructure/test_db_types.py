import uuid

import pytest
from sqlalchemy import JSON, Column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Field, SQLModel

from models import GUID


# テスト用のテンポラリモデル
class TypeCheckModel(SQLModel, table=True):
    __tablename__ = "type_check_table"
    id: uuid.UUID = Field(sa_column=Column(GUID(), primary_key=True))
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    optional_id: uuid.UUID | None = Field(
        default=None, sa_column=Column(GUID(), nullable=True)
    )


@pytest.mark.asyncio
async def test_guid_type_decorator_logic():
    """GUID TypeDecorator の内部ロジックのみをユニットテスト (DB接続なし)"""
    from sqlalchemy.dialects import postgresql

    decorator = GUID()
    pg_dialect = postgresql.dialect()

    test_uuid = uuid.uuid4()
    test_uuid_str = str(test_uuid)

    # --- 1. Bind (Python -> DB) ---
    # Python オブジェクト
    assert decorator.process_bind_param(test_uuid, pg_dialect) == test_uuid

    # 文字列形式の UUID
    assert decorator.process_bind_param(test_uuid_str, pg_dialect) == test_uuid_str

    # None
    assert decorator.process_bind_param(None, pg_dialect) is None

    # --- 2. Result (DB -> Python) ---
    # ネイティブ UUID (PostgreSQL想定)
    assert decorator.process_result_value(test_uuid, pg_dialect) == test_uuid

    # None
    assert decorator.process_result_value(None, pg_dialect) is None


@pytest.mark.asyncio
async def test_db_type_integration(db_session: AsyncSession):
    """実際の DB セッションを通じた統合テスト (GUID & JSON)"""

    # 非同期でのテーブル作成
    async def create_tables(connection):
        def sync_run(conn):
            # 既存テーブルを削除してから作成
            TypeCheckModel.__table__.drop(conn, checkfirst=True)
            TypeCheckModel.__table__.create(conn)

        await connection.run_sync(sync_run)

    conn = await db_session.connection()
    await create_tables(conn)

    # --- ケース1: 正常系 (UUID + 日本語入りJSON) ---
    test_id = uuid.uuid4()
    complex_data = {
        "msg": "こんにちは世界",
        "nested": {"key": "値", "list": [1, 2, "三"]},
        "empty_list": [],
    }

    obj = TypeCheckModel(id=test_id, data=complex_data, optional_id=None)
    db_session.add(obj)
    await db_session.flush()

    db_session.expire_all()
    res = await db_session.execute(
        select(TypeCheckModel).where(TypeCheckModel.id == test_id)
    )
    retrieved = res.scalar_one()

    assert isinstance(retrieved.id, uuid.UUID)
    assert retrieved.id == test_id
    assert retrieved.data == complex_data
    assert retrieved.data["nested"]["key"] == "値"
    assert retrieved.optional_id is None

    # --- ケース2: None 系のテスト ---
    test_id_2 = uuid.uuid4()
    # data=None, optional_id=test_id (別のUUID)
    obj_2 = TypeCheckModel(id=test_id_2, data=None, optional_id=test_id)
    db_session.add(obj_2)
    await db_session.flush()

    db_session.expire_all()
    res_2 = await db_session.execute(
        select(TypeCheckModel).where(TypeCheckModel.id == test_id_2)
    )
    retrieved_2 = res_2.scalar_one()
    # SQLModel 側の定義で sa_column=Column(JSON) であれば None が保存される
    assert retrieved_2.data is None
    assert retrieved_2.optional_id == test_id
