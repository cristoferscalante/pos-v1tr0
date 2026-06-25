from datetime import datetime
from typing import Any, Iterable
import uuid

from sqlmodel import Session, select

from app.core.config import settings
from app.models.notification import NotificationLog, NotificationRule
from app.models.sale import Sale
from app.models.tenant import Tenant
from app.services.mail import send_email


DEFAULT_NOTIFICATION_RULES = {
    "sale_created": False,
    "cash_opened": False,
    "cash_closed": True,
    "low_stock_alert": True,
    "daily_summary": False,
}


def _format_currency(value: Any) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    return f"${amount:,.2f}"


def _info_row(label: str, value: str) -> str:
    return (
        "<tr>"
        f"<td style=\"padding:10px 0;color:#6b7280;font-size:13px;\">{label}</td>"
        f"<td style=\"padding:10px 0;color:#111827;font-size:13px;font-weight:600;text-align:right;\">{value}</td>"
        "</tr>"
    )


def _email_shell(title: str, subtitle: str, body_html: str, footer: str) -> str:
    return f"""
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 18px 40px rgba(15,23,42,0.10);">
            <tr>
              <td style="padding:28px 32px 18px 32px;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;">
                <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">V1TR0 POS</div>
                <div style="font-size:28px;line-height:1.15;font-weight:700;margin-top:10px;">{title}</div>
                <div style="font-size:14px;line-height:1.5;opacity:0.92;margin-top:10px;">{subtitle}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                {body_html}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 28px 32px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
                {footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list | tuple | set):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if hasattr(value, "model_dump"):
        return _json_safe(value.model_dump())
    if hasattr(value, "__dict__"):
        return {
            key: _json_safe(item)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    return str(value)


def ensure_default_notification_rules(
    session: Session,
    tenant_id: uuid.UUID,
    fallback_recipients: list[str] | None = None,
) -> list[NotificationRule]:
    existing_rules = session.exec(
        select(NotificationRule).where(NotificationRule.tenant_id == tenant_id)
    ).all()
    by_event = {rule.event_type: rule for rule in existing_rules}

    created = False
    for event_type, enabled in DEFAULT_NOTIFICATION_RULES.items():
        if event_type not in by_event:
            rule = NotificationRule(
                tenant_id=tenant_id,
                event_type=event_type,
                enabled=enabled,
                recipients=fallback_recipients or settings.default_notification_recipients,
                meta_data={},
            )
            session.add(rule)
            existing_rules.append(rule)
            created = True

    if created:
        session.commit()
        for rule in existing_rules:
            session.refresh(rule)

    return existing_rules


def get_notification_rules(
    session: Session,
    tenant_id: uuid.UUID,
    fallback_recipients: list[str] | None = None,
) -> list[NotificationRule]:
    rules = ensure_default_notification_rules(session, tenant_id, fallback_recipients)
    return sorted(rules, key=lambda rule: rule.event_type)


def render_notification(event_type: str, context: dict[str, Any]) -> tuple[str, str, str]:
    tenant_name = context.get("tenant_name", "Tu negocio")
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    if event_type == "sale_created":
        sale = context["sale"]
        subject = f"[{tenant_name}] Venta registrada {sale.sale_number}"
        text = (
            f"Se registro la venta {sale.sale_number}.\n"
            f"Total: {_format_currency(sale.total)}\n"
            f"Metodo de pago: {sale.payment_method}\n"
            f"Fecha: {sale.created_at.isoformat()}\n"
        )
        body = (
            "<div style=\"font-size:14px;color:#374151;line-height:1.7;margin-bottom:20px;\">"
            f"Se ha registrado una nueva venta para <strong>{tenant_name}</strong>."
            "</div>"
            "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse;\">"
            f"{_info_row('Negocio', tenant_name)}"
            f"{_info_row('Venta', sale.sale_number)}"
            f"{_info_row('Total', _format_currency(sale.total))}"
            f"{_info_row('Metodo', sale.payment_method)}"
            f"{_info_row('Fecha', sale.created_at.strftime('%Y-%m-%d %H:%M'))}"
            "</table>"
        )
        html = _email_shell(
            "Venta registrada",
            "Resumen simple de una venta confirmada en el sistema.",
            body,
            "Este correo fue generado automaticamente por el sistema POS.",
        )
        return subject, text, html

    if event_type == "cash_opened":
        cash_session = context["cash_session"]
        subject = f"[{tenant_name}] Caja abierta"
        text = (
            f"Se abrio una caja en {tenant_name}.\n"
            f"Monto inicial: {_format_currency(cash_session.opening_amount)}\n"
            f"Fecha: {cash_session.opened_at.isoformat()}\n"
        )
        body = (
            "<div style=\"font-size:14px;color:#374151;line-height:1.7;margin-bottom:20px;\">"
            f"Se abrio una caja para <strong>{tenant_name}</strong>."
            "</div>"
            "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse;\">"
            f"{_info_row('Negocio', tenant_name)}"
            f"{_info_row('Monto inicial', _format_currency(cash_session.opening_amount))}"
            f"{_info_row('Fecha', cash_session.opened_at.strftime('%Y-%m-%d %H:%M'))}"
            "</table>"
        )
        html = _email_shell(
            "Caja abierta",
            "Control de apertura de caja del negocio.",
            body,
            "Revision sugerida: valida el monto base y el usuario que abrio caja.",
        )
        return subject, text, html

    if event_type == "cash_closed":
        cash_session = context["cash_session"]
        subject = f"[{tenant_name}] Cierre de caja"
        text = (
            f"Se cerro una caja en {tenant_name}.\n"
            f"Monto esperado: {_format_currency(context.get('expected_amount', 0))}\n"
            f"Monto declarado: {_format_currency(cash_session.actual_closing_amount or 0)}\n"
            f"Ventas asociadas: {context.get('sales_count', 0)}\n"
        )
        body = (
            "<div style=\"font-size:14px;color:#374151;line-height:1.7;margin-bottom:20px;\">"
            f"Se ha cerrado una caja en <strong>{tenant_name}</strong>."
            "</div>"
            "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse;\">"
            f"{_info_row('Negocio', tenant_name)}"
            f"{_info_row('Monto esperado', _format_currency(context.get('expected_amount', 0)))}"
            f"{_info_row('Monto declarado', _format_currency(cash_session.actual_closing_amount or 0))}"
            f"{_info_row('Ventas asociadas', str(context.get('sales_count', 0)))}"
            "</table>"
        )
        html = _email_shell(
            "Cierre de caja",
            "Resumen del cierre y diferencias declaradas.",
            body,
            "Si hay diferencias, compara el cierre con movimientos y ventas del turno.",
        )
        return subject, text, html

    if event_type == "low_stock_alert":
        products = context.get("products", [])
        lines = [f"- {product['name']}: {product['stock']}" for product in products]
        subject = f"[{tenant_name}] Alerta de stock bajo"
        text = "Productos con stock bajo:\n" + "\n".join(lines)
        items = "".join(
            f"<tr><td style=\"padding:10px 0;color:#111827;font-size:13px;font-weight:600;\">{product['name']}</td><td style=\"padding:10px 0;color:#b45309;font-size:13px;font-weight:700;text-align:right;\">{product['stock']}</td></tr>"
            for product in products
        )
        body = (
            "<div style=\"font-size:14px;color:#374151;line-height:1.7;margin-bottom:20px;\">"
            f"Estos productos de <strong>{tenant_name}</strong> requieren reposicion."
            "</div>"
            f"<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse;\">{items}</table>"
        )
        html = _email_shell(
            "Stock bajo",
            "Aviso preventivo para evitar quiebres de inventario.",
            body,
            "Recomendacion: revisa compras pendientes y proveedores activos.",
        )
        return subject, text, html

    if event_type == "daily_summary":
        summary = context.get("summary", {})
        subject = f"[{tenant_name}] Resumen diario"
        text = (
            f"Ventas del dia: {summary.get('sales_count', 0)}\n"
            f"Ingresos: {_format_currency(summary.get('revenue', 0))}\n"
            f"Ganancia: {_format_currency(summary.get('profit', 0))}"
        )
        body = (
            "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse;\">"
            f"{_info_row('Ventas del dia', str(summary.get('sales_count', 0)))}"
            f"{_info_row('Ingresos', _format_currency(summary.get('revenue', 0)))}"
            f"{_info_row('Ganancia', _format_currency(summary.get('profit', 0)))}"
            "</table>"
        )
        html = _email_shell(
            "Resumen diario",
            f"Cierre ejecutivo del dia para {tenant_name}.",
            body,
            "Este resumen se genera automaticamente segun la configuracion de notificaciones.",
        )
        return subject, text, html

    subject = f"[{tenant_name}] Notificacion del sistema"
    text = f"Notificacion generica enviada el {now}"
    html = _email_shell(
        "Notificacion del sistema",
        "Mensaje automatico generado por el sistema POS.",
        f"<div style=\"font-size:14px;color:#374151;line-height:1.7;\">Notificacion generica enviada el {now}</div>",
        "V1TR0 POS",
    )
    return subject, text, html


def _log_notification(
    session: Session,
    tenant_id: uuid.UUID,
    event_type: str,
    recipient: str,
    subject: str,
    status: str,
    payload: dict[str, Any],
    error_message: str | None = None,
) -> None:
    session.add(
        NotificationLog(
            tenant_id=tenant_id,
            event_type=event_type,
            recipient=recipient,
            subject=subject,
            status=status,
            error_message=error_message,
            payload=_json_safe(payload),
        )
    )


def notify_event(session: Session, tenant_id: uuid.UUID, event_type: str, context: dict[str, Any]) -> None:
    rules = get_notification_rules(session, tenant_id)
    rule = next((item for item in rules if item.event_type == event_type), None)
    if not rule or not rule.enabled:
        return

    recipients = [email for email in rule.recipients or [] if email]
    if not recipients:
        return

    tenant = session.get(Tenant, tenant_id)
    subject, text, html = render_notification(
        event_type,
        {
            **context,
            "tenant_name": tenant.name if tenant else "Tu negocio",
        },
    )

    success, message = send_email(recipients, subject, html, text)
    status = "sent" if success else "failed"
    for recipient in recipients:
        _log_notification(
            session,
            tenant_id=tenant_id,
            event_type=event_type,
            recipient=recipient,
            subject=subject,
            status=status,
            payload={"context": _json_safe(context)},
            error_message=None if success else message,
        )
    session.commit()


def send_test_notification(session: Session, tenant_id: uuid.UUID, recipient: str) -> tuple[bool, str]:
    subject, text, html = render_notification("test", {"tenant_name": settings.APP_NAME})
    success, message = send_email([recipient], subject, html, text)
    _log_notification(
        session,
        tenant_id=tenant_id,
        event_type="test_email",
        recipient=recipient,
        subject=subject,
        status="sent" if success else "failed",
        payload={"source": "manual_test"},
        error_message=None if success else message,
    )
    session.commit()
    return success, message


def notify_sale_created(session: Session, sale: Sale) -> None:
    notify_event(session, sale.tenant_id, "sale_created", {"sale": sale})


def notify_low_stock(session: Session, tenant_id: uuid.UUID, products: Iterable[dict[str, Any]]) -> None:
    product_list = list(products)
    if not product_list:
        return
    notify_event(session, tenant_id, "low_stock_alert", {"products": product_list})


def notify_daily_summary(session: Session, tenant_id: uuid.UUID, summary: dict[str, Any]) -> None:
    notify_event(session, tenant_id, "daily_summary", {"summary": summary})
