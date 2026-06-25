import json
from typing import Iterable
from urllib import error, request

from app.core.config import settings


def send_email(recipients: Iterable[str], subject: str, html: str, text: str) -> tuple[bool, str]:
    recipient_list = [email.strip() for email in recipients if email and email.strip()]
    if not recipient_list:
        return False, "No hay destinatarios configurados"

    if not settings.EMAIL_ENABLED:
        return False, "El envio de correo esta deshabilitado"

    if not settings.EMAIL_API_TOKEN or not settings.EMAIL_FROM_EMAIL:
        return False, "Falta configurar EMAIL_API_TOKEN o EMAIL_FROM_EMAIL"

    payload = {
        "sender": {
            "name": settings.EMAIL_FROM_NAME,
            "email": settings.EMAIL_FROM_EMAIL,
        },
        "to": [{"email": email} for email in recipient_list],
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
