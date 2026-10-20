from typing import Optional, Dict, Any
import uuid
from sqlmodel import SQLModel, Field, Column, JSON
from datetime import datetime

class TenantBase(SQLModel):
    name: str = Field(index=True)
    slug: Optional[str] = Field(default=None, index=True, unique=True)
    business_type: str = Field(default="retail", description="tipo de negocio: veterinaria, restaurante, etc.")
    plan_name: str = Field(default="free", description="free, standard, premium")
    subscription_ends_at: Optional[datetime] = Field(default=None)
    has_electronic_billing: bool = Field(default=False)
    folios_remaining: int = Field(default=0)
    folios_total: int = Field(default=0)
    is_active: bool = Field(default=True)

    # Consecutivo interno para asignar sale_number de forma atómica en el
    # servidor (ver hallazgo 5.2 del plan de mejora: antes cada caja generaba su
    # propio número contando registros en el IndexedDB local del navegador, así
    # que dos cajas del mismo negocio podían producir el mismo sale_number).
    last_sale_seq: int = Field(default=0)

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


# Claves de tenant.meta_data que son credenciales del proveedor de facturación.
# Nunca salen del servidor: el front solo necesita saber si ya están configuradas.
TENANT_SECRET_META_FIELDS = ("factus_client_secret", "factus_password")
SECRET_MASK = "********"


def tenant_read_without_secrets(tenant: "Tenant") -> TenantRead:
    """TenantRead con los secretos de facturación enmascarados (sin tocar la fila)."""
    data = TenantRead.model_validate(tenant)
    meta = dict(tenant.meta_data or {}) if isinstance(tenant.meta_data, dict) else {}
    for key in TENANT_SECRET_META_FIELDS:
        if meta.get(key):
            meta[key] = SECRET_MASK
    data.meta_data = meta
    return data
