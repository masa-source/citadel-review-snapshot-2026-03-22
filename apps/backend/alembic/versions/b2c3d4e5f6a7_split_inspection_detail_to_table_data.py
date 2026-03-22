"""split_inspection_detail_to_table_data

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-20

InspectionDetail から inspection_definition_id, inspection_key, values を削除し、
新テーブル inspection_table_datas に移す（ヘッダー・明細分離）。
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

import models  # noqa: F401
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. 新テーブル inspection_table_datas を作成
    op.create_table(
        "inspection_table_datas",
        sa.Column("id", models.GUID(length=36), nullable=False),
        sa.Column("inspection_detail_id", models.GUID(length=36), nullable=True),
        sa.Column("inspection_definition_id", models.GUID(length=36), nullable=True),
        sa.Column("inspection_key", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("values", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(
            ["inspection_detail_id"],
            ["inspection_details.id"],
        ),
        sa.ForeignKeyConstraint(
            ["inspection_definition_id"],
            ["inspection_definitions.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # 2. 既存 inspection_details のデータを inspection_table_datas に移行
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            INSERT INTO inspection_table_datas (
                id, inspection_detail_id, inspection_definition_id,
                inspection_key, sort_order, values
            )
            SELECT
                gen_random_uuid(),
                id,
                inspection_definition_id,
                inspection_key,
                COALESCE(sort_order, 0),
                values
            FROM inspection_details
            WHERE inspection_definition_id IS NOT NULL
               OR inspection_key IS NOT NULL
               OR values IS NOT NULL
        """)
    )

    # 3. inspection_details から 3 カラムを削除
    op.drop_constraint(
        "inspection_details_inspection_definition_id_fkey",
        "inspection_details",
        type_="foreignkey",
    )
    op.drop_column("inspection_details", "inspection_definition_id")
    op.drop_column("inspection_details", "inspection_key")
    op.drop_column("inspection_details", "values")


def downgrade() -> None:
    # inspection_details に 3 カラムを復元
    op.add_column(
        "inspection_details",
        sa.Column("inspection_definition_id", models.GUID(length=36), nullable=True),
    )
    op.add_column(
        "inspection_details",
        sa.Column("inspection_key", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.add_column(
        "inspection_details",
        sa.Column("values", sa.JSON(), nullable=True),
    )
    op.create_foreign_key(
        "inspection_details_inspection_definition_id_fkey",
        "inspection_details",
        "inspection_definitions",
        ["inspection_definition_id"],
        ["id"],
    )

    # inspection_table_datas のデータを inspection_details に戻す（1:1 の先頭のみ）
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            UPDATE inspection_details d
            SET
                inspection_definition_id = t.inspection_definition_id,
                inspection_key = t.inspection_key,
                values = t.values
            FROM (
                SELECT DISTINCT ON (inspection_detail_id)
                    inspection_detail_id,
                    inspection_definition_id,
                    inspection_key,
                    sort_order,
                    values
                FROM inspection_table_datas
                ORDER BY inspection_detail_id, sort_order
            ) t
            WHERE d.id = t.inspection_detail_id
        """)
    )

    op.drop_table("inspection_table_datas")
