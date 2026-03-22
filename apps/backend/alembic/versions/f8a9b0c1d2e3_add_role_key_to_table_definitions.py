"""add role_key to table_definitions

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-02-28

TableDefinition に role_key を追加。Scout の役割キーフォームのデフォルト値として利用する。
冪等化: カラムが既に存在する場合はスキップ（本番DBとローカルDBの状態差に対応）。
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from sqlalchemy import text

import models  # noqa: F401
from alembic import op

revision: str = "f8a9b0c1d2e3"
down_revision: str | Sequence[str] | None = "e7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(connection, table: str, column: str) -> bool:
    result = connection.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :table AND column_name = :column"
        ),
        {"table": table, "column": column},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "table_definitions", "role_key"):
        op.add_column(
            "table_definitions",
            sa.Column("role_key", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "table_definitions", "role_key"):
        op.drop_column("table_definitions", "role_key")
