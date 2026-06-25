"""supply chain tables

Revision ID: 0003_supply
Revises: 0002_tenant_idx
Create Date: 2026-06-25 16:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_supply"
down_revision = "0002_tenant_idx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "supplier",
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("contact_name", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("document_number", sa.String(), nullable=True),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_supplier_id", "supplier", ["id"], unique=False)
    op.create_index("ix_supplier_name", "supplier", ["name"], unique=False)
    op.create_index("ix_supplier_email", "supplier", ["email"], unique=False)
    op.create_index("ix_supplier_document_number", "supplier", ["document_number"], unique=False)
    op.create_index("ix_supplier_tenant_id", "supplier", ["tenant_id"], unique=False)

    op.create_table(
        "purchase",
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("supplier_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_number", sa.String(), nullable=True),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("tax", sa.Numeric(12, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["supplier_id"], ["supplier.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_purchase_created_at", "purchase", ["created_at"], unique=False)
    op.create_index("ix_purchase_id", "purchase", ["id"], unique=False)
    op.create_index("ix_purchase_invoice_number", "purchase", ["invoice_number"], unique=False)
    op.create_index("ix_purchase_supplier_id", "purchase", ["supplier_id"], unique=False)
    op.create_index("ix_purchase_tenant_id", "purchase", ["tenant_id"], unique=False)
    op.create_index("ix_purchase_user_id", "purchase", ["user_id"], unique=False)

    op.create_table(
        "purchasedetail",
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_cost", sa.Numeric(12, 2), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("purchase_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"]),
        sa.ForeignKeyConstraint(["purchase_id"], ["purchase.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_purchasedetail_id", "purchasedetail", ["id"], unique=False)
    op.create_index("ix_purchasedetail_product_id", "purchasedetail", ["product_id"], unique=False)
    op.create_index("ix_purchasedetail_purchase_id", "purchasedetail", ["purchase_id"], unique=False)

    op.create_table(
        "inventorymovement",
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("movement_type", sa.String(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("previous_stock", sa.Float(), nullable=False),
        sa.Column("new_stock", sa.Float(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(12, 2), nullable=True),
        sa.Column("reference_type", sa.String(), nullable=True),
        sa.Column("reference_id", sa.Uuid(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventorymovement_created_at", "inventorymovement", ["created_at"], unique=False)
    op.create_index("ix_inventorymovement_id", "inventorymovement", ["id"], unique=False)
    op.create_index("ix_inventorymovement_movement_type", "inventorymovement", ["movement_type"], unique=False)
    op.create_index("ix_inventorymovement_product_id", "inventorymovement", ["product_id"], unique=False)
    op.create_index("ix_inventorymovement_reference_id", "inventorymovement", ["reference_id"], unique=False)
    op.create_index("ix_inventorymovement_reference_type", "inventorymovement", ["reference_type"], unique=False)
    op.create_index("ix_inventorymovement_tenant_id", "inventorymovement", ["tenant_id"], unique=False)
    op.create_index("ix_inventorymovement_user_id", "inventorymovement", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_inventorymovement_user_id", table_name="inventorymovement")
    op.drop_index("ix_inventorymovement_tenant_id", table_name="inventorymovement")
    op.drop_index("ix_inventorymovement_reference_type", table_name="inventorymovement")
    op.drop_index("ix_inventorymovement_reference_id", table_name="inventorymovement")
    op.drop_index("ix_inventorymovement_product_id", table_name="inventorymovement")
    op.drop_index("ix_inventorymovement_movement_type", table_name="inventorymovement")
    op.drop_index("ix_inventorymovement_id", table_name="inventorymovement")
    op.drop_index("ix_inventorymovement_created_at", table_name="inventorymovement")
    op.drop_table("inventorymovement")
    op.drop_index("ix_purchasedetail_purchase_id", table_name="purchasedetail")
    op.drop_index("ix_purchasedetail_product_id", table_name="purchasedetail")
    op.drop_index("ix_purchasedetail_id", table_name="purchasedetail")
    op.drop_table("purchasedetail")
    op.drop_index("ix_purchase_user_id", table_name="purchase")
    op.drop_index("ix_purchase_tenant_id", table_name="purchase")
    op.drop_index("ix_purchase_supplier_id", table_name="purchase")
    op.drop_index("ix_purchase_invoice_number", table_name="purchase")
    op.drop_index("ix_purchase_id", table_name="purchase")
    op.drop_index("ix_purchase_created_at", table_name="purchase")
    op.drop_table("purchase")
    op.drop_index("ix_supplier_tenant_id", table_name="supplier")
    op.drop_index("ix_supplier_name", table_name="supplier")
    op.drop_index("ix_supplier_id", table_name="supplier")
    op.drop_index("ix_supplier_email", table_name="supplier")
    op.drop_index("ix_supplier_document_number", table_name="supplier")
    op.drop_table("supplier")
