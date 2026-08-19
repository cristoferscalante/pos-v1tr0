from typing import Optional, Dict, Any
import uuid
from decimal import Decimal
from sqlmodel import SQLModel, Field, Column, JSON

class ProductBase(SQLModel):
    name: str = Field(index=True)
    sku: Optional[str] = Field(default=None, index=True)
    barcode: Optional[str] = Field(default=None, index=True)
    # ge=0: antes no había ninguna validación de negativos, se podía crear/editar
    # un producto con precio, costo o stock negativo vía POST/PUT. Ver hallazgo
    # medio "sin validaciones de negativos" del plan de mejora.
    price: Decimal = Field(default=0.0, max_digits=12, decimal_places=2, ge=0)
    cost: Decimal = Field(default=0.0, max_digits=12, decimal_places=2, ge=0)
    stock: float = Field(default=0.0)
    tenant_id: Optional[uuid.UUID] = Field(default=None, foreign_key="tenant.id", index=True)
    image: Optional[str] = Field(default=None)
    tax_rate: Decimal = Field(default=19.0, max_digits=5, decimal_places=2, ge=0)
    
    # Metadatos dinámicos JSON para tipos de negocio (ej. veterinaria: lote/vencimiento, restaurante: ingredientes/receta)
    meta_data: Any = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default='{}')
    )
    is_archived: bool = Field(default=False, index=True)

class Product(ProductBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)

class ProductCreate(ProductBase):
    id: Optional[uuid.UUID] = None

class ProductRead(ProductBase):
    id: uuid.UUID
