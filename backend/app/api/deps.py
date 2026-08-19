from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlmodel import Session
import uuid

from app.core.db import get_session
from app.core.security import JWT_SECRET, ALGORITHM
from app.models.tenant import Tenant
from app.models.user import User

# El endpoint para el login OAuth2
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login"
)

def get_current_user(
    session: Session = Depends(get_session),
    token: str = Depends(reusable_oauth2)
) -> User:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token no válido: falta identificador de usuario",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo validar las credenciales de acceso",
        )
    
    # Buscar el usuario en la base de datos
    user = session.get(User, uuid.UUID(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El usuario no existe en la base de datos"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario se encuentra inactivo"
        )
    return user

def get_current_tenant_id(
    session: Session = Depends(get_session),
    token: str = Depends(reusable_oauth2),
) -> uuid.UUID:
    # Antes esta dependencia solo decodificaba el JWT, sin tocar la base de datos:
    # un colaborador dado de baja o un negocio suspendido (tenant.is_active=False,
    # por ejemplo por falta de pago) seguían pudiendo leer/sincronizar ventas y
    # productos hasta que expirara el token (hasta 7 días), porque estos endpoints
    # usan get_current_tenant_id en vez de get_current_user. Ver hallazgo 5.6 del
    # plan de mejora. Ahora se valida usuario y tenant activos en cada request,
    # igual que ya hacía get_current_user.
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        tenant_id: str = payload.get("tenant_id")
        if tenant_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido: falta información del negocio (tenant)",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo validar las credenciales de acceso",
        )

    if user_id is not None:
        user = session.get(User, uuid.UUID(user_id))
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="El usuario se encuentra inactivo o ya no existe",
            )

    tenant_uuid = uuid.UUID(tenant_id)
    tenant = session.get(Tenant, tenant_uuid)
    if not tenant or not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El negocio se encuentra suspendido o inactivo",
        )

    return tenant_uuid
