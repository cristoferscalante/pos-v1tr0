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
            f"Total: ${float(sale.total):,.2f}\n"
            f"Metodo de pago: {sale.payment_method}\n"
            f"Fecha: {sale.created_at.isoformat()}\n"
        )
        html = (
            f"<h2>Venta registrada</h2>"
            f"<p><strong>Negocio:</strong> {tenant_name}</p>"
            f"<p><strong>Venta:</strong> {sale.sale_number}</p>"
            f"<p><strong>Total:</strong> ${float(sale.total):,.2f}</p>"
            f"<p><strong>Metodo:</strong> {sale.payment_method}</p>"
            f"<p><strong>Fecha:</strong> {sale.created_at.isoformat()}</p>"
        )
        return subject, text, html

    if event_type == "cash_opened":
        cash_session = context["cash_session"]
        subject = f"[{tenant_name}] Caja abierta"
        text = (
            f"Se abrio una caja en {tenant_name}.\n"
            f"Monto inicial: ${float(cash_session.opening_amount):,.2f}\n"
            f"Fecha: {cash_session.opened_at.isoformat()}\n"
        )
        html = (
            f"<h2>Caja abierta</h2>"
            f"<p><strong>Negocio:</strong> {tenant_name}</p>"
            f"<p><strong>Monto inicial:</strong> ${float(cash_session.opening_amount):,.2f}</p>"
            f"<p><strong>Fecha:</strong> {cash_session.opened_at.isoformat()}</p>"
        )
        return subject, text, html

    if event_type == "cash_closed":
        cash_session = context["cash_session"]
        subject = f"[{tenant_name}] Cierre de caja"
        text = (
            f"Se cerro una caja en {tenant_name}.\n"
            f"Monto esperado: ${float(context.get('expected_amount', 0)) :,.2f}\n"
            f"Monto declarado: ${float(cash_session.actual_closing_amount or 0):,.2f}\n"
            f"Ventas asociadas: {context.get('sales_count', 0)}\n"
        )
        html = (
            f"<h2>Cierre de caja</h2>"
            f"<p><strong>Negocio:</strong> {tenant_name}</p>"
            f"<p><strong>Monto esperado:</strong> ${float(context.get('expected_amount', 0)) :,.2f}</p>"
            f"<p><strong>Monto declarado:</strong> ${float(cash_session.actual_closing_amount or 0):,.2f}</p>"
            f"<p><strong>Ventas asociadas:</strong> {context.get('sales_count', 0)}</p>"
        )
        return subject, text, html

    if event_type == "low_stock_alert":
        products = context.get("products", [])
        lines = [f"- {product['name']}: {product['stock']}" for product in products]
        subject = f"[{tenant_name}] Alerta de stock bajo"
        text = "Productos con stock bajo:\n" + "\n".join(lines)
        html = "<h2>Alerta de stock bajo</h2><ul>" + "".join(
            f"<li>{product['name']}: {product['stock']}</li>" for product in products
        ) + "</ul>"
        return subject, text, html

    if event_type == "daily_summary":
        summary = context.get("summary", {})
        subject = f"[{tenant_name}] Resumen diario"
        text = (
            f"Ventas del dia: {summary.get('sales_count', 0)}\n"
            f"Ingresos: ${float(summary.get('revenue', 0)):,.2f}\n"
            f"Ganancia: ${float(summary.get('profit', 0)):,.2f}"
        )
        html = (
            "<h2>Resumen diario</h2>"
            f"<p><strong>Ventas del dia:</strong> {summary.get('sales_count', 0)}</p>"
            f"<p><strong>Ingresos:</strong> ${float(summary.get('revenue', 0)):,.2f}</p>"
            f"<p><strong>Ganancia:</strong> ${float(summary.get('profit', 0)):,.2f}</p>"
        )
        return subject, text, html

    subject = f"[{tenant_name}] Notificacion del sistema"
    text = f"Notificacion generica enviada el {now}"
    html = f"<p>Notificacion generica enviada el {now}</p>"
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
