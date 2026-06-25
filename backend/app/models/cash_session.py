from datetime import datetime
from decimal import Decimal
from typing import Optional
import uuid

from sqlmodel import Field, SQLModel


class CashSessionBase(SQLModel):
    tenant_id: uuid.UUID = Field(foreign_key="tenant.id", index=True)
    opened_by_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    closed_by_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id", index=True)
    opening_amount: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    expected_closing_amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    actual_closing_amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    notes: Optional[str] = None
    status: str = Field(default="open", index=True)
    opened_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    closed_at: Optional[datetime] = Field(default=None, index=True)


class CashSession(CashSessionBase, table=True):
    __tablename__ = "cash_session"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)


class CashSessionRead(CashSessionBase):
    id: uuid.UUID


class CashSessionOpen(SQLModel):
    opening_amount: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    notes: Optional[str] = None


class CashSessionClose(SQLModel):
    actual_closing_amount: Decimal = Field(default=0.0, max_digits=12, decimal_places=2)
    notes: Optional[str] = None
