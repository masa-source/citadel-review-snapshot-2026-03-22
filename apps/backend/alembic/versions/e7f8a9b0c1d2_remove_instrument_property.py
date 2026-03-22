"""remove_instrument_property

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-02-25

InstrumentProperty モデル（instrument_properties テーブル）を削除。
メタデータ駆動（SchemaDefinition + customData）移行に伴うテクニカルデット解消。
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: str | Sequence[str] | None = "d6e7f8a9b0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_table("instrument_properties")


def downgrade() -> None:
    op.create_table(
        "instrument_properties",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("target_instrument_id", sa.String(36), nullable=True),
        sa.Column("property_name", sa.String(), nullable=True),
        sa.Column("property_value", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["target_instrument_id"],
            ["target_instruments.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
