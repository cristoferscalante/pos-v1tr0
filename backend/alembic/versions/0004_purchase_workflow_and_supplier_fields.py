"""purchase workflow and supplier fields

Revision ID: 0004_purchase_workflow_and_supplier_fields
Revises: 0003_supply_chain_tables
Create Date: 2026-06-25 17:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_purchase_workflow_and_supplier_fields"
down_revision = "0003_supply_chain_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("supplier", sa.Column("city", sa.String(), nullable=True))
    op.add_column("supplier", sa.Column("payment_terms_days", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("supplier", sa.Column("notes", sa.String(), nullable=True))

    op.add_column("purchase", sa.Column("paid_amount", sa.Numeric(12, 2), nullable=False, server_default="0"))
    op.add_column("purchase", sa.Column("balance_due", sa.Numeric(12, 2), nullable=False, server_default="0"))
    op.add_column("purchase", sa.Column("status", sa.String(), nullable=False, server_default="posted"))
    op.create_index("ix_purchase_status", "purchase", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_purchase_status", table_name="purchase")
    op.drop_column("purchase", "status")
    op.drop_column("purchase", "balance_due")
    op.drop_column("purchase", "paid_amount")
    op.drop_column("supplier", "notes")
    op.drop_column("supplier", "payment_terms_days")
    op.drop_column("supplier", "city")
