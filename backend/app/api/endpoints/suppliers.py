from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
import uuid

from app.api.deps import get_current_user
from app.core.db import get_session
from app.models.supplier import Supplier, SupplierCreate, SupplierUpdate
from app.models.user import User
from app.models.purchase import Purchase

router = APIRouter()


@router.get("/")
def list_suppliers(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return session.exec(
        select(Supplier)
        .where(Supplier.tenant_id == current_user.tenant_id)
        .order_by(Supplier.name)
    ).all()


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_supplier(
    data: SupplierCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    supplier = Supplier(
        tenant_id=current_user.tenant_id,
        name=data.name.strip(),
        contact_name=data.contact_name,
        email=data.email,
        phone=data.phone,
        document_number=data.document_number,
        address=data.address,
        city=data.city,
        payment_terms_days=data.payment_terms_days,
        notes=data.notes,
    )
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier


@router.put("/{supplier_id}")
def update_supplier(
    supplier_id: uuid.UUID,
    data: SupplierUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    supplier = session.get(Supplier, supplier_id)
    if not supplier or supplier.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")

    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(supplier, key, value)

    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(
    supplier_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    supplier = session.get(Supplier, supplier_id)
    if not supplier or supplier.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")

    purchase_exists = session.exec(
        select(Purchase).where(Purchase.tenant_id == current_user.tenant_id, Purchase.supplier_id == supplier_id)
    ).first()
    if purchase_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes eliminar un proveedor con compras registradas"
        )

    session.delete(supplier)
    session.commit()
    return
