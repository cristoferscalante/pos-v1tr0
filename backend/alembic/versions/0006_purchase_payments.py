"""purchase payments

Revision ID: 0006_payments
Revises: 0005_due_date
Create Date: 2026-06-25 18:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_payments"
down_revision = "0005_due_date"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "purchasepayment",
        sa.Column("purchase_id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", sa.String(), nullable=False),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["purchase_id"], ["purchase.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_purchasepayment_id", "purchasepayment", ["id"], unique=False)
    op.create_index("ix_purchasepayment_purchase_id", "purchasepayment", ["purchase_id"], unique=False)
    op.create_index("ix_purchasepayment_tenant_id", "purchasepayment", ["tenant_id"], unique=False)
    op.create_index("ix_purchasepayment_user_id", "purchasepayment", ["user_id"], unique=False)
    op.create_index("ix_purchasepayment_created_at", "purchasepayment", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_purchasepayment_created_at", table_name="purchasepayment")
    op.drop_index("ix_purchasepayment_user_id", table_name="purchasepayment")
    op.drop_index("ix_purchasepayment_tenant_id", table_name="purchasepayment")
    op.drop_index("ix_purchasepayment_purchase_id", table_name="purchasepayment")
    op.drop_index("ix_purchasepayment_id", table_name="purchasepayment")
    op.drop_table("purchasepayment")
