"""tenant sale sequence counter

Añade tenant.last_sale_seq: un consecutivo por tenant que el backend incrementa
de forma atómica (con SELECT ... FOR UPDATE sobre la fila del tenant) para
asignar el sale_number definitivo al sincronizar una venta, en vez de confiar en
el número que cada caja/dispositivo genera localmente contando su propio
IndexedDB (lo que producía sale_number duplicados entre cajas del mismo
negocio). Ver hallazgo 5.2 del plan de mejora.

El backfill inicializa last_sale_seq con la cantidad de ventas que ya tiene cada
tenant, para que los números nuevos continúen después de los históricos y se
reduzca (aunque no se garantice al 100%, dado que antes no había un consecutivo
centralizado) el riesgo de colisión con numeración ya emitida.

Revision ID: 0007_sale_seq
Revises: 0006_payments
Create Date: 2026-08-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_sale_seq"
down_revision = "0006_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant",
        sa.Column("last_sale_seq", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        """
        UPDATE tenant
        SET last_sale_seq = COALESCE(
            (SELECT COUNT(*) FROM sale WHERE sale.tenant_id = tenant.id),
            0
        )
        """
    )


def downgrade() -> None:
    op.drop_column("tenant", "last_sale_seq")
