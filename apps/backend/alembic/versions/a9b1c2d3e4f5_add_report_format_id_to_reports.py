"""add_report_format_id_to_reports

Revision ID: a9b1c2d3e4f5
Revises: f8a9b0c1d2e3
Create Date: 2026-03-10

Report に report_format_id を追加し、既存の report_type から ReportFormat にマッピングする。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import text

import models  # noqa: F401
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9b1c2d3e4f5"
down_revision: str | Sequence[str] | None = "f8a9b0c1d2e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    """PostgreSQL / SQLite 両対応のカラム存在チェック。"""
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

    # 1. reports.report_format_id カラムを追加（存在しない場合のみ）
    if not _column_exists(conn, "reports", "report_format_id"):
        op.add_column(
            "reports",
            sa.Column("report_format_id", models.GUID(length=36), nullable=True),
        )
        op.create_foreign_key(
            "fk_reports_report_format_id_report_formats",
            source_table="reports",
            referent_table="report_formats",
            local_cols=["report_format_id"],
            remote_cols=["id"],
        )

    # 2. 既存レポートの report_type から report_format_id をマッピング
    #    - report_type と ReportFormat.name が一致するものを優先的に紐づけ
    #    - 一致しない report_type があれば、その名前で ReportFormat を新規作成
    #    - report_type が NULL / 空文字のものは「作業報告書」にフォールバック
    distinct_types_result = conn.execute(
        text(
            "SELECT DISTINCT report_type "
            "FROM reports "
            "WHERE report_type IS NOT NULL AND report_type <> ''"
        )
    )
    distinct_types = [row[0] for row in distinct_types_result]

    format_id_by_name: dict[str, str] = {}

    # 既存の ReportFormat をロード
    existing_formats = conn.execute(
        text("SELECT id, name FROM report_formats")
    ).fetchall()
    for fmt_id, name in existing_formats:
        if name is not None:
            format_id_by_name[str(name)] = str(fmt_id)

    # 「作業報告書」の既定フォーマットを確保
    default_name = "作業報告書"
    default_format_id = format_id_by_name.get(default_name)
    if default_format_id is None:
        result = conn.execute(
            text(
                "INSERT INTO report_formats (id, name) VALUES (gen_random_uuid(), :name) RETURNING id"
            ),
            {"name": default_name},
        )
        default_format_id = str(result.scalar_one())
        format_id_by_name[default_name] = default_format_id

    # distinct な report_type ごとに ReportFormat を作成・取得
    for report_type in distinct_types:
        name = str(report_type)
        fmt_id = format_id_by_name.get(name)
        if fmt_id is None:
            result = conn.execute(
                text(
                    "INSERT INTO report_formats (id, name) "
                    "VALUES (gen_random_uuid(), :name) RETURNING id"
                ),
                {"name": name},
            )
            fmt_id = str(result.scalar_one())
            format_id_by_name[name] = fmt_id

        conn.execute(
            text(
                "UPDATE reports "
                "SET report_format_id = :fmt_id "
                "WHERE report_type = :name AND (report_format_id IS NULL OR report_format_id = :zero_uuid)"
            ),
            {"fmt_id": fmt_id, "name": name, "zero_uuid": None},
        )

    # report_type が NULL / 空 のレポートに対しては default_format_id を設定
    conn.execute(
        text(
            "UPDATE reports "
            "SET report_format_id = :fmt_id "
            "WHERE (report_type IS NULL OR report_type = '') "
            "AND (report_format_id IS NULL OR report_format_id = :zero_uuid)"
        ),
        {"fmt_id": default_format_id, "zero_uuid": None},
    )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "reports", "report_format_id"):
        op.drop_constraint(
            "fk_reports_report_format_id_report_formats",
            table_name="reports",
            type_="foreignkey",
        )
        op.drop_column("reports", "report_format_id")
