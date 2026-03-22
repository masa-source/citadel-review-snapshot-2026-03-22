"""add_report_format_and_report_format_template

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-02-23

ReportTemplate から report_type / sort_order を分離し、
ReportFormat（レポート種別）と ReportFormatTemplate（中継）を追加する。
既存データは report_type ごとに ReportFormat を作成し、
各 ReportTemplate を ReportFormatTemplate で紐づけてからカラムを削除する。
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from sqlalchemy import text

import models  # noqa: F401
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(conn, table_name: str) -> bool:
    r = conn.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = :t"
        ),
        {"t": table_name},
    )
    return r.scalar() is not None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
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

    # 1. report_formats テーブルを作成（既存ならスキップ・本番で既にテーブルがある場合に対応）
    if not _table_exists(conn, "report_formats"):
        op.create_table(
            "report_formats",
            sa.Column("id", models.GUID(length=36), nullable=False),
            sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    # 2. report_format_templates テーブルを作成（既存ならスキップ）
    if not _table_exists(conn, "report_format_templates"):
        op.create_table(
            "report_format_templates",
            sa.Column("id", models.GUID(length=36), nullable=False),
            sa.Column("report_format_id", models.GUID(length=36), nullable=True),
            sa.Column("report_template_id", models.GUID(length=36), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(
                ["report_format_id"],
                ["report_formats.id"],
            ),
            sa.ForeignKeyConstraint(
                ["report_template_id"],
                ["report_templates.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_report_format_templates_report_format_id"),
            "report_format_templates",
            ["report_format_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_report_format_templates_report_template_id"),
            "report_format_templates",
            ["report_template_id"],
            unique=False,
        )

    # 3. データ移行は report_templates に report_type が残っている場合のみ実行
    if _column_exists(conn, "report_templates", "report_type"):
        # report_type ごとに ReportFormat を作成
        result = conn.execute(
            text(
                "SELECT DISTINCT report_type FROM report_templates WHERE report_type IS NOT NULL"
            )
        )
        distinct_types = [row[0] for row in result]
        format_id_by_name = {}
        for report_type in distinct_types:
            fmt_id = str(uuid.uuid4())
            conn.execute(
                text("INSERT INTO report_formats (id, name) VALUES (:id, :name)"),
                {"id": fmt_id, "name": report_type or ""},
            )
            format_id_by_name[report_type] = fmt_id

        if "作業報告書" not in format_id_by_name:
            default_id = str(uuid.uuid4())
            conn.execute(
                text("INSERT INTO report_formats (id, name) VALUES (:id, :name)"),
                {"id": default_id, "name": "作業報告書"},
            )
            format_id_by_name["作業報告書"] = default_id
        default_format_id = format_id_by_name.get("作業報告書")

        result = conn.execute(
            text("SELECT id, report_type, sort_order FROM report_templates")
        )
        for row in result:
            template_id, rt_type, sort_order = row
            fmt_id = format_id_by_name.get(rt_type) if rt_type else default_format_id
            if not fmt_id:
                fmt_id = default_format_id
            rft_id = str(uuid.uuid4())
            so = sort_order if sort_order is not None else 0
            conn.execute(
                text(
                    "INSERT INTO report_format_templates (id, report_format_id, report_template_id, sort_order) "
                    "VALUES (:id, :report_format_id, :report_template_id, :sort_order)"
                ),
                {
                    "id": rft_id,
                    "report_format_id": fmt_id,
                    "report_template_id": str(template_id),
                    "sort_order": so,
                },
            )

    # 4. report_templates から report_type と sort_order を削除（存在する場合のみ）
    if _column_exists(conn, "report_templates", "report_type"):
        op.drop_index(
            op.f("ix_report_templates_report_type"),
            table_name="report_templates",
        )
        op.drop_column("report_templates", "report_type")
    if _column_exists(conn, "report_templates", "sort_order"):
        op.drop_column("report_templates", "sort_order")


def downgrade() -> None:
    # 1. report_templates に report_type と sort_order を復元
    op.add_column(
        "report_templates",
        sa.Column("sort_order", sa.Integer(), nullable=True),
    )
    op.add_column(
        "report_templates",
        sa.Column("report_type", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.create_index(
        op.f("ix_report_templates_report_type"),
        "report_templates",
        ["report_type"],
        unique=False,
    )

    # 2. report_format_templates から report_templates に report_type/sort_order を戻す
    #    （1 テンプレートが複数 format に紐づく場合は先頭 1 件のみ反映）
    conn = op.get_bind()
    result = conn.execute(
        text(
            "SELECT rft.report_template_id, rf.name, rft.sort_order "
            "FROM report_format_templates rft "
            "JOIN report_formats rf ON rf.id = rft.report_format_id "
            "ORDER BY rft.report_template_id, rft.sort_order"
        )
    )
    seen_template_ids = set()
    for row in result:
        template_id, name, sort_order = row
        if template_id in seen_template_ids:
            continue
        seen_template_ids.add(template_id)
        conn.execute(
            text(
                "UPDATE report_templates SET report_type = :name, sort_order = :sort_order WHERE id = :id"
            ),
            {"id": template_id, "name": name, "sort_order": sort_order},
        )

    # 3. report_format_templates と report_formats を削除
    op.drop_index(
        op.f("ix_report_format_templates_report_template_id"),
        table_name="report_format_templates",
    )
    op.drop_index(
        op.f("ix_report_format_templates_report_format_id"),
        table_name="report_format_templates",
    )
    op.drop_table("report_format_templates")
    op.drop_table("report_formats")
