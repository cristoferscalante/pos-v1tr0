"""tenant scoped indexes

Revision ID: 0002_tenant_idx
Revises: 0001_init
Create Date: 2026-06-25 00:20:00.000000
"""

from alembic import op


revision = "0002_tenant_idx"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_sale_tenant_created_at",
        "sale",
        ["tenant_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_product_tenant_name",
        "product",
        ["tenant_id", "name"],
        unique=False,
    )
    op.create_index(
        "ix_notification_rule_tenant_event_type",
        "notification_rule",
        ["tenant_id", "event_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_notification_rule_tenant_event_type", table_name="notification_rule")
    op.drop_index("ix_product_tenant_name", table_name="product")
    op.drop_index("ix_sale_tenant_created_at", table_name="sale")
