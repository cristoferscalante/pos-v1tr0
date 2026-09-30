"""Recibo digital de una venta, enviado por correo.

Sale desde la cuenta de correo de la plataforma, pero se presenta como del
negocio que vendió: remitente con el nombre del negocio, Reply-To al correo del
negocio y el contenido con su nombre, color y logo. Nada del recibo menciona a
otro negocio; los datos se toman siempre del tenant de la venta.
"""
from datetime import datetime, timedelta, timezone
from html import escape
import re

from sqlmodel import Session, select

from app.core.config import settings
from app.models.notification import NotificationLog
from app.models.product import Product
from app.models.sale import Sale
from app.models.tenant import Tenant
from app.models.user import User
from app.services.mail import send_email

RECEIPT_EVENT = "sale_receipt"
MAX_SENDS_PER_SALE = 5
PAYMENT_LABELS = {"cash": "Efectivo", "card": "Tarjeta", "transfer": "Transferencia"}
_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def _money(value) -> str:
    amount = round(float(value or 0))
    return "$" + f"{amount:,}".replace(",", ".")


def business_identity(session: Session, tenant: Tenant) -> dict:
    meta = dict(tenant.meta_data or {})
    name = (meta.get("display_name") or tenant.name or "Tu negocio").strip()
    color = meta.get("brand_color") if _HEX_COLOR.match(str(meta.get("brand_color") or "")) else "#4f46e5"
    # Solo logos con URL pública: los data URL (base64) los bloquean Gmail y Outlook
    logo = meta.get("logo_url") if str(meta.get("logo_url") or "").startswith("https://") else None
    reply_to = (meta.get("receipt_reply_to_email") or "").strip()
    if not reply_to:
        admin = session.exec(
            select(User).where(User.tenant_id == tenant.id, User.role == "admin", User.is_active == True)  # noqa: E712
        ).first()
        reply_to = admin.email if admin else None
    text = lambda key: (str(meta.get(key) or "").strip() or None)  # noqa: E731
    catalog_url = f"{settings.FRONTEND_URL.rstrip('/')}/{tenant.slug}" if tenant.slug else None
    return {
        "name": name,
        "color": color,
        "logo": logo,
        "reply_to": reply_to,
        "whatsapp": text("whatsapp_number"),
        "legal_name": text("business_legal_name"),
        "nit": text("business_nit"),
        "address": text("business_address"),
        "city": text("business_city"),
        "phone": text("business_phone"),
        "footer": text("receipt_footer"),
        "catalog_url": catalog_url,
    }


def _local_time(value: datetime | None) -> str:
    # Las ventas se guardan en UTC; los negocios operan en Colombia (UTC-5)
    if not value:
        return ""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    local = value - timedelta(hours=5)
    return local.strftime("%d/%m/%Y %I:%M %p").replace("AM", "a. m.").replace("PM", "p. m.")


def render_receipt(session: Session, tenant: Tenant, sale: Sale) -> tuple[str, str, str]:
    biz = business_identity(session, tenant)
    meta = sale.meta_data or {}
    name = escape(biz["name"])
    color = biz["color"]
    wholesale = meta.get("price_mode") == "wholesale"
    created = _local_time(sale.created_at)
    payment = PAYMENT_LABELS.get(sale.payment_method, sale.payment_method)
    seller = session.get(User, sale.user_id) if sale.user_id else None
    customer = (meta.get("customer_name") or "").strip()

    # --- Datos del negocio (se muestran solo los que estén configurados) ---
    company_lines = []
    if biz["legal_name"] and biz["legal_name"].lower() != biz["name"].lower():
        company_lines.append(escape(biz["legal_name"]))
    if biz["nit"]:
        company_lines.append(f"NIT {escape(biz['nit'])}")
    location = ", ".join(escape(x) for x in (biz["address"], biz["city"]) if x)
    if location:
        company_lines.append(location)
    phones = " · ".join(x for x in (
        f"Tel. {escape(biz['phone'])}" if biz["phone"] else "",
        f"WhatsApp {escape(biz['whatsapp'])}" if biz["whatsapp"] else "",
    ) if x)
    if phones:
        company_lines.append(phones)
    if biz["reply_to"]:
        company_lines.append(escape(biz["reply_to"]))
    company_html = "<br>".join(company_lines)

    # --- Líneas de la venta ---
    rows_html, rows_text, units = [], [], 0.0
    for detail in sale.details:
        product = session.get(Product, detail.product_id)
        product_name = product.name if product else "Producto"
        qty = f"{detail.quantity:g}"
        units += float(detail.quantity or 0)
        rows_html.append(
            "<tr>"
            f"<td style=\"padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#111827;\">{escape(product_name)}"
            f"<div style=\"font-size:12px;color:#6b7280;margin-top:2px;\">{qty} × {_money(detail.price)}</div></td>"
            f"<td style=\"padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#111827;text-align:right;font-weight:600;white-space:nowrap;\">{_money(detail.total)}</td>"
            "</tr>"
        )
        rows_text.append(f"{qty} x {product_name} ({_money(detail.price)} c/u) = {_money(detail.total)}")

    header_logo = (
        f"<img src=\"{escape(biz['logo'])}\" alt=\"{name}\" width=\"60\" height=\"60\" style=\"border-radius:16px;background:#fff;display:block;object-fit:cover;\">"
        if biz["logo"] else
        f"<div style=\"width:60px;height:60px;border-radius:16px;background:rgba(255,255,255,0.22);color:#fff;font-size:28px;font-weight:700;line-height:60px;text-align:center;\">{escape(biz['name'][:1].upper())}</div>"
    )

    def info_row(label: str, value: str) -> str:
        return (f"<tr><td style=\"padding:3px 0;color:#6b7280;\">{label}</td>"
                f"<td style=\"padding:3px 0;text-align:right;color:#111827;font-weight:600;\">{value}</td></tr>")

    info_rows = [
        info_row("Recibo N.°", escape(sale.sale_number)),
        info_row("Fecha", escape(created)),
        info_row("Forma de pago", escape(payment)),
        info_row("Tipo de precio", "Por mayor" if wholesale else "Detal"),
    ]
    if customer and customer.lower() != "consumidor final":
        info_rows.append(info_row("Cliente", escape(customer)))
    if seller:
        info_rows.append(info_row("Atendido por", escape(seller.email)))

    total_rows = [
        info_row("Artículos", f"{units:g}"),
        info_row("Subtotal", _money(sale.subtotal)),
    ]
    if float(sale.tax or 0) > 0:
        total_rows.append(info_row("IVA", _money(sale.tax)))

    wholesale_badge = (
        "<span style=\"display:inline-block;margin-top:8px;padding:3px 10px;border-radius:999px;"
        "background:rgba(255,255,255,0.22);font-size:12px;font-weight:700;\">VENTA AL POR MAYOR</span>"
        if wholesale else ""
    )
    footer_msg = escape(biz["footer"]) if biz["footer"] else f"¡Gracias por comprar en {name}! Te esperamos pronto."
    catalog_btn = (
        f"<a href=\"{escape(biz['catalog_url'])}\" style=\"display:inline-block;margin-top:14px;padding:11px 18px;border-radius:10px;"
        f"background:{color};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;\">Ver nuestro catálogo</a>"
        if biz["catalog_url"] else ""
    )

    html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Recibo {escape(sale.sale_number)} · {name}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">Recibo {escape(sale.sale_number)} por {_money(sale.total)} en {name}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;background:#ffffff;border-radius:18px;overflow:hidden;">
  <tr><td style="background:{color};padding:24px 28px;color:#ffffff;">
    <table role="presentation" width="100%"><tr>
      <td width="74" valign="middle">{header_logo}</td>
      <td valign="middle">
        <div style="font-size:21px;font-weight:700;line-height:1.2;">{name}</div>
        <div style="font-size:13px;opacity:0.92;margin-top:4px;">Recibo de compra</div>
        {wholesale_badge}
      </td>
    </tr></table>
  </td></tr>
  {f'<tr><td style="padding:16px 28px 0;font-size:12px;color:#4b5563;line-height:1.6;">{company_html}</td></tr>' if company_html else ''}
  <tr><td style="padding:18px 28px 6px;">
    <div style="font-size:15px;color:#374151;line-height:1.5;">¡Hola{(' ' + escape(customer.split()[0])) if customer and customer.lower() != 'consumidor final' else ''}! Gracias por tu compra. Este es tu recibo.</div>
    <table role="presentation" width="100%" style="margin-top:14px;font-size:13px;background:#f9fafb;border-radius:12px;padding:10px 14px;">{''.join(info_rows)}</table>
  </td></tr>
  <tr><td style="padding:10px 28px 0;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Detalle</div>
    <table role="presentation" width="100%">{''.join(rows_html)}</table>
  </td></tr>
  <tr><td style="padding:12px 28px 22px;">
    <table role="presentation" width="100%" style="font-size:13px;">
      {''.join(total_rows)}
      <tr><td style="padding-top:10px;font-size:17px;font-weight:700;color:#111827;">Total pagado</td>
          <td style="padding-top:10px;font-size:24px;font-weight:800;color:{color};text-align:right;">{_money(sale.total)}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:18px 28px 24px;border-top:1px solid #e5e7eb;text-align:center;">
    <div style="font-size:14px;color:#374151;line-height:1.5;">{footer_msg}</div>
    {catalog_btn}
    <div style="font-size:11px;color:#9ca3af;line-height:1.6;margin-top:16px;">
      ¿Preguntas sobre tu compra? Responde este correo y le llegará directamente a {name}.<br>
      Este recibo es un comprobante de pago y no reemplaza la factura electrónica.
    </div>
  </td></tr>
</table>
<div style="font-size:11px;color:#9ca3af;margin-top:12px;">Enviado por {name} con V1TR0 POS</div>
</td></tr></table>
</body></html>"""

    company_text = [line for line in (
        biz["legal_name"], f"NIT {biz['nit']}" if biz["nit"] else None,
        ", ".join(x for x in (biz["address"], biz["city"]) if x) or None,
        f"Tel. {biz['phone']}" if biz["phone"] else None,
        f"WhatsApp {biz['whatsapp']}" if biz["whatsapp"] else None,
    ) if line]
    text = "\n".join([
        biz["name"], *company_text, "",
        f"Recibo de compra N.° {sale.sale_number}{' - VENTA AL POR MAYOR' if wholesale else ''}",
        f"Fecha: {created}",
        f"Forma de pago: {payment}",
        "",
        *rows_text,
        "",
        f"Subtotal: {_money(sale.subtotal)}",
        *( [f"IVA: {_money(sale.tax)}"] if float(sale.tax or 0) > 0 else [] ),
        f"TOTAL PAGADO: {_money(sale.total)}",
        "",
        biz["footer"] or f"¡Gracias por comprar en {biz['name']}!",
        f"¿Preguntas? Responde este correo y le llegará a {biz['name']}.",
    ])
    subject = f"Tu recibo de compra en {biz['name']} · {sale.sale_number}"
    return subject, text, html


def send_sale_receipt(session: Session, sale: Sale, recipient: str) -> tuple[bool, str]:
    """Envía el recibo y deja registro en notification_log (por negocio)."""
    tenant = session.get(Tenant, sale.tenant_id)
    if not tenant:
        return False, "Negocio no encontrado"

    sent_before = session.exec(
        select(NotificationLog).where(
            NotificationLog.tenant_id == tenant.id,
            NotificationLog.event_type == RECEIPT_EVENT,
            NotificationLog.subject.contains(sale.sale_number),
            NotificationLog.created_at >= datetime.utcnow() - timedelta(days=30),
        )
    ).all()
    if len(sent_before) >= MAX_SENDS_PER_SALE:
        return False, "Este recibo ya se envió varias veces"

    biz = business_identity(session, tenant)
    subject, text, html = render_receipt(session, tenant, sale)
    ok, message = send_email(
        [recipient], subject, html, text,
        sender_name=biz["name"], reply_to_email=biz["reply_to"], reply_to_name=biz["name"],
    )
    session.add(NotificationLog(
        tenant_id=tenant.id,
        event_type=RECEIPT_EVENT,
        recipient=recipient,
        subject=subject,
        status="sent" if ok else "failed",
        error_message=None if ok else message,
        payload={"sale_id": str(sale.id), "sale_number": sale.sale_number},
    ))
    meta = dict(sale.meta_data or {})
    meta["receipt_email"] = recipient
    meta["receipt_status"] = "sent" if ok else "failed"
    meta["receipt_sent_at"] = datetime.utcnow().isoformat()
    sale.meta_data = meta
    session.add(sale)
    session.commit()
    return ok, message
