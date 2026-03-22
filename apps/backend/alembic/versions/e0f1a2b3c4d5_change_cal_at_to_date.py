"""change_cal_at_to_date

Revision ID: e0f1a2b3c4d5
Revises: b1c2d3e4f5a6
Create Date: 2026-03-12

OwnedInstrument の cal_at カラムを VARCHAR から Date 型に変更する。
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e0f1a2b3c4d5"
down_revision: str | Sequence[str] | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # 不正な日付文字列を事前に NULL にクリアしてから型変換する
    conn.execute(
        sa.text(
            "UPDATE owned_instruments "
            "SET cal_at = NULL "
            "WHERE cal_at IS NOT NULL "
            "AND cal_at !~ '^\\d{4}-\\d{2}-\\d{2}$'"
        )
    )

    # VARCHAR → Date への型変更（PostgreSQL では ::date キャストを利用）
    op.alter_column(
        "owned_instruments",
        "cal_at",
        existing_type=sa.VARCHAR(),
        type_=sa.Date(),
        existing_nullable=True,
        postgresql_using="cal_at::date",
    )


def downgrade() -> None:
    # Date → VARCHAR への巻き戻し。PostgreSQL では ::text キャストを利用。
    op.alter_column(
        "owned_instruments",
        "cal_at",
        existing_type=sa.Date(),
        type_=sa.VARCHAR(),
        existing_nullable=True,
        postgresql_using="cal_at::text",
    )
