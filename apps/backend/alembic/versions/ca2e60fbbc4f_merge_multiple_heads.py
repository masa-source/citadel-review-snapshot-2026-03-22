"""merge multiple heads

Revision ID: ca2e60fbbc4f
Revises: e0f1a2b3c4d5
Create Date: 2026-03-12 21:40:33.659143

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "ca2e60fbbc4f"
down_revision: str | Sequence[str] | None = "e0f1a2b3c4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
