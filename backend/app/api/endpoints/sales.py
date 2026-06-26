from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
import uuid

from app.core.db import get_session
from app.api.deps import get_current_tenant_id, get_current_user
from app.models.cash_session import CashSession
from app.models.sale import Sale, SaleDetail, SaleReadWithDetails, SaleDetailRead
from app.models.product import Product
from app.models.user import User
from app.services.dian import DianService
from app.services.notifications import notify_low_stock, notify_sale_created
from app.core.config import settings

router = APIRouter()

# Esquemas de validación de entrada para sincronización batch
class SaleDetailSync(BaseModel):
    product_id: uuid.UUID
    quantity: float
    price: Decimal
    total: Decimal

class SaleSync(BaseModel):
    id: uuid.UUID  # Generado en el cliente para mantener consistencia
    sale_number: str
    subtotal: Decimal
    tax: Decimal
    total: Decimal
    payment_method: str
    created_at: datetime
    meta_data: Dict[str, Any] = {}
    details: List[SaleDetailSync]

class SyncRequest(BaseModel):
    sales: List[SaleSync]

@router.post("/sync")
def sync_offline_sales(
    payload: SyncRequest,
    session: Session = Depends(get_session),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_user)
):
    synced_ids = []
    errors = []

    for sale_data in payload.sales:
        try:
            # 1. Verificar idempotencia (evitar duplicados si ya existe el ID)
            existing_sale = session.get(Sale, sale_data.id)
            if existing_sale:
                # Si ya existe y pertenece al mismo tenant, lo marcamos como sincronizado
                if existing_sale.tenant_id == tenant_id:
                    synced_ids.append(sale_data.id)
                continue

            # 2. Registrar la venta
            open_cash_session = session.exec(
                select(CashSession).where(
                    CashSession.tenant_id == tenant_id,
                    CashSession.status == "open",
                )
            ).first()

            new_sale = Sale(
                id=sale_data.id,
                sale_number=sale_data.sale_number,
                subtotal=sale_data.subtotal,
                tax=sale_data.tax,
                total=sale_data.total,
                payment_method=sale_data.payment_method,
                tenant_id=tenant_id,
                user_id=current_user.id,
                cash_session_id=open_cash_session.id if open_cash_session else None,
                created_at=sale_data.created_at,
                meta_data=sale_data.meta_data
            )
            session.add(new_sale)

            low_stock_products = []

            # 3. Registrar los detalles y actualizar stock
            for detail_data in sale_data.details:
                detail = SaleDetail(
                    sale_id=new_sale.id,
                    product_id=detail_data.product_id,
                    quantity=detail_data.quantity,
                    price=detail_data.price,
                    total=detail_data.total
                )
                session.add(detail)

                # Descontar stock del inventario
                product = session.get(Product, detail_data.product_id)
                if product and product.tenant_id == tenant_id:
                    product.stock -= detail_data.quantity
                    session.add(product)
                    if product.stock <= settings.LOW_STOCK_THRESHOLD:
                        low_stock_products.append({"name": product.name, "stock": product.stock})

            session.commit()
            
            # 4. Transmitir e integrar con la DIAN
            if sale_data.meta_data.get("requires_electronic_invoice"):
                try:
                    DianService.transmit_to_dian(new_sale, session)
                except Exception as dian_error:
                    print(f"Error en transmisión DIAN para venta {new_sale.id}: {dian_error}")

            try:
                notify_sale_created(session, new_sale)
            except Exception as notification_error:
                print(f"Error enviando notificación de venta {new_sale.id}: {notification_error}")

            if low_stock_products:
                try:
                    notify_low_stock(session, tenant_id, low_stock_products)
                except Exception as notification_error:
                    print(f"Error enviando alerta de stock bajo para venta {new_sale.id}: {notification_error}")
                 
            synced_ids.append(new_sale.id)

        except Exception as e:
            session.rollback()
            errors.append({
                "sale_id": sale_data.id,
                "error": str(e)
            })

    return {
        "status": "partial_success" if errors else "success",
        "synced_ids": synced_ids,
        "errors": errors
    }

@router.get("/", response_model=List[SaleReadWithDetails])
def get_sales(
    session: Session = Depends(get_session),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id)
):
    sales = session.exec(
        select(Sale).where(Sale.tenant_id == tenant_id).order_by(Sale.created_at.desc())
    ).all()
    
    result = []
    for sale in sales:
        details_read = []
        for detail in sale.details:
            product = session.get(Product, detail.product_id)
            details_read.append(
                SaleDetailRead(
                    product_id=detail.product_id,
                    name=product.name if product else "Producto Eliminado",
                    quantity=detail.quantity,
                    price=detail.price,
                    total=detail.total
                )
            )
        result.append(
            SaleReadWithDetails(
                id=sale.id,
                sale_number=sale.sale_number,
                subtotal=sale.subtotal,
                tax=sale.tax,
                total=sale.total,
                payment_method=sale.payment_method,
                tenant_id=sale.tenant_id,
                user_id=sale.user_id,
                created_at=sale.created_at,
                meta_data=sale.meta_data,
                details=details_read
            )
        )
    return result

@router.get("/{sale_id}", response_model=SaleReadWithDetails)
def get_sale(
    sale_id: uuid.UUID,
    session: Session = Depends(get_session),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id)
):
    sale = session.get(Sale, sale_id)
    if not sale or sale.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La venta no existe o no tiene permisos para acceder a ella"
        )
    
    details_read = []
    for detail in sale.details:
        product = session.get(Product, detail.product_id)
        details_read.append(
            SaleDetailRead(
                product_id=detail.product_id,
                name=product.name if product else "Producto Eliminado",
                quantity=detail.quantity,
                price=detail.price,
                total=detail.total
            )
        )
        
    return SaleReadWithDetails(
        id=sale.id,
        sale_number=sale.sale_number,
        subtotal=sale.subtotal,
        tax=sale.tax,
        total=sale.total,
        payment_method=sale.payment_method,
        tenant_id=sale.tenant_id,
        user_id=sale.user_id,
        created_at=sale.created_at,
        meta_data=sale.meta_data,
        details=details_read
    )
