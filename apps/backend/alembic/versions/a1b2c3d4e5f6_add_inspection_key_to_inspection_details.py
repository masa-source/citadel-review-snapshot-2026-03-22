"""add_inspection_key_to_inspection_details

Revision ID: a1b2c3d4e5f6
Revises: 717c5bbe7539
Create Date: 2026-02-15

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "717c5bbe7539"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "inspection_details",
        sa.Column("inspection_key", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inspection_details", "inspection_key")
