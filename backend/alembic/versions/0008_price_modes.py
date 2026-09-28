"""price modes: wholesale price and per-line price mode / unit cost

Añade product.wholesale_price (precio al por mayor; NULL = usar price, que es el
precio al detal) y, por línea de venta, saledetail.price_mode ('retail' |
'wholesale') y saledetail.unit_cost (costo congelado al vender, para que la
ganancia no cambie cuando más tarde cambia el costo del producto).

Revision ID: 0008_price_modes
Revises: 0007_sale_seq
Create Date: 2026-09-28 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0008_price_modes"
down_revision = "0007_sale_seq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("product", sa.Column("wholesale_price", sa.Numeric(12, 2), nullable=True))
    op.add_column(
        "saledetail",
        sa.Column("price_mode", sa.String(), nullable=False, server_default="retail"),
    )
    op.add_column("saledetail", sa.Column("unit_cost", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("saledetail", "unit_cost")
    op.drop_column("saledetail", "price_mode")
    op.drop_column("product", "wholesale_price")
