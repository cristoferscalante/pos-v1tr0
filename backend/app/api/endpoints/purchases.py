from decimal import Decimal
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user
from app.core.db import get_session
from app.models.product import Product
from app.models.purchase import InventoryMovement, ManualInventoryMovementCreate, Purchase, PurchaseCreate, PurchaseDetail, PurchaseUpdate, SupplierReturnCreate
from app.models.supplier import Supplier
from app.models.user import User

router = APIRouter()


def _create_inventory_movement(
    session: Session,
    *,
    tenant_id,
    product_id,
    user_id,
    movement_type: str,
    quantity: float,
    previous_stock: float,
    new_stock: float,
    unit_cost=None,
    reference_type=None,
    reference_id=None,
    notes=None,
):
    session.add(
        InventoryMovement(
            tenant_id=tenant_id,
            product_id=product_id,
            user_id=user_id,
            movement_type=movement_type,
            quantity=quantity,
            previous_stock=previous_stock,
            new_stock=new_stock,
            unit_cost=unit_cost,
            reference_type=reference_type,
            reference_id=reference_id,
            notes=notes,
        )
    )


def _apply_purchase_lines(session: Session, purchase: Purchase, details, current_user: User, notes: str | None):
    subtotal = Decimal("0")
    for detail_data in details:
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

        _create_inventory_movement(
            session,
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
            notes=notes,
        )
    return subtotal


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


@router.get("/{purchase_id}")
def get_purchase(
    purchase_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    purchase = session.get(Purchase, purchase_id)
    if not purchase or purchase.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compra no encontrada")
    return purchase


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
        paid_amount=data.paid_amount,
        balance_due=0,
        notes=data.notes,
        subtotal=0,
        total=0,
    )
    session.add(purchase)
    session.flush()

    subtotal = _apply_purchase_lines(session, purchase, data.details, current_user, data.invoice_number or data.notes)

    purchase.subtotal = subtotal
    purchase.total = subtotal + data.tax
    purchase.balance_due = purchase.total - data.paid_amount
    session.add(purchase)
    session.commit()
    session.refresh(purchase)
    return purchase


@router.put("/{purchase_id}")
def update_purchase(
    purchase_id: uuid.UUID,
    data: PurchaseUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    purchase = session.get(Purchase, purchase_id)
    if not purchase or purchase.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compra no encontrada")
    if purchase.status != "posted":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo se pueden editar compras activas")

    if data.invoice_number is not None:
        purchase.invoice_number = data.invoice_number
    if data.tax is not None:
        purchase.tax = data.tax
    if data.paid_amount is not None:
        purchase.paid_amount = data.paid_amount
    if data.notes is not None:
        purchase.notes = data.notes

    purchase.balance_due = purchase.total - purchase.paid_amount
    session.add(purchase)
    session.commit()
    session.refresh(purchase)
    return purchase


@router.post("/{purchase_id}/cancel")
def cancel_purchase(
    purchase_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    purchase = session.get(Purchase, purchase_id)
    if not purchase or purchase.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compra no encontrada")
    if purchase.status != "posted":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La compra ya fue anulada")

    details = session.exec(select(PurchaseDetail).where(PurchaseDetail.purchase_id == purchase.id)).all()
    for detail in details:
        product = session.get(Product, detail.product_id)
        if product and product.tenant_id == current_user.tenant_id:
            previous_stock = product.stock
            product.stock = max(0, product.stock - detail.quantity)
            session.add(product)
            _create_inventory_movement(
                session,
                tenant_id=current_user.tenant_id,
                product_id=product.id,
                user_id=current_user.id,
                movement_type="purchase_cancel",
                quantity=-detail.quantity,
                previous_stock=previous_stock,
                new_stock=product.stock,
                unit_cost=detail.unit_cost,
                reference_type="purchase",
                reference_id=purchase.id,
                notes="Anulación de compra",
            )

    purchase.status = "cancelled"
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


@router.get("/products/{product_id}/kardex")
def get_product_kardex(
    product_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    product = session.get(Product, product_id)
    if not product or product.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")

    return session.exec(
        select(InventoryMovement)
        .where(
            InventoryMovement.tenant_id == current_user.tenant_id,
            InventoryMovement.product_id == product_id,
        )
        .order_by(InventoryMovement.created_at.desc())
    ).all()


@router.post("/movements/manual", status_code=status.HTTP_201_CREATED)
def create_manual_inventory_movement(
    data: ManualInventoryMovementCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    product = session.get(Product, data.product_id)
    if not product or product.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")

    if data.quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La cantidad debe ser mayor a 0")

    allowed_types = {"adjustment_in", "adjustment_out", "waste"}
    if data.movement_type not in allowed_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de movimiento no soportado")

    previous_stock = product.stock
    signed_qty = data.quantity if data.movement_type == "adjustment_in" else -data.quantity
    product.stock = max(0, product.stock + signed_qty)
    if data.unit_cost is not None:
        product.cost = data.unit_cost
    session.add(product)

    _create_inventory_movement(
        session,
        tenant_id=current_user.tenant_id,
        product_id=product.id,
        user_id=current_user.id,
        movement_type=data.movement_type,
        quantity=signed_qty,
        previous_stock=previous_stock,
        new_stock=product.stock,
        unit_cost=data.unit_cost,
        reference_type="manual",
        notes=data.notes,
    )

    session.commit()
    session.refresh(product)
    return product


@router.post("/returns", status_code=status.HTTP_201_CREATED)
def create_supplier_return(
    data: SupplierReturnCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    supplier = session.get(Supplier, data.supplier_id)
    if not supplier or supplier.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")

    product = session.get(Product, data.product_id)
    if not product or product.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")

    if data.quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La cantidad debe ser mayor a 0")

    previous_stock = product.stock
    product.stock = max(0, product.stock - data.quantity)
    session.add(product)

    _create_inventory_movement(
        session,
        tenant_id=current_user.tenant_id,
        product_id=product.id,
        user_id=current_user.id,
        movement_type="supplier_return",
        quantity=-data.quantity,
        previous_stock=previous_stock,
        new_stock=product.stock,
        unit_cost=data.unit_cost,
        reference_type="supplier",
        reference_id=supplier.id,
        notes=data.notes,
    )

    session.commit()
    session.refresh(product)
    return product
