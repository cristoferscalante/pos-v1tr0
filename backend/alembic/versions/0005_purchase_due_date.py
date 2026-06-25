"""purchase due date

Revision ID: 0005_due_date
Revises: 0004_purchase
Create Date: 2026-06-25 16:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_due_date"
down_revision = "0004_purchase"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("purchase", sa.Column("due_date", sa.Date(), nullable=True))
    op.create_index("ix_purchase_due_date", "purchase", ["due_date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_purchase_due_date", table_name="purchase")
    op.drop_column("purchase", "due_date")
