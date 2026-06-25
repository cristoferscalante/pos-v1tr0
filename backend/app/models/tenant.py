from typing import Optional, Dict, Any
import uuid
from sqlmodel import SQLModel, Field, Column, JSON

class TenantBase(SQLModel):
    name: str = Field(index=True)
    slug: Optional[str] = Field(default=None, index=True, unique=True)
    business_type: str = Field(default="retail", description="tipo de negocio: veterinaria, restaurante, etc.")
    
    # Campo JSON para guardar información dinámica y configurable por tipo de negocio
    meta_data: Any = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default='{}')
    )

class Tenant(TenantBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)

class TenantCreate(TenantBase):
    pass

class TenantRead(TenantBase):
    id: uuid.UUID
