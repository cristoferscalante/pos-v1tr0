from datetime import datetime
from typing import Optional
import uuid

from sqlmodel import Field, SQLModel


class SupplierBase(SQLModel):
    name: str = Field(index=True)
    contact_name: Optional[str] = None
    email: Optional[str] = Field(default=None, index=True)
    phone: Optional[str] = None
    document_number: Optional[str] = Field(default=None, index=True)
    address: Optional[str] = None
    city: Optional[str] = None
    payment_terms_days: int = Field(default=0)
    notes: Optional[str] = None
    tenant_id: uuid.UUID = Field(foreign_key="tenant.id", index=True)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Supplier(SupplierBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)


class SupplierCreate(SQLModel):
    name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    document_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    payment_terms_days: int = 0
    notes: Optional[str] = None


class SupplierUpdate(SQLModel):
    name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    document_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    payment_terms_days: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
