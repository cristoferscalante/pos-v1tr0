from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
import uuid

from app.core.db import get_session, slugify
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.tenant import Tenant, TenantRead
from app.models.user import User, UserCreate, UserRead
from pydantic import BaseModel, EmailStr
from app.api.deps import get_current_user
from app.models.notification import NotificationRuleRead, NotificationRuleUpdate, NotificationTestRequest
from app.services.notifications import ensure_default_notification_rules, get_notification_rules, send_test_notification
from app.services.password_reset import send_password_reset_email, validate_password_reset_token
from datetime import datetime

router = APIRouter()

# Esquema de entrada para registro de negocio
class TenantRegister(BaseModel):
    business_name: str
    business_type: str = "retail"
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_tenant(data: TenantRegister, session: Session = Depends(get_session)):
    # 1. Verificar si el email ya existe
    existing_user = session.exec(select(User).where(User.email == data.email)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El correo electrónico ya se encuentra registrado"
        )
    
    # 2. Crear el Tenant (Negocio) con Slug auto-generado
    base_slug = slugify(data.business_name)
    slug = base_slug
    counter = 1
    while session.exec(select(Tenant).where(Tenant.slug == slug)).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    tenant = Tenant(name=data.business_name, business_type=data.business_type, slug=slug)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    
    # 3. Crear el primer Usuario Administrador
    hashed_pwd = get_password_hash(data.password)
    user = User(
        email=data.email,
        hashed_password=hashed_pwd,
        is_admin=True,
        role="admin",
        tenant_id=tenant.id
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    ensure_default_notification_rules(session, tenant.id, [user.email])
    
    # 4. Generar Token de Acceso inmediato
    token = create_access_token(subject=user.id, tenant_id=tenant.id, role=user.role)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "tenant_id": tenant.id,
            "business_name": tenant.name,
            "business_type": tenant.business_type,
            "slug": tenant.slug
        }
    }

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    # Buscar el usuario por email
    user = session.exec(select(User).where(User.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Correo electrónico o contraseña incorrectos"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario se encuentra inactivo"
        )
        
    # Obtener el negocio asociado
    tenant = session.get(Tenant, user.tenant_id)
    
    # Crear token
    token = create_access_token(subject=user.id, tenant_id=user.tenant_id, role=user.role)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "business_name": tenant.name if tenant else "N/A",
            "business_type": tenant.business_type if tenant else "retail",
            "slug": tenant.slug if tenant else None
        }
    }


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == data.email)).first()
    if user and user.is_active:
        try:
            send_password_reset_email(session, user)
        except Exception as exc:
            print(f"No se pudo enviar correo de recuperación a {data.email}: {exc}")

    return {
        "status": "ok",
        "message": "Si el correo existe, recibirás instrucciones para restablecer la contraseña"
    }


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, session: Session = Depends(get_session)):
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 8 caracteres",
        )

    reset_token = validate_password_reset_token(session, data.token)
    if not reset_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token de recuperación no es válido o ya venció",
        )

    user = session.get(User, reset_token.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    user.hashed_password = get_password_hash(data.new_password)
    reset_token.used_at = datetime.utcnow()
    session.add(user)
    session.add(reset_token)
    session.commit()
    return {"status": "ok", "message": "Contraseña actualizada correctamente"}

# Esquemas para Colaboradores y Configuración de Tenant
class TenantUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    whatsapp_number: Optional[str] = None
    display_name: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    brand_color: Optional[str] = None
    product_categories: Optional[List[str]] = None

class CollaboratorCreate(BaseModel):
    email: EmailStr
    password: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

@router.get("/tenant", response_model=TenantRead)
def get_tenant(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    tenant = session.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Negocio no encontrado"
        )
    return tenant

@router.put("/tenant", response_model=TenantRead)
def update_tenant(
    data: TenantUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operación permitida únicamente para administradores"
        )
    tenant = session.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Negocio no encontrado"
        )
    
    if data.name is not None and data.name.strip():
        tenant.name = data.name.strip()
        
    if data.slug is not None:
        new_slug = slugify(data.slug)
        if not new_slug:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El enlace del catálogo no puede ser vacío"
            )
        existing = session.exec(select(Tenant).where(Tenant.slug == new_slug, Tenant.id != tenant.id)).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El enlace del catálogo (slug) ya está en uso"
            )
        tenant.slug = new_slug
        
    if data.whatsapp_number is not None:
        meta = dict(tenant.meta_data or {})
        meta["whatsapp_number"] = data.whatsapp_number.strip()
        tenant.meta_data = meta

    if any(value is not None for value in [data.display_name, data.logo_url, data.banner_url, data.brand_color, data.product_categories]):
        meta = dict(tenant.meta_data or {})
        if data.display_name is not None:
            meta["display_name"] = data.display_name.strip()
        if data.logo_url is not None:
            meta["logo_url"] = data.logo_url.strip()
        if data.banner_url is not None:
            meta["banner_url"] = data.banner_url.strip()
        if data.brand_color is not None:
            meta["brand_color"] = data.brand_color.strip()
        if data.product_categories is not None:
            cleaned_categories = []
            seen_categories = set()
            for raw_category in data.product_categories:
                category = " ".join((raw_category or "").strip().split())
                if category and category.lower() not in seen_categories:
                    cleaned_categories.append(category)
                    seen_categories.add(category.lower())
            meta["product_categories"] = cleaned_categories
        tenant.meta_data = meta
        
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant

@router.get("/collaborators", response_model=List[UserRead])
def list_collaborators(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operación permitida únicamente para administradores"
        )
    collaborators = session.exec(
        select(User).where(User.tenant_id == current_user.tenant_id, User.id != current_user.id)
    ).all()
    return collaborators

@router.post("/collaborators", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_collaborator(
    data: CollaboratorCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operación permitida únicamente para administradores"
        )
    existing_user = session.exec(select(User).where(User.email == data.email)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El correo electrónico ya se encuentra registrado"
        )
    hashed_pwd = get_password_hash(data.password)
    new_user = User(
        email=data.email,
        hashed_password=hashed_pwd,
        is_active=True,
        is_admin=False,
        role="cashier",
        tenant_id=current_user.tenant_id
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return new_user

@router.delete("/collaborators/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collaborator(
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operación permitida únicamente para administradores"
        )
    user_to_delete = session.get(User, user_id)
    if not user_to_delete or user_to_delete.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El colaborador no existe en su negocio"
        )
    if user_to_delete.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar a sí mismo"
        )
    session.delete(user_to_delete)
    session.commit()
    return


@router.post("/change-password")
def change_password(
    data: PasswordChangeRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual es incorrecta",
        )

    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 8 caracteres",
        )

    current_user.hashed_password = get_password_hash(data.new_password)
    session.add(current_user)
    session.commit()
    return {"status": "ok"}


@router.get("/notifications", response_model=List[NotificationRuleRead])
def list_notification_rules(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operación permitida únicamente para administradores",
        )
    return get_notification_rules(session, current_user.tenant_id, [current_user.email])


@router.put("/notifications/{rule_id}", response_model=NotificationRuleRead)
def update_notification_rule(
    rule_id: uuid.UUID,
    data: NotificationRuleUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operación permitida únicamente para administradores",
        )

    from app.models.notification import NotificationRule

    rule = session.get(NotificationRule, rule_id)
    if not rule or rule.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regla no encontrada")

    if data.enabled is not None:
        rule.enabled = data.enabled
    if data.recipients is not None:
        rule.recipients = [email.strip() for email in data.recipients if email.strip()]
    if data.meta_data is not None:
        rule.meta_data = data.meta_data

    from datetime import datetime

    rule.updated_at = datetime.utcnow()
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule


@router.post("/notifications/test")
def test_notification_email(
    data: NotificationTestRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operación permitida únicamente para administradores",
        )

    success, message = send_test_notification(session, current_user.tenant_id, data.recipient)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    return {"status": "ok", "message": "Correo de prueba enviado"}
