import hashlib
import secrets
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.core.config import settings
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.services.mail import send_email
from app.services.notifications import _email_shell, _info_row


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_password_reset_token(session: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)

    active_tokens = session.exec(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
    ).all()
    for existing in active_tokens:
        existing.used_at = datetime.utcnow()
        session.add(existing)

    session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.utcnow() + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES),
        )
    )
    session.commit()
    return token


def send_password_reset_email(session: Session, user: User) -> tuple[bool, str]:
    token = create_password_reset_token(session, user)
    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/login?reset_token={token}"
    subject = f"[{settings.APP_NAME}] Recuperacion de contrasena"
    text = (
        "Recibimos una solicitud para restablecer tu contrasena.\n"
        f"Usa este enlace: {reset_url}\n"
        f"El enlace vence en {settings.PASSWORD_RESET_EXPIRE_MINUTES} minutos."
    )
    body = (
        "<div style=\"font-size:14px;color:#374151;line-height:1.7;margin-bottom:20px;\">"
        "Recibimos una solicitud para restablecer tu contraseña. Usa el botón o enlace de abajo para continuar."
        "</div>"
        "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse;margin-bottom:24px;\">"
        f"{_info_row('Cuenta', user.email)}"
        f"{_info_row('Validez', f'{settings.PASSWORD_RESET_EXPIRE_MINUTES} minutos')}"
        "</table>"
        f"<div style=\"margin:24px 0;\"><a href=\"{reset_url}\" style=\"display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:700;\">Restablecer contraseña</a></div>"
        f"<div style=\"font-size:12px;color:#6b7280;line-height:1.6;word-break:break-all;\">Si el botón no funciona, copia y pega este enlace en tu navegador:<br />{reset_url}</div>"
    )
    html = _email_shell(
        "Recuperación de contraseña",
        "Solicitud segura para restablecer el acceso a tu cuenta.",
        body,
        "Si no solicitaste este cambio, puedes ignorar este mensaje sin realizar ninguna acción.",
    )
    return send_email([user.email], subject, html, text)


def validate_password_reset_token(session: Session, token: str) -> PasswordResetToken | None:
    token_hash = _hash_token(token)
    reset_token = session.exec(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    ).first()
    if not reset_token:
        return None
    if reset_token.used_at is not None:
        return None
    if reset_token.expires_at < datetime.utcnow():
        return None
    return reset_token
