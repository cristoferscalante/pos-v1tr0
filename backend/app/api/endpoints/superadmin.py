from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, func
import uuid
from datetime import datetime, timedelta

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User
from app.models.tenant import Tenant, TenantRead
from app.models.product import Product
from app.models.sale import Sale
from pydantic import BaseModel

router = APIRouter()


def get_current_superadmin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operación permitida únicamente para el super administrador del sistema"
        )
    return current_user


class TenantPlanUpdate(BaseModel):
    plan_name: str
    subscription_ends_at: Optional[datetime] = None
    has_electronic_billing: bool
    folios_remaining: int
    folios_total: int
    is_active: bool


class FolioRechargeRequest(BaseModel):
    folios: int = 100


class TenantWithStats(BaseModel):
    # Tenant fields
    id: str
    name: str
    slug: Optional[str] = None
    business_type: str
    plan_name: str
    subscription_ends_at: Optional[datetime] = None
    has_electronic_billing: bool
    folios_remaining: int
    folios_total: int
    is_active: bool
    meta_data: Optional[dict] = None
    # Stats
    owner_email: Optional[str] = None
    owner_id: Optional[str] = None
    product_count: int = 0
    sale_count_total: int = 0
    sale_count_30d: int = 0
    last_sale_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    user_count: int = 0

    class Config:
        from_attributes = True


@router.get("/tenants", response_model=List[TenantWithStats])
def list_tenants(
    session: Session = Depends(get_session),
    superadmin: User = Depends(get_current_superadmin)
):
    tenants = session.exec(select(Tenant)).all()
    result = []

    for tenant in tenants:
        # Owner (admin user of this tenant)
        owner = session.exec(
            select(User).where(
                User.tenant_id == tenant.id,
                User.is_admin == True
            ).limit(1)
        ).first()

        # Product count
        product_count = session.exec(
            select(func.count(Product.id)).where(Product.tenant_id == tenant.id)
        ).one()

        # Total sales
        sale_count_total = session.exec(
            select(func.count(Sale.id)).where(Sale.tenant_id == tenant.id)
        ).one()

        # Sales last 30 days
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        sale_count_30d = session.exec(
            select(func.count(Sale.id)).where(
                Sale.tenant_id == tenant.id,
                Sale.created_at >= thirty_days_ago
            )
        ).one()

        # Last sale date
        last_sale = session.exec(
            select(Sale.created_at).where(
                Sale.tenant_id == tenant.id
            ).order_by(Sale.created_at.desc()).limit(1)
        ).first()

        # User count for this tenant
        user_count = session.exec(
            select(func.count(User.id)).where(User.tenant_id == tenant.id)
        ).one()

        result.append(TenantWithStats(
            id=str(tenant.id),
            name=tenant.name,
            slug=tenant.slug,
            business_type=tenant.business_type or "otro",
            plan_name=tenant.plan_name,
            subscription_ends_at=tenant.subscription_ends_at,
            has_electronic_billing=tenant.has_electronic_billing,
            folios_remaining=tenant.folios_remaining,
            folios_total=tenant.folios_total,
            is_active=tenant.is_active,
            meta_data=tenant.meta_data if isinstance(tenant.meta_data, dict) else None,
            owner_email=owner.email if owner else None,
            owner_id=str(owner.id) if owner else None,
            product_count=product_count or 0,
            sale_count_total=sale_count_total or 0,
            sale_count_30d=sale_count_30d or 0,
            last_sale_at=last_sale,
            user_count=user_count or 0,
        ))

    return result


@router.put("/tenants/{tenant_id}/plan", response_model=TenantRead)
def update_tenant_plan(
    tenant_id: uuid.UUID,
    data: TenantPlanUpdate,
    session: Session = Depends(get_session),
    superadmin: User = Depends(get_current_superadmin)
):
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    tenant.plan_name = data.plan_name
    tenant.subscription_ends_at = data.subscription_ends_at
    tenant.has_electronic_billing = data.has_electronic_billing
    tenant.folios_remaining = data.folios_remaining
    tenant.folios_total = data.folios_total
    tenant.is_active = data.is_active

    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


@router.post("/tenants/{tenant_id}/recharge", response_model=TenantRead)
def recharge_folios(
    tenant_id: uuid.UUID,
    data: FolioRechargeRequest,
    session: Session = Depends(get_session),
    superadmin: User = Depends(get_current_superadmin)
):
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    tenant.folios_remaining += data.folios
    tenant.folios_total += data.folios
    tenant.has_electronic_billing = True

    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


@router.delete("/tenants/{tenant_id}", status_code=204)
def delete_tenant(
    tenant_id: uuid.UUID,
    session: Session = Depends(get_session),
    superadmin: User = Depends(get_current_superadmin)
):
    """Elimina un negocio y todos sus datos usando SQL directo en orden correcto de FKs."""
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    tid = str(tenant_id)
    conn = session.connection()

    # Orden de borrado respetando FK constraints:
    # 1. Detalles de ventas (FK → sale)
    conn.execute(
        __import__('sqlalchemy').text(
            "DELETE FROM saledetail WHERE sale_id IN (SELECT id FROM sale WHERE tenant_id = :tid)"
        ), {"tid": tid}
    )
    # 2. Ventas (FK → tenant)
    conn.execute(__import__('sqlalchemy').text("DELETE FROM sale WHERE tenant_id = :tid"), {"tid": tid})

    # 3. Detalles de compras (FK → purchase)
    conn.execute(
        __import__('sqlalchemy').text(
            "DELETE FROM purchasedetail WHERE purchase_id IN (SELECT id FROM purchase WHERE tenant_id = :tid)"
        ), {"tid": tid}
    )
    # 4. Pagos de compras
    conn.execute(
        __import__('sqlalchemy').text(
            "DELETE FROM purchasepayment WHERE purchase_id IN (SELECT id FROM purchase WHERE tenant_id = :tid)"
        ), {"tid": tid}
    )
    # 5. Compras
    conn.execute(__import__('sqlalchemy').text("DELETE FROM purchase WHERE tenant_id = :tid"), {"tid": tid})

    # 6. Movimientos de inventario
    conn.execute(__import__('sqlalchemy').text("DELETE FROM inventorymovement WHERE tenant_id = :tid"), {"tid": tid})

    # 7. Sesiones de caja
    conn.execute(__import__('sqlalchemy').text("DELETE FROM cash_session WHERE tenant_id = :tid"), {"tid": tid})

    # 8. Proveedores
    conn.execute(__import__('sqlalchemy').text("DELETE FROM supplier WHERE tenant_id = :tid"), {"tid": tid})

    # 9. Productos
    conn.execute(__import__('sqlalchemy').text("DELETE FROM product WHERE tenant_id = :tid"), {"tid": tid})

    # 10. Reglas y logs de notificación
    conn.execute(__import__('sqlalchemy').text("DELETE FROM notification_rule WHERE tenant_id = :tid"), {"tid": tid})
    conn.execute(__import__('sqlalchemy').text("DELETE FROM notification_log WHERE tenant_id = :tid"), {"tid": tid})

    # 11. Tokens de reset de contraseña
    conn.execute(
        __import__('sqlalchemy').text(
            "DELETE FROM password_reset_token WHERE user_id IN (SELECT id FROM \"user\" WHERE tenant_id = :tid)"
        ), {"tid": tid}
    )

    # 12. Usuarios (FK → tenant)
    conn.execute(__import__('sqlalchemy').text("DELETE FROM \"user\" WHERE tenant_id = :tid"), {"tid": tid})

    # 13. Finalmente el tenant
    conn.execute(__import__('sqlalchemy').text("DELETE FROM tenant WHERE id = :tid"), {"tid": tid})

    session.commit()
