from datetime import datetime, timedelta
from typing import Union, Any
from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

JWT_SECRET = settings.JWT_SECRET
ALGORITHM = "HS256"
# 24 horas. Antes eran 7 días "porque las cajas quedan abiertas", pero un token
# de 7 días guardado en localStorage es una ventana de exposición muy larga si el
# dispositivo se pierde/comparte o hay un XSS futuro (ver hallazgo 5.5 del plan de
# mejora). Con 24h + auto-logout en 401 en el frontend, la caja se reabre con un
# login diario y la exposición se acota a un día. Si un negocio necesita sesiones
# más largas, súbelo aquí de forma consciente en vez de dejar 7 días por defecto.
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 horas

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(subject: Union[str, Any], tenant_id: Any, role: str, is_superadmin: bool = False, expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),      # ID de usuario o email
        "tenant_id": str(tenant_id) if tenant_id else None,
        "role": role,
        "is_superadmin": is_superadmin
    }
    
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)
    return encoded_jwt
