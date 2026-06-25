from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user
from app.core.db import get_session
from app.models.product import Product
from app.models.purchase import InventoryMovement, Purchase, PurchaseCreate, PurchaseDetail
from app.models.supplier import Supplier
from app.models.user import User

router = APIRouter()


@router.get("/")
def list_purchases(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return session.exec(
        select(Purchase)
        .where(Purchase.tenant_id == current_user.tenant_id)
        .order_by(Purchase.created_at.desc())
    ).all()


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_purchase(
    data: PurchaseCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    supplier = session.get(Supplier, data.supplier_id)
    if not supplier or supplier.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")

    if not data.details:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La compra debe incluir al menos un producto")

    subtotal = Decimal("0")
    purchase = Purchase(
        tenant_id=current_user.tenant_id,
        supplier_id=data.supplier_id,
        user_id=current_user.id,
        invoice_number=data.invoice_number,
        tax=data.tax,
        notes=data.notes,
        subtotal=0,
        total=0,
    )
    session.add(purchase)
    session.flush()

    for detail_data in data.details:
        product = session.get(Product, detail_data.product_id)
        if not product or product.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado en el negocio")

        line_total = detail_data.unit_cost * Decimal(str(detail_data.quantity))
        subtotal += line_total
        previous_stock = product.stock
        product.stock += detail_data.quantity
        product.cost = detail_data.unit_cost
        session.add(product)

        session.add(
            PurchaseDetail(
                purchase_id=purchase.id,
                product_id=product.id,
                quantity=detail_data.quantity,
                unit_cost=detail_data.unit_cost,
                total_cost=line_total,
            )
        )

        session.add(
            InventoryMovement(
                tenant_id=current_user.tenant_id,
                product_id=product.id,
                user_id=current_user.id,
                movement_type="purchase_entry",
                quantity=detail_data.quantity,
                previous_stock=previous_stock,
                new_stock=product.stock,
                unit_cost=detail_data.unit_cost,
                reference_type="purchase",
                reference_id=purchase.id,
                notes=data.invoice_number or data.notes,
            )
        )

    purchase.subtotal = subtotal
    purchase.total = subtotal + data.tax
    session.add(purchase)
    session.commit()
    session.refresh(purchase)
    return purchase


@router.get("/movements")
def list_inventory_movements(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return session.exec(
        select(InventoryMovement)
        .where(InventoryMovement.tenant_id == current_user.tenant_id)
        .order_by(InventoryMovement.created_at.desc())
    ).all()
