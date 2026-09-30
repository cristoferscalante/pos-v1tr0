from typing import List, Optional
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
    barcode: Optional[str] = None,
    include_archived: bool = False,
    session: Session = Depends(get_session),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id)
):
    query = select(Product).where(Product.tenant_id == tenant_id)
    if not include_archived:
        query = query.where(Product.is_archived == False)
    if barcode:
        query = query.where(Product.barcode == barcode)
    
    products = session.exec(query).all()
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
    product_data = data.model_dump(exclude_unset=True)
    requested_id = product_data.pop("id", None)
    db_product = Product.model_validate(product_data)
    if requested_id is not None:
        db_product.id = requested_id
    db_product.tenant_id = tenant_id

    existing_product = session.get(Product, db_product.id)
    if existing_product:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un producto con ese identificador"
        )
     
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
    
    # Actualizar valores.
    # "stock" se excluye deliberadamente: el stock de un producto ya existente
    # solo debe cambiar a través de una venta, una compra o un movimiento manual
    # de inventario (endpoints de purchases.py), que además dejan un registro en
    # InventoryMovement. Permitir que el formulario de edición de producto
    # sobrescriba el stock aquí puede revertir en silencio el efecto de una venta
    # concurrente (ver hallazgo 5.4 del plan de mejora).
    FIELDS_NOT_EDITABLE_HERE = {"tenant_id", "stock"}
    product_data = data.model_dump(exclude_unset=True)
    for key, value in product_data.items():
        if key not in FIELDS_NOT_EDITABLE_HERE:
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
    # Verificar si tiene historial en ventas (FK saledetail → product)
    from sqlalchemy import text as sa_text
    has_sales = session.connection().execute(
        sa_text("SELECT 1 FROM saledetail WHERE product_id = :pid LIMIT 1"),
        {"pid": str(product_id)}
    ).first()

    if has_sales:
        # Soft delete: archiva el producto para preservar el historial de ventas
        db_product.is_archived = True
        session.add(db_product)
        session.commit()
    else:
        # Sin ventas: borra físicamente
        session.delete(db_product)
        session.commit()
    return


# Campos de tenant.meta_data que son seguros para exponer sin autenticación en el
# catálogo público (los usa PublicCatalogView.tsx para pintar la tienda). Cualquier
# otro campo (en particular electronic_invoicing_* / factus_* con las credenciales
# del proveedor de facturación electrónica) NUNCA debe salir por este endpoint.
# Ver hallazgo crítico 3.2 del plan de mejora: este endpoint filtraba tenant.meta_data
# completo, incluidas las credenciales de Factus en texto plano, sin ningún login.
_PUBLIC_TENANT_META_FIELDS = {
    "display_name",
    "whatsapp_number",
    "brand_color",
    "banner_url",
    "logo_url",
    "product_categories",
}

# Umbral de "últimas unidades" en el catálogo público (el mismo que usa el POS).
_PUBLIC_LOW_STOCK = 5


def _public_availability(stock) -> dict:
    """Disponibilidad para el catálogo público sin exponer el inventario exacto:
    solo se muestra la cantidad cuando quedan pocas unidades."""
    qty = float(stock or 0)
    if qty <= 0:
        return {"availability": "out", "stock_left": None}
    if qty <= _PUBLIC_LOW_STOCK:
        return {"availability": "low", "stock_left": int(qty)}
    return {"availability": "available", "stock_left": None}


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

    products = session.exec(select(Product).where(Product.tenant_id == tenant.id, Product.is_archived == False)).all()

    safe_meta = {
        key: value
        for key, value in (tenant.meta_data or {}).items()
        if key in _PUBLIC_TENANT_META_FIELDS
    }
    # Los precios por mayor solo salen si el negocio los habilitó en Configuración;
    # si no, el catálogo es solo detal y el precio por mayor ni se envía.
    wholesale_enabled = bool((tenant.meta_data or {}).get("catalog_wholesale_enabled"))

    return {
        "tenant": {
            "name": tenant.name,
            "business_type": tenant.business_type,
            "slug": tenant.slug,
            "meta_data": safe_meta,
            "wholesale_enabled": wholesale_enabled,
        },
        "products": [
            {
                "id": product.id,
                "name": product.name,
                "sku": product.sku,
                "barcode": product.barcode,
                "price": product.price,
                "wholesale_price": product.wholesale_price if wholesale_enabled else None,
                "image": product.image,
                "meta_data": product.meta_data,
                **_public_availability(product.stock),
                # Deliberadamente NO se incluye "cost" (costo de compra, dato
                # sensible del margen del negocio) ni ningún otro campo interno.
            }
            for product in products
        ],
    }
