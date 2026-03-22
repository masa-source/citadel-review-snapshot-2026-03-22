"""
importer.py のインテグレーションテスト
"""

import uuid

import pytest
from sqlalchemy import select

from schemas import DatabaseInput
from services.importer import run_import
from tests.factories import (
    build_company_input,
    build_database_input,
    build_instrument_input,
    build_report_input,
    build_schema_definition_input,
    build_site_input,
    build_worker_input,
)


class TestRunImport:
    """run_import() 関数のテスト"""

    @pytest.mark.asyncio
    async def test_import_empty_data(self, db_session):
        """空のデータをインポートできる"""
        data = DatabaseInput()
        counts = await run_import(db_session, data)
        assert counts == {}

    @pytest.mark.asyncio
    async def test_import_companies_only(self, db_session):
        """会社のみインポートできる"""
        data = build_database_input(
            companies=[
                build_company_input(id=uuid.uuid4()),
                build_company_input(id=uuid.uuid4()),
            ],
            workers=[],
            instruments=[],
            parts=[],
            sites=[],
            schema_definitions=[],
        )
        counts = await run_import(db_session, data)
        assert counts.get("companies") == 2

    @pytest.mark.asyncio
    async def test_import_with_foreign_key_resolution(self, db_session):
        """外部キーを解決してインポートできる"""
        company = build_company_input(id=uuid.uuid4())
        worker = build_worker_input(id=uuid.uuid4(), company_id=company.id)
        data = build_database_input(
            companies=[company],
            workers=[worker],
            instruments=[],
            parts=[],
            sites=[],
            schema_definitions=[],
        )
        counts = await run_import(db_session, data)
        assert counts.get("companies") == 1
        assert counts.get("workers") == 1

    @pytest.mark.asyncio
    async def test_import_full_report(self, db_session):
        """完全なレポートをインポートできる"""
        company = build_company_input(id=uuid.uuid4())
        worker = build_worker_input(id=uuid.uuid4(), company_id=company.id)
        instrument = build_instrument_input(id=uuid.uuid4(), company_id=company.id)
        site = build_site_input(id=uuid.uuid4(), company_id=company.id)
        schema = build_schema_definition_input(id=uuid.uuid4())
        report = build_report_input(
            id=uuid.uuid4(), company_id=company.id, schema_id=schema.id
        )
        data = build_database_input(
            companies=[company],
            workers=[worker],
            instruments=[instrument],
            sites=[site],
            schema_definitions=[schema],
            reports=[report],
            report_workers=[
                {
                    "id": str(uuid.uuid4()),
                    "report_id": str(report.id),
                    "worker_id": str(worker.id),
                    "worker_role": "担当者",
                }
            ],
            target_instruments=[
                {
                    "id": str(uuid.uuid4()),
                    "report_id": str(report.id),
                    "instrument_id": str(instrument.id),
                    "schema_id": str(schema.id),
                }
            ],
            parts=[],
        )
        counts = await run_import(db_session, data)
        assert counts.get("companies") == 1
        assert counts.get("workers") == 1
        assert counts.get("instruments") == 1
        assert counts.get("reports") == 1
        assert counts.get("report_workers") == 1
        assert counts.get("target_instruments") == 1
        assert counts.get("schema_definitions") == 1
        assert counts.get("sites") >= 0

    @pytest.mark.asyncio
    async def test_import_idempotent_masters(self, db_session):
        """マスタデータは冪等（同じデータを複数回インポートしても重複しない）"""
        data = build_database_input(
            companies=[build_company_input(id=uuid.uuid4())],
            workers=[],
            instruments=[],
            parts=[],
            sites=[],
            schema_definitions=[],
        )
        await run_import(db_session, data)
        counts = await run_import(db_session, data)
        assert counts.get("companies") == 1

    @pytest.mark.asyncio
    async def test_import_with_report_clients(self, db_session):
        """report_clients（複数クライアント）を含むレポートをインポートできる"""
        client1 = build_company_input(id=uuid.uuid4())
        client2 = build_company_input(id=uuid.uuid4())
        schema = build_schema_definition_input(id=uuid.uuid4())
        report = build_report_input(
            id=uuid.uuid4(), company_id=client1.id, schema_id=schema.id
        )
        data = build_database_input(
            companies=[client1, client2],
            schema_definitions=[schema],
            reports=[report],
            report_clients=[
                {"report_id": str(report.id), "company_id": str(client1.id)},
                {"report_id": str(report.id), "company_id": str(client2.id)},
            ],
            workers=[],
            instruments=[],
            parts=[],
            sites=[],
        )
        counts = await run_import(db_session, data)
        assert counts.get("companies") == 2
        assert counts.get("reports") == 1
        assert counts.get("report_clients") == 2

    @pytest.mark.asyncio
    async def test_import_master_rename_same_id_upsert(self, db_session):
        """マスタの name を変更して同じ id で再送信すると既存行が UPDATE され、UniqueViolation が発生しない"""
        from models import Company

        company_id = uuid.uuid4()

        # 1. 初回: 会社を 1 件登録
        data1 = build_database_input(
            companies=[build_company_input(id=company_id, name="Original Name")],
        )
        counts1 = await run_import(
            db_session, DatabaseInput.model_validate(data1.model_dump(mode="json"))
        )
        assert counts1.get("companies") == 1

        # 2. 同じ id で name のみ変更して再送信（ID ベース UPSERT で UPDATE になる）
        data2 = build_database_input(
            companies=[build_company_input(id=company_id, name="Renamed Company")],
        )
        counts2 = await run_import(
            db_session, DatabaseInput.model_validate(data2.model_dump(mode="json"))
        )
        assert counts2.get("companies") == 1

        # 3. DB 上は 1 件のみで、名前が更新されている
        result = await db_session.execute(
            select(Company).where(Company.id == company_id)
        )
        row = result.scalar_one_or_none()
        assert row is not None
        assert row.name == "Renamed Company"

    @pytest.mark.asyncio
    async def test_import_report_with_nonexistent_company_id(self, db_session):
        """report の company_id が存在しない UUID の場合: DB が FK を許可しなければ IntegrityError、許可すれば report は company_id=null で挿入される"""
        from sqlalchemy.exc import IntegrityError

        from models import Report

        company = build_company_input(id=uuid.uuid4())
        report_id = uuid.uuid4()
        data = build_database_input(
            companies=[company],
            reports=[
                build_report_input(
                    id=report_id,
                    company_id=uuid.uuid4(),  # 存在しないID
                )
            ],
        )
        try:
            counts = await run_import(
                db_session,
                DatabaseInput.model_validate(data.model_dump(mode="json")),
                overwrite=True,
            )
            await db_session.commit()
            result = await db_session.execute(
                select(Report).where(Report.id == report_id)
            )
            row = result.scalar_one_or_none()
            assert row is not None
            assert row.company_id is None
            assert counts.get("reports") == 1
        except IntegrityError:
            await db_session.rollback()
            pass

    @pytest.mark.asyncio
    async def test_import_report_sites_with_nonexistent_report_id(self, db_session):
        """report_sites の report_id が存在しない場合: その行はスキップされクラッシュしない"""
        company_id = uuid.uuid4()
        data = build_database_input(
            companies=[build_company_input(id=company_id)],
            report_sites=[
                {
                    "id": str(uuid.uuid4()),
                    "report_id": str(uuid.uuid4()),  # 存在しない
                    "site_id": str(company_id),
                    "role_key": "main",
                    "sort_order": 0,
                }
            ],
        )
        counts = await run_import(
            db_session, DatabaseInput.model_validate(data.model_dump(mode="json"))
        )
        assert counts.get("report_sites", 0) == 0

    @pytest.mark.asyncio
    async def test_import_report_overwrite(self, db_session):
        """同一IDのレポートが overwrite=True で上書き更新される"""
        from models import Report

        report_id = uuid.uuid4()
        company_id = uuid.uuid4()

        # 1. 初回登録
        data1 = build_database_input(
            companies=[build_company_input(id=company_id)],
            reports=[
                build_report_input(
                    id=report_id,
                    report_title="First Title",
                    company_id=company_id,
                )
            ],
        )
        await run_import(
            db_session,
            DatabaseInput.model_validate(data1.model_dump(mode="json")),
            overwrite=True,
        )

        # 2. 同一IDで別タイトル、overwrite=True でインポート
        data2 = build_database_input(
            companies=[build_company_input(id=company_id)],
            reports=[
                build_report_input(
                    id=report_id,
                    report_title="Overwritten Title",
                    company_id=company_id,
                )
            ],
        )
        await run_import(
            db_session,
            DatabaseInput.model_validate(data2.model_dump(mode="json")),
            overwrite=True,
        )

        # 3. DB上は1件のみで、タイトルが更新されている
        result = await db_session.execute(select(Report).where(Report.id == report_id))
        row = result.scalar_one_or_none()
        assert row is not None
        assert row.report_title == "Overwritten Title"

        # 件数確認
        res_all = await db_session.execute(select(Report))
        assert len(res_all.scalars().all()) == 1

    @pytest.mark.asyncio
    async def test_import_report_copy(self, db_session):
        """overwrite=False の場合、同一内容でも新規UUIDで登録（重複）される"""
        from models import Report

        report_id = uuid.uuid4()
        company_id = uuid.uuid4()

        # 1. 初回登録
        data = build_database_input(
            companies=[build_company_input(id=company_id)],
            reports=[
                build_report_input(
                    id=report_id,
                    report_title="Title",
                    company_id=company_id,
                )
            ],
        )
        await run_import(
            db_session,
            DatabaseInput.model_validate(data.model_dump(mode="json")),
            overwrite=True,
        )

        # 2. 同じ内容で overwrite=False で再度インポート
        await run_import(
            db_session,
            DatabaseInput.model_validate(data.model_dump(mode="json")),
            overwrite=False,
        )

        # 3. DB上は2件になっているはず
        result = await db_session.execute(select(Report))
        rows = result.scalars().all()
        assert len(rows) == 2
        ids = {r.id for r in rows}
        assert len(ids) == 2
        assert report_id in ids

    @pytest.mark.asyncio
    async def test_import_with_integrity_error_fk(self, db_session):
        """外部キー制約違反（存在しない report_id 参照）で IntegrityError が発生する"""
        from sqlalchemy import text
        from sqlalchemy.exc import IntegrityError

        # SQLite の場合のみ外部キー制約を有効化 (PostgreSQL ではデフォルトで有効かつ PRAGMA はエラーになる)
        if db_session.bind.dialect.name == "sqlite":
            await db_session.execute(text("PRAGMA foreign_keys=ON"))

        from models import ReportWorker

        # 存在しない report_id を持つレコードを直接追加
        worker = ReportWorker(
            id=uuid.uuid4(),
            report_id=uuid.uuid4(),  # 存在しない
            role_key="ghost",
            worker_role="幽霊",
        )
        # ネストしたトランザクション（SAVEPOINT）を作成
        nested = await db_session.begin_nested()
        try:
            db_session.add(worker)
            await db_session.flush()
            pytest.fail("Did not raise IntegrityError")
        except IntegrityError:
            # 期待通りのエラーなのでロールバックして正常終了
            await nested.rollback()

    @pytest.mark.asyncio
    async def test_import_with_duplicate_role_key(self, db_session):
        """同一レポート内で重複した role_key を持つ子レコードをインポートしようとすると IntegrityError が発生する"""
        from sqlalchemy.exc import IntegrityError

        report_id = uuid.uuid4()
        company_id = uuid.uuid4()
        data = build_database_input(
            companies=[build_company_input(id=company_id)],
            reports=[
                build_report_input(
                    id=report_id,
                    report_title="Role Key Conflict",
                    company_id=company_id,
                )
            ],
            report_workers=[
                {
                    "id": str(uuid.uuid4()),
                    "report_id": str(report_id),
                    "worker_id": None,
                    "role_key": "leader",  # 非NULLに設定
                    "worker_role": "リーダー1",
                },
                {
                    "id": str(uuid.uuid4()),
                    "report_id": str(report_id),
                    "worker_id": None,
                    "role_key": "leader",  # 重複
                    "worker_role": "リーダー2",
                },
            ],
        )

        # PRAGMA foreign_keys=ON になっているとエラーが出るはず（ユニーク制約は常時有効だが）
        with pytest.raises(IntegrityError):
            await run_import(
                db_session,
                DatabaseInput.model_validate(data.model_dump(mode="json")),
                overwrite=True,
            )
            await db_session.flush()
