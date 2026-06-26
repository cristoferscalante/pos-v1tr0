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
from app.models.tenant import Tenant
from app.models.user import User
from app.services.dian import DianService
from app.services.factus import FactusService
from app.services.notifications import notify_low_stock, notify_sale_created
from app.core.config import settings

router = APIRouter()

# Esquemas de validación de entrada para sincronización batch
class SaleDetailSync(BaseModel):
    product_id: uuid.UUID
    quantity: float
    price: Decimal
    total: Decimal
    name: str | None = None
    tax_rate: Decimal | None = None

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
                    tenant = session.get(Tenant, tenant_id)
                    tenant_meta = dict(tenant.meta_data or {}) if tenant else {}
                    if tenant_meta.get("electronic_invoicing_enabled") and tenant_meta.get("electronic_invoicing_provider") == "factus":
                        factus_result = _emit_with_factus(
                            sale=new_sale,
                            details=sale_data.details,
                            tenant_meta=tenant_meta,
                            session=session,
                        )
                        current_metadata = dict(new_sale.meta_data or {})
                        current_metadata.update({
                            "dian_status": "validated" if factus_result.get("data", {}).get("is_validated") else "submitted",
                            "cufe": factus_result.get("data", {}).get("cufe"),
                            "qr_url": factus_result.get("data", {}).get("links", {}).get("qr"),
                            "factus_status": factus_result.get("status"),
                            "factus_message": factus_result.get("message"),
                            "factus_bill_number": factus_result.get("data", {}).get("number"),
                            "factus_public_url": factus_result.get("data", {}).get("links", {}).get("public_url"),
                            "factus_payload_preview": factus_result,
                        })
                        new_sale.meta_data = current_metadata
                        session.add(new_sale)
                        session.commit()
                        session.refresh(new_sale)
                    else:
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


def _emit_with_factus(*, sale: Sale, details: List[SaleDetailSync], tenant_meta: Dict[str, Any], session: Session) -> dict[str, Any]:
    import asyncio

    environment = tenant_meta.get("electronic_invoicing_environment") or "sandbox"
    client_id = tenant_meta.get("factus_client_id")
    client_secret = tenant_meta.get("factus_client_secret")
    username = tenant_meta.get("factus_username")
    password = tenant_meta.get("factus_password")
    numbering_range_id = tenant_meta.get("factus_numbering_range_id")

    if not all([client_id, client_secret, username, password]):
        raise ValueError("Factus no está completamente configurado para este cliente")

    customer_document_code = str((sale.meta_data or {}).get("customer_document_code") or "13")
    customer_identification = str((sale.meta_data or {}).get("customer_identification") or "22222222222")
    customer_name = str((sale.meta_data or {}).get("customer_name") or "Consumidor Final")
    customer_email = (sale.meta_data or {}).get("customer_email")
    customer_phone = (sale.meta_data or {}).get("customer_phone")
    customer_address = (sale.meta_data or {}).get("customer_address")

    async def _run() -> dict[str, Any]:
        token_data = await FactusService.authenticate(
            environment=environment,
            client_id=client_id,
            client_secret=client_secret,
            username=username,
            password=password,
        )

        access_token = token_data["access_token"]
        if customer_document_code in {"13", "31"}:
            try:
                acquirer_data = await FactusService.get_acquirer(
                    environment=environment,
                    access_token=access_token,
                    identification_document_code=customer_document_code,
                    identification_number=customer_identification,
                )
                acquirer = acquirer_data.get("data") or {}
                customer_name_resolved = acquirer.get("name") or customer_name
                customer_email_resolved = customer_email or acquirer.get("email")
            except Exception:
                customer_name_resolved = customer_name
                customer_email_resolved = customer_email
        else:
            customer_name_resolved = customer_name
            customer_email_resolved = customer_email

        payload: dict[str, Any] = {
            "reference_code": sale.id.hex,
            "document": "01",
            "operation_type": "10",
            "send_email": False,
            "observation": f"Venta POS {sale.sale_number}",
            "payment_details": [{
                "payment_form": "1",
                "payment_method_code": _map_payment_method(sale.payment_method),
                "reference_code": sale.sale_number,
                "amount": f"{sale.total:.2f}",
            }],
            "customer": _build_customer_payload(
                identification_document_code=customer_document_code,
                identification=customer_identification,
                name=customer_name_resolved,
                email=customer_email_resolved,
                phone=customer_phone,
                address=customer_address,
            ),
            "items": [_build_item_payload(detail, session) for detail in details],
        }
        if numbering_range_id:
            payload["numbering_range_id"] = numbering_range_id

        return await FactusService.create_bill(
            environment=environment,
            access_token=access_token,
            payload=payload,
        )

    return asyncio.run(_run())


def _map_payment_method(payment_method: str) -> str:
    return {
        "cash": "10",
        "card": "48",
        "transfer": "47",
    }.get(payment_method, "10")


def _build_customer_payload(
    *,
    identification_document_code: str,
    identification: str,
    name: str,
    email: str | None,
    phone: str | None,
    address: str | None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "identification_document_code": identification_document_code,
        "identification": identification,
    }
    if identification_document_code == "31":
        payload.update({
            "legal_organization_code": "1",
            "tribute_code": "ZZ",
            "company": name,
        })
    else:
        payload.update({
            "legal_organization_code": "2",
            "names": name,
        })
    if email:
        payload["email"] = email
    if phone:
        payload["phone"] = phone
    if address:
        payload["address"] = address
    return payload


def _build_item_payload(detail: SaleDetailSync, session: Session) -> Dict[str, Any]:
    product = session.get(Product, detail.product_id)
    tax_rate = float(detail.tax_rate if detail.tax_rate is not None else (product.tax_rate if product and product.tax_rate is not None else 19))
    gross_price = float(detail.price)
    net_price = gross_price / (1 + tax_rate / 100) if tax_rate > 0 else gross_price
    item_name = detail.name or (product.name if product else f"Producto {str(detail.product_id)[:8]}")

    return {
        "code_reference": str(detail.product_id),
        "name": item_name,
        "quantity": f"{detail.quantity:.2f}",
        "discount_rate": "0.00",
        "price": f"{net_price:.2f}",
        "unit_measure_code": "94",
        "standard_code": "999",
        "taxes": [{
            "code": "01",
            "rate": f"{tax_rate:.2f}",
        }],
    }
