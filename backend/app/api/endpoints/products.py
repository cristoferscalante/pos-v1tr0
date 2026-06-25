from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
import uuid

from app.core.db import get_session
from app.api.deps import get_current_tenant_id, get_current_user
from app.models.product import Product, ProductCreate, ProductRead
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[ProductRead])
def get_products(
    session: Session = Depends(get_session),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id)
):
    # Retornar únicamente los productos que pertenecen al tenant actual
    products = session.exec(select(Product).where(Product.tenant_id == tenant_id)).all()
    return products

@router.post("/", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    data: ProductCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requieren permisos de administrador para crear productos"
        )
    tenant_id = current_user.tenant_id
    db_product = Product.model_validate(data)
    db_product.tenant_id = tenant_id
    
    session.add(db_product)
    session.commit()
    session.refresh(db_product)
    return db_product

@router.get("/{product_id}", response_model=ProductRead)
def get_product(
    product_id: uuid.UUID,
    session: Session = Depends(get_session),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id)
):
    # Buscar el producto y validar que pertenezca al tenant
    product = session.get(Product, product_id)
    if not product or product.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El producto no existe o no tiene permisos para acceder a él"
        )
    return product

@router.put("/{product_id}", response_model=ProductRead)
def update_product(
    product_id: uuid.UUID,
    data: ProductCreate, # Opcional: Se podría usar un esquema ProductUpdate
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requieren permisos de administrador para modificar productos"
        )
    tenant_id = current_user.tenant_id
    db_product = session.get(Product, product_id)
    if not db_product or db_product.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El producto no existe o no tiene permisos para modificarlo"
        )
    
    # Actualizar valores
    product_data = data.model_dump(exclude_unset=True)
    for key, value in product_data.items():
        if key != "tenant_id": # Impedir cambiar el tenant_id
            setattr(db_product, key, value)
            
    session.add(db_product)
    session.commit()
    session.refresh(db_product)
    return db_product

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requieren permisos de administrador para eliminar productos"
        )
    tenant_id = current_user.tenant_id
    db_product = session.get(Product, product_id)
    if not db_product or db_product.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El producto no existe o no tiene permisos para eliminarlo"
        )
    session.delete(db_product)
    session.commit()
    return

@router.get("/public/{slug}")
def get_public_catalog(
    slug: str,
    session: Session = Depends(get_session)
):
    from app.models.tenant import Tenant
    tenant = session.exec(select(Tenant).where(Tenant.slug == slug)).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El negocio no existe o el catálogo no está activo"
        )
    
    products = session.exec(select(Product).where(Product.tenant_id == tenant.id)).all()
    
    return {
        "tenant": {
            "name": tenant.name,
            "business_type": tenant.business_type,
            "slug": tenant.slug,
            "meta_data": tenant.meta_data
        },
        "products": products
    }
