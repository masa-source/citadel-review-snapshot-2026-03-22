"""drop_report_type_from_reports

Revision ID: b1c2d3e4f5a6
Revises: a9b1c2d3e4f5
Create Date: 2026-03-10

reports テーブルから legacy な report_type カラムを削除する。
"""

from collections.abc import Sequence

from sqlalchemy import Column, String, text

from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | Sequence[str] | None = "a9b1c2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


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
    if _column_exists(conn, "reports", "report_type"):
        op.drop_column("reports", "report_type")


def downgrade() -> None:
    # 復元時は単純に NULL 許可の列を追加する（内容の復元はしない）。
    conn = op.get_bind()
    if not _column_exists(conn, "reports", "report_type"):
        op.add_column("reports", Column("report_type", String(), nullable=True))
