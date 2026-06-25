from typing import Optional
import uuid
from sqlmodel import SQLModel, Field

class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    is_active: bool = Field(default=True)
    is_admin: bool = Field(default=False)
    role: str = Field(default="cashier", description="cashier, manager, admin")
    tenant_id: uuid.UUID = Field(foreign_key="tenant.id", index=True)

class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    hashed_password: str

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: uuid.UUID
