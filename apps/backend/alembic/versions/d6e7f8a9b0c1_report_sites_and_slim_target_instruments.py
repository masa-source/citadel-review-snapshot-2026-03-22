"""report_sites_and_slim_target_instruments

Revision ID: d6e7f8a9b0c1
Revises: d5e6f7a8b9c0
Create Date: 2026-02-23

Report から site_id を削除し report_sites 中間テーブルを追加。
既存の reports.site_id は report_sites に移行（role_key='main'）。
TargetInstrument から製造番号・設置場所等の8カラムを削除。
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from sqlalchemy import text

import models  # noqa: F401
from alembic import op

revision: str = "d6e7f8a9b0c1"
down_revision: str | Sequence[str] | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(conn, table_name: str) -> bool:
    dialect = conn.dialect.name
    if dialect == "sqlite":
        r = conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = :t"),
            {"t": table_name},
        )
    else:
        r = conn.execute(
            text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = :t"
            ),
            {"t": table_name},
        )
    return r.scalar() is not None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    dialect = conn.dialect.name
    if dialect == "sqlite":
        quoted = '"' + table_name.replace('"', '""') + '"'
        r = conn.execute(text("PRAGMA table_info(" + quoted + ")"))
        return any(row[1] == column_name for row in r)
    r = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
        ),
        {"t": table_name, "c": column_name},
    )
    return r.scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. report_sites テーブルを作成
    if not _table_exists(conn, "report_sites"):
        op.create_table(
            "report_sites",
            sa.Column("id", models.GUID(length=36), nullable=False),
            sa.Column("report_id", models.GUID(length=36), nullable=True),
            sa.Column("site_id", models.GUID(length=36), nullable=True),
            sa.Column("role_key", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(
                ["report_id"],
                ["reports.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["site_id"],
                ["sites.id"],
                ondelete="SET NULL",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "report_id",
                "role_key",
                name="uq_report_sites_report_role_key",
            ),
        )
        op.create_index(
            op.f("ix_report_sites_report_id"),
            "report_sites",
            ["report_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_report_sites_site_id"),
            "report_sites",
            ["site_id"],
            unique=False,
        )

    # 2. 既存の reports.site_id を report_sites に移行
    if _column_exists(conn, "reports", "site_id"):
        result = conn.execute(
            text("SELECT id, site_id FROM reports WHERE site_id IS NOT NULL")
        )
        for row in result:
            report_id, site_id = row
            rs_id = str(uuid.uuid4())
            conn.execute(
                text(
                    "INSERT INTO report_sites (id, report_id, site_id, role_key, sort_order) "
                    "VALUES (:id, :report_id, :site_id, :role_key, :sort_order)"
                ),
                {
                    "id": rs_id,
                    "report_id": str(report_id),
                    "site_id": str(site_id),
                    "role_key": "main",
                    "sort_order": 0,
                },
            )

    # 3. reports から site_id と FK を削除
    if _column_exists(conn, "reports", "site_id"):
        op.drop_constraint("fk_reports_site_id", "reports", type_="foreignkey")
        op.drop_column("reports", "site_id")

    # 4. target_instruments から不要カラムを削除
    for col in (
        "manufacturing_number",
        "location",
        "range",
        "manufacturing_date",
        "overall_assessment",
        "electrode_model",
        "detector_model",
        "detector_manufacturing_number",
    ):
        if _column_exists(conn, "target_instruments", col):
            op.drop_column("target_instruments", col)


def downgrade() -> None:
    conn = op.get_bind()

    # 1. reports に site_id を復元
    op.add_column(
        "reports",
        sa.Column("site_id", models.GUID(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_reports_site_id",
        "reports",
        "sites",
        ["site_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 2. report_sites の main を reports.site_id に戻す
    if _table_exists(conn, "report_sites"):
        result = conn.execute(
            text(
                "SELECT report_id, site_id FROM report_sites "
                "WHERE role_key = 'main' AND site_id IS NOT NULL"
            )
        )
        for row in result:
            report_id, site_id = row
            conn.execute(
                text("UPDATE reports SET site_id = :site_id WHERE id = :report_id"),
                {"site_id": str(site_id), "report_id": str(report_id)},
            )

    # 3. report_sites テーブル削除
    op.drop_index(op.f("ix_report_sites_site_id"), table_name="report_sites")
    op.drop_index(op.f("ix_report_sites_report_id"), table_name="report_sites")
    op.drop_table("report_sites")

    # 4. target_instruments にカラムを復元
    op.add_column(
        "target_instruments",
        sa.Column(
            "manufacturing_number", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
    )
    op.add_column(
        "target_instruments",
        sa.Column("location", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.add_column(
        "target_instruments",
        sa.Column("range", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.add_column(
        "target_instruments",
        sa.Column(
            "manufacturing_date", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
    )
    op.add_column(
        "target_instruments",
        sa.Column(
            "overall_assessment", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
    )
    op.add_column(
        "target_instruments",
        sa.Column("electrode_model", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.add_column(
        "target_instruments",
        sa.Column("detector_model", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.add_column(
        "target_instruments",
        sa.Column(
            "detector_manufacturing_number",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=True,
        ),
    )
