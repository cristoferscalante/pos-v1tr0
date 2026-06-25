import json
import smtplib
from typing import Iterable
from urllib import error, request
from email.message import EmailMessage

from app.core.config import settings


def _send_via_api(recipients: list[str], subject: str, html: str, text: str) -> tuple[bool, str]:
    if not settings.EMAIL_API_TOKEN or not settings.EMAIL_FROM_EMAIL:
        return False, "Falta configurar EMAIL_API_TOKEN o EMAIL_FROM_EMAIL"

    payload = {
        "sender": {
            "name": settings.EMAIL_FROM_NAME,
            "email": settings.EMAIL_FROM_EMAIL,
        },
        "to": [{"email": email} for email in recipients],
        "subject": subject,
        "htmlContent": html,
        "textContent": text,
    }

    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        settings.EMAIL_API_AUTH_HEADER: settings.EMAIL_API_TOKEN,
    }

    req = request.Request(settings.EMAIL_API_BASE_URL, data=body, headers=headers, method="POST")
    try:
        with request.urlopen(req, timeout=settings.EMAIL_TIMEOUT_SECONDS) as response:
            response.read()
        return True, "ok"
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        return False, f"HTTP {exc.code} [{settings.EMAIL_API_BASE_URL}] sender={settings.EMAIL_FROM_EMAIL} header={settings.EMAIL_API_AUTH_HEADER}: {detail}"
    except Exception as exc:  # pragma: no cover - red externa
        return False, str(exc)


def _send_via_smtp(recipients: list[str], subject: str, html: str, text: str) -> tuple[bool, str]:
    required_values = {
        "EMAIL_FROM_EMAIL": settings.EMAIL_FROM_EMAIL,
        "EMAIL_SMTP_HOST": settings.EMAIL_SMTP_HOST,
        "EMAIL_SMTP_USERNAME": settings.EMAIL_SMTP_USERNAME,
        "EMAIL_SMTP_PASSWORD": settings.EMAIL_SMTP_PASSWORD,
    }
    missing = [key for key, value in required_values.items() if not value]
    if missing:
        return False, f"Falta configurar: {', '.join(missing)}"

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_EMAIL}>"
    message["To"] = ", ".join(recipients)
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(settings.EMAIL_SMTP_HOST, settings.EMAIL_SMTP_PORT, timeout=settings.EMAIL_TIMEOUT_SECONDS) as smtp:
            if settings.EMAIL_SMTP_USE_TLS:
                smtp.starttls()
            smtp.login(settings.EMAIL_SMTP_USERNAME, settings.EMAIL_SMTP_PASSWORD)
            smtp.send_message(message)
        return True, "ok"
    except Exception as exc:  # pragma: no cover - depende de red externa
        return False, f"SMTP [{settings.EMAIL_SMTP_HOST}:{settings.EMAIL_SMTP_PORT}] user={settings.EMAIL_SMTP_USERNAME}: {exc}"


def send_email(recipients: Iterable[str], subject: str, html: str, text: str) -> tuple[bool, str]:
    recipient_list = [email.strip() for email in recipients if email and email.strip()]
    if not recipient_list:
        return False, "No hay destinatarios configurados"

    if not settings.EMAIL_ENABLED:
        return False, "El envio de correo esta deshabilitado"

    if settings.EMAIL_PROVIDER.lower() == "smtp":
        return _send_via_smtp(recipient_list, subject, html, text)

    return _send_via_api(recipient_list, subject, html, text)
