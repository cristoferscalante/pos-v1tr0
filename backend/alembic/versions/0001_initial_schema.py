"""initial schema

Revision ID: 0001_init
Revises: None
Create Date: 2026-06-25 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant",
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=True),
        sa.Column("business_type", sa.String(), nullable=False),
        sa.Column("meta_data", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenant_id", "tenant", ["id"], unique=False)
    op.create_index("ix_tenant_name", "tenant", ["name"], unique=False)
    op.create_index("ix_tenant_slug", "tenant", ["slug"], unique=True)

    op.create_table(
        "user",
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_email", "user", ["email"], unique=True)
    op.create_index("ix_user_id", "user", ["id"], unique=False)
    op.create_index("ix_user_tenant_id", "user", ["tenant_id"], unique=False)

    op.create_table(
        "cash_session",
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("opened_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("closed_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("opening_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("expected_closing_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("actual_closing_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("opened_at", sa.DateTime(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["closed_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["opened_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cash_session_closed_at", "cash_session", ["closed_at"], unique=False)
    op.create_index("ix_cash_session_closed_by_user_id", "cash_session", ["closed_by_user_id"], unique=False)
    op.create_index("ix_cash_session_id", "cash_session", ["id"], unique=False)
    op.create_index("ix_cash_session_opened_at", "cash_session", ["opened_at"], unique=False)
    op.create_index("ix_cash_session_opened_by_user_id", "cash_session", ["opened_by_user_id"], unique=False)
    op.create_index("ix_cash_session_status", "cash_session", ["status"], unique=False)
    op.create_index("ix_cash_session_tenant_id", "cash_session", ["tenant_id"], unique=False)

    op.create_table(
        "notification_log",
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("recipient", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_log_created_at", "notification_log", ["created_at"], unique=False)
    op.create_index("ix_notification_log_event_type", "notification_log", ["event_type"], unique=False)
    op.create_index("ix_notification_log_id", "notification_log", ["id"], unique=False)
    op.create_index("ix_notification_log_recipient", "notification_log", ["recipient"], unique=False)
    op.create_index("ix_notification_log_status", "notification_log", ["status"], unique=False)
    op.create_index("ix_notification_log_tenant_id", "notification_log", ["tenant_id"], unique=False)

    op.create_table(
        "notification_rule",
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("recipients", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("meta_data", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_rule_event_type", "notification_rule", ["event_type"], unique=False)
    op.create_index("ix_notification_rule_id", "notification_rule", ["id"], unique=False)
    op.create_index("ix_notification_rule_tenant_id", "notification_rule", ["tenant_id"], unique=False)

    op.create_table(
        "product",
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("sku", sa.String(), nullable=True),
        sa.Column("barcode", sa.String(), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("cost", sa.Numeric(12, 2), nullable=False),
        sa.Column("stock", sa.Float(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
        sa.Column("image", sa.String(), nullable=True),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("meta_data", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_product_barcode", "product", ["barcode"], unique=False)
    op.create_index("ix_product_id", "product", ["id"], unique=False)
    op.create_index("ix_product_name", "product", ["name"], unique=False)
    op.create_index("ix_product_sku", "product", ["sku"], unique=False)
    op.create_index("ix_product_tenant_id", "product", ["tenant_id"], unique=False)

    op.create_table(
        "password_reset_token",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_password_reset_token_expires_at", "password_reset_token", ["expires_at"], unique=False)
    op.create_index("ix_password_reset_token_id", "password_reset_token", ["id"], unique=False)
    op.create_index("ix_password_reset_token_token_hash", "password_reset_token", ["token_hash"], unique=True)
    op.create_index("ix_password_reset_token_user_id", "password_reset_token", ["user_id"], unique=False)

    op.create_table(
        "sale",
        sa.Column("sale_number", sa.String(), nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("tax", sa.Numeric(12, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("cash_session_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("meta_data", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["cash_session_id"], ["cash_session.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sale_cash_session_id", "sale", ["cash_session_id"], unique=False)
    op.create_index("ix_sale_created_at", "sale", ["created_at"], unique=False)
    op.create_index("ix_sale_id", "sale", ["id"], unique=False)
    op.create_index("ix_sale_sale_number", "sale", ["sale_number"], unique=False)
    op.create_index("ix_sale_tenant_id", "sale", ["tenant_id"], unique=False)
    op.create_index("ix_sale_user_id", "sale", ["user_id"], unique=False)

    op.create_table(
        "saledetail",
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sale_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"]),
        sa.ForeignKeyConstraint(["sale_id"], ["sale.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_saledetail_id", "saledetail", ["id"], unique=False)
    op.create_index("ix_saledetail_product_id", "saledetail", ["product_id"], unique=False)
    op.create_index("ix_saledetail_sale_id", "saledetail", ["sale_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_saledetail_sale_id", table_name="saledetail")
    op.drop_index("ix_saledetail_product_id", table_name="saledetail")
    op.drop_index("ix_saledetail_id", table_name="saledetail")
    op.drop_table("saledetail")
    op.drop_index("ix_sale_user_id", table_name="sale")
    op.drop_index("ix_sale_tenant_id", table_name="sale")
    op.drop_index("ix_sale_sale_number", table_name="sale")
    op.drop_index("ix_sale_id", table_name="sale")
    op.drop_index("ix_sale_created_at", table_name="sale")
    op.drop_index("ix_sale_cash_session_id", table_name="sale")
    op.drop_table("sale")
    op.drop_index("ix_password_reset_token_user_id", table_name="password_reset_token")
    op.drop_index("ix_password_reset_token_token_hash", table_name="password_reset_token")
    op.drop_index("ix_password_reset_token_id", table_name="password_reset_token")
    op.drop_index("ix_password_reset_token_expires_at", table_name="password_reset_token")
    op.drop_table("password_reset_token")
    op.drop_index("ix_product_tenant_id", table_name="product")
    op.drop_index("ix_product_sku", table_name="product")
    op.drop_index("ix_product_name", table_name="product")
    op.drop_index("ix_product_id", table_name="product")
    op.drop_index("ix_product_barcode", table_name="product")
    op.drop_table("product")
    op.drop_index("ix_notification_rule_tenant_id", table_name="notification_rule")
    op.drop_index("ix_notification_rule_id", table_name="notification_rule")
    op.drop_index("ix_notification_rule_event_type", table_name="notification_rule")
    op.drop_table("notification_rule")
    op.drop_index("ix_notification_log_tenant_id", table_name="notification_log")
    op.drop_index("ix_notification_log_status", table_name="notification_log")
    op.drop_index("ix_notification_log_recipient", table_name="notification_log")
    op.drop_index("ix_notification_log_id", table_name="notification_log")
    op.drop_index("ix_notification_log_event_type", table_name="notification_log")
    op.drop_index("ix_notification_log_created_at", table_name="notification_log")
    op.drop_table("notification_log")
    op.drop_index("ix_cash_session_tenant_id", table_name="cash_session")
    op.drop_index("ix_cash_session_status", table_name="cash_session")
    op.drop_index("ix_cash_session_opened_by_user_id", table_name="cash_session")
    op.drop_index("ix_cash_session_opened_at", table_name="cash_session")
    op.drop_index("ix_cash_session_id", table_name="cash_session")
    op.drop_index("ix_cash_session_closed_by_user_id", table_name="cash_session")
    op.drop_index("ix_cash_session_closed_at", table_name="cash_session")
    op.drop_table("cash_session")
    op.drop_index("ix_user_tenant_id", table_name="user")
    op.drop_index("ix_user_id", table_name="user")
    op.drop_index("ix_user_email", table_name="user")
    op.drop_table("user")
    op.drop_index("ix_tenant_slug", table_name="tenant")
    op.drop_index("ix_tenant_name", table_name="tenant")
    op.drop_index("ix_tenant_id", table_name="tenant")
    op.drop_table("tenant")
