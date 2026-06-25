from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional
import uuid

from sqlmodel import Field, Relationship, SQLModel


class PurchaseBase(SQLModel):
    tenant_id: uuid.UUID = Field(foreign_key="tenant.id", index=True)
    supplier_id: uuid.UUID = Field(foreign_key="supplier.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    invoice_number: Optional[str] = Field(default=None, index=True)
    subtotal: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    tax: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    total: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    paid_amount: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    balance_due: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    status: str = Field(default="posted", index=True)
    due_date: Optional[date] = Field(default=None, index=True)
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class Purchase(PurchaseBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)

    details: list["PurchaseDetail"] = Relationship(back_populates="purchase")


class PurchaseDetailBase(SQLModel):
    product_id: uuid.UUID = Field(foreign_key="product.id", index=True)
    quantity: float = Field(default=1.0)
    unit_cost: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    total_cost: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)


class PurchaseDetail(PurchaseDetailBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    purchase_id: uuid.UUID = Field(foreign_key="purchase.id", index=True)

    purchase: Optional[Purchase] = Relationship(back_populates="details")


class InventoryMovementBase(SQLModel):
    tenant_id: uuid.UUID = Field(foreign_key="tenant.id", index=True)
    product_id: uuid.UUID = Field(foreign_key="product.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    movement_type: str = Field(index=True)
    quantity: float = Field(default=0.0)
    previous_stock: float = Field(default=0.0)
    new_stock: float = Field(default=0.0)
    unit_cost: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    reference_type: Optional[str] = Field(default=None, index=True)
    reference_id: Optional[uuid.UUID] = Field(default=None, index=True)
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class InventoryMovement(InventoryMovementBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)


class PurchaseCreateDetail(SQLModel):
    product_id: uuid.UUID
    quantity: float
    unit_cost: Decimal


class PurchaseCreate(SQLModel):
    supplier_id: uuid.UUID
    invoice_number: Optional[str] = None
    tax: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    paid_amount: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    due_date: Optional[date] = None
    notes: Optional[str] = None
    details: list[PurchaseCreateDetail]


class PurchaseUpdate(SQLModel):
    invoice_number: Optional[str] = None
    tax: Optional[Decimal] = None
    paid_amount: Optional[Decimal] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    details: Optional[list[PurchaseCreateDetail]] = None


class PurchaseDetailRead(SQLModel):
    product_id: uuid.UUID
    name: str
    quantity: float
    unit_cost: Decimal
    total_cost: Decimal


class PurchaseReadDetailed(SQLModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    supplier_id: uuid.UUID
    supplier_name: str
    user_id: uuid.UUID
    invoice_number: Optional[str] = None
    subtotal: Decimal
    tax: Decimal
    total: Decimal
    paid_amount: Decimal
    balance_due: Decimal
    status: str
    due_date: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime
    details: list[PurchaseDetailRead]


class ManualInventoryMovementCreate(SQLModel):
    product_id: uuid.UUID
    movement_type: str
    quantity: float
    unit_cost: Optional[Decimal] = None
    notes: Optional[str] = None


class SupplierReturnCreate(SQLModel):
    supplier_id: uuid.UUID
    product_id: uuid.UUID
    quantity: float
    unit_cost: Optional[Decimal] = None
    notes: Optional[str] = None
