from typing import Optional, Dict, Any, List
import uuid
from decimal import Decimal
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Relationship, JSON

class SaleBase(SQLModel):
    sale_number: str = Field(index=True)
    subtotal: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    tax: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    total: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    payment_method: str = Field(default="cash", description="cash, card, transfer")
    tenant_id: uuid.UUID = Field(foreign_key="tenant.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    cash_session_id: Optional[uuid.UUID] = Field(default=None, foreign_key="cash_session.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Metadatos dinámicos para datos DIAN (CUFE, firma, JSON de envío) o detalles del restaurante (mesa, etc.)
    meta_data: Any = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default='{}')
    )

class Sale(SaleBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    
    details: List["SaleDetail"] = Relationship(back_populates="sale")

class SaleDetailBase(SQLModel):
    product_id: uuid.UUID = Field(foreign_key="product.id", index=True)
    quantity: float = Field(default=1.0)
    price: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    total: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)

class SaleDetail(SaleDetailBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    sale_id: uuid.UUID = Field(foreign_key="sale.id", index=True)
    
    sale: Optional[Sale] = Relationship(back_populates="details")

class SaleDetailRead(SQLModel):
    product_id: uuid.UUID
    name: str = "Desconocido"
    quantity: float
    price: Decimal
    total: Decimal

class SaleReadWithDetails(SaleBase):
    id: uuid.UUID
    details: List[SaleDetailRead] = []
