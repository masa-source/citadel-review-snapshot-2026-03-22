"""metadata_driven_schema: Drop Inspection* tables, add SchemaDefinition/Site, alter Report/TargetInstrument.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-02-23

EAV 廃止・メタデータ駆動移行: inspection_* 削除、schema_definitions/sites 追加、
reports に site_id/schema_id/custom_data、target_instruments に schema_id/custom_data。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d5e6f7a8b9c0"
down_revision: str | Sequence[str] | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Drop inspection 系（子から親へ）
    op.drop_table("inspection_table_datas")
    op.drop_table("inspection_details")
    op.drop_table("inspection_columns")
    op.drop_table("inspection_rows")
    op.drop_table("inspection_definitions")

    # 2. Create schema_definitions, sites, table_definitions
    op.create_table(
        "schema_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_entity", sa.String(), nullable=True),
        sa.Column("version", sa.String(), nullable=True),
        sa.Column("json_schema", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("ui_schema", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "sites",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "table_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("columns", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "target_instrument_tables",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_instrument_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("table_definition_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("role_key", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("rows", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["table_definition_id"], ["table_definitions.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["target_instrument_id"], ["target_instruments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # 3. Alter reports: drop old columns, add new
    op.drop_column("reports", "internal_control_number")
    op.drop_column("reports", "work_location")
    op.drop_column("reports", "overall_judgment")
    op.drop_column("reports", "work_date_start")
    op.drop_column("reports", "work_date_end")
    op.drop_column("reports", "recipient")
    op.drop_column("reports", "subject")
    op.add_column(
        "reports",
        sa.Column("site_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "reports",
        sa.Column("schema_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "reports",
        sa.Column("custom_data", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )
    op.create_foreign_key(
        "fk_reports_site_id",
        "reports",
        "sites",
        ["site_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_reports_schema_id",
        "reports",
        "schema_definitions",
        ["schema_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 4. Alter target_instruments
    op.add_column(
        "target_instruments",
        sa.Column("schema_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "target_instruments",
        sa.Column("custom_data", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )
    op.create_foreign_key(
        "fk_target_instruments_schema_id",
        "target_instruments",
        "schema_definitions",
        ["schema_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_target_instruments_schema_id", "target_instruments", type_="foreignkey"
    )
    op.drop_column("target_instruments", "custom_data")
    op.drop_column("target_instruments", "schema_id")

    op.drop_constraint("fk_reports_schema_id", "reports", type_="foreignkey")
    op.drop_constraint("fk_reports_site_id", "reports", type_="foreignkey")
    op.drop_column("reports", "custom_data")
    op.drop_column("reports", "schema_id")
    op.drop_column("reports", "site_id")
    op.add_column("reports", sa.Column("subject", sa.String(), nullable=True))
    op.add_column("reports", sa.Column("recipient", sa.String(), nullable=True))
    op.add_column("reports", sa.Column("work_date_end", sa.String(), nullable=True))
    op.add_column("reports", sa.Column("work_date_start", sa.String(), nullable=True))
    op.add_column("reports", sa.Column("overall_judgment", sa.String(), nullable=True))
    op.add_column("reports", sa.Column("work_location", sa.String(), nullable=True))
    op.add_column(
        "reports", sa.Column("internal_control_number", sa.String(), nullable=True)
    )

    op.drop_table("sites")
    op.drop_table("target_instrument_tables")
    op.drop_table("table_definitions")
    op.drop_table("schema_definitions")

    # Recreate inspection_* (minimal structure; full defs would come from init)
    op.create_table(
        "inspection_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("table_key", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "inspection_columns",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "inspection_definition_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("column_key", sa.String(), nullable=True),
        sa.Column("data_type", sa.String(), nullable=True),
        sa.Column("choices", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["inspection_definition_id"],
            ["inspection_definitions.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "inspection_rows",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "inspection_definition_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("row_key", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["inspection_definition_id"],
            ["inspection_definitions.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "inspection_details",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inspection_year", sa.Integer(), nullable=True),
        sa.Column("inspection_type", sa.String(), nullable=True),
        sa.Column("target_instrument_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("inspection_start", sa.String(), nullable=True),
        sa.Column("inspection_end", sa.String(), nullable=True),
        sa.Column("comments", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"]),
        sa.ForeignKeyConstraint(["target_instrument_id"], ["target_instruments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "inspection_table_datas",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inspection_detail_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "inspection_definition_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column("inspection_key", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("values", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(
            ["inspection_definition_id"],
            ["inspection_definitions.id"],
        ),
        sa.ForeignKeyConstraint(
            ["inspection_detail_id"],
            ["inspection_details.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
