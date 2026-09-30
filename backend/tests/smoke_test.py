"""
Smoke test manual (no pytest, cero dependencias nuevas) para validar en unos
segundos que los arreglos del plan de mejora siguen funcionando, contra una
base SQLite local desechable creada en este mismo directorio. NO toca
produccion ni el VPS.

Uso (desde la carpeta backend/):
    pip install -r requirements.txt
    python tests/smoke_test.py

Pensado como punto de partida: hoy el proyecto no tiene ninguna prueba
automatizada (ver hallazgo de deuda tecnica "cero tests" del plan de mejora).
Este script no reemplaza una suite real con pytest, pero deja verificado en
cada cambio futuro que lo mas critico (fuga de credenciales del catalogo
publico, aislamiento admin/cajero, numeros de venta duplicados, precios
manipulados, cuadre de caja, validaciones de compras, guard-rail de
JWT_SECRET) no se vuelve a romper.
"""
import os
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
DB_PATH = os.path.join(BACKEND_DIR, "tests", "_smoke_test.db")

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH}"
os.environ["ENV"] = "development"
os.environ["JWT_SECRET"] = "test-secret-not-for-prod-0123456789"
os.environ["EMAIL_ENABLED"] = "false"
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"

if os.path.exists(DB_PATH):
    os.remove(DB_PATH)

from fastapi.testclient import TestClient
from main import app

# Usar como context manager para que se disparen los eventos de "lifespan"
# (init_db() crea las tablas ahi), igual que ocurre con un servidor real.
_client_cm = TestClient(app)
client = _client_cm.__enter__()

failures = []


def check(label, condition, extra=""):
    status = "OK" if condition else "FAIL"
    print(f"[{status}] {label} {extra}")
    if not condition:
        failures.append(label)


# --- 1. Health check ---
r = client.get("/health")
check("health check responde 200", r.status_code == 200, r.text)

# --- 2. Registro de tenant + admin ---
email = "admin@smoketest.com"
password = "supersecreta123"
r = client.post("/api/v1/auth/register", json={
    "business_name": "Tienda Smoke Test",
    "business_type": "retail",
    "email": email,
    "password": password,
})
check("registro de tenant/admin", r.status_code == 201, f"{r.status_code} {r.text[:300]}")
tenant_slug = r.json().get("user", {}).get("slug") if r.status_code == 201 else None

# --- 3. Login admin ---
r = client.post("/api/v1/auth/login", data={"username": email, "password": password})
check("login admin", r.status_code == 200, r.text[:300])
admin_token = r.json()["access_token"] if r.status_code == 200 else None
admin_headers = {"Authorization": f"Bearer {admin_token}"}

# --- 4. Crear producto ---
product_id = str(uuid.uuid4())
r = client.post("/api/v1/products/", json={
    "id": product_id,
    "name": "Producto Smoke",
    "sku": "SKU-1",
    "price": "10000.00",
    "cost": "6000.00",
    "stock": 5,
    "tax_rate": "19.00",
}, headers=admin_headers)
check("crear producto", r.status_code == 201, f"{r.status_code} {r.text[:300]}")

# --- 4b. Crear colaborador cajero ---
cashier_email = "cajero@smoketest.com"
cashier_password = "cajerosecreto123"
r = client.post("/api/v1/auth/collaborators", json={"email": cashier_email, "password": cashier_password}, headers=admin_headers)
check("crear colaborador cajero", r.status_code == 201, f"{r.status_code} {r.text[:300]}")

r = client.post("/api/v1/auth/login", data={"username": cashier_email, "password": cashier_password})
check("login cajero", r.status_code == 200, r.text[:300])
cashier_token = r.json()["access_token"] if r.status_code == 200 else None
cashier_headers = {"Authorization": f"Bearer {cashier_token}"}

# --- 5. HALLAZGO 3.2: catalogo publico no debe filtrar meta_data ni cost ---
# Primero configuramos credenciales Factus "secretas" de prueba en el tenant
r = client.put("/api/v1/auth/tenant", json={
    "electronic_invoicing_enabled": True,
    "electronic_invoicing_provider": "factus",
    "factus_client_id": "CLIENTE_SECRETO_ID",
    "factus_client_secret": "SECRETO_QUE_NO_DEBE_SALIR",
    "factus_username": "usuario_secreto",
    "factus_password": "password_secreto",
}, headers=admin_headers)
check("admin configura factus (setup)", r.status_code == 200, f"{r.status_code} {r.text[:300]}")

r = client.get(f"/api/v1/products/public/{tenant_slug}")
check("catalogo publico responde 200", r.status_code == 200, f"{r.status_code} {r.text[:300]}")
body_text = r.text
check(
    "catalogo publico NO expone factus_client_secret",
    "SECRETO_QUE_NO_DEBE_SALIR" not in body_text and "factus_client_secret" not in body_text,
)
check(
    "catalogo publico NO expone factus_password",
    "password_secreto" not in body_text and "factus_password" not in body_text,
)
if r.status_code == 200:
    pub_products = r.json().get("products", [])
    has_cost_field = any("cost" in p for p in pub_products)
    check("catalogo publico NO expone 'cost' del producto", not has_cost_field, str(pub_products[:1]))

# --- 6. HALLAZGO 4/3.2: GET /auth/tenant restringido a admin ---
r = client.get("/api/v1/auth/tenant", headers=cashier_headers)
check("GET /auth/tenant como CAJERO -> 403 (antes cualquiera lo veia)", r.status_code == 403, f"{r.status_code} {r.text[:200]}")

r = client.get("/api/v1/auth/tenant", headers=admin_headers)
check("GET /auth/tenant como ADMIN -> 200", r.status_code == 200, f"{r.status_code}")

# --- 7. HALLAZGO 5.2/4.1/5.3: sync de venta con precio manipulado, dos "cajas" con mismo numero local ---
def make_sale_payload(sale_id, local_number, tampered_price=None):
    price = tampered_price if tampered_price is not None else "10000.00"
    qty = 1
    return {
        "id": sale_id,
        "sale_number": local_number,   # numero generado "localmente" por cada caja de prueba
        "subtotal": "8403.36",
        "tax": "1596.64",
        "total": price,
        "payment_method": "cash",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "meta_data": {},
        "details": [{
            "product_id": product_id,
            "quantity": qty,
            "price": price,          # <-- precio manipulado a nivel de detalle tambien
            "total": price,
            "name": "Producto Smoke",
        }],
    }

sale_id_1 = str(uuid.uuid4())
sale_id_2 = str(uuid.uuid4())

# "Caja A" y "Caja B" generan el mismo numero local POS-01001, y la caja B intenta
# reportar un precio manipulado de 1 (en vez de los 10000 reales) para el mismo producto.
payload_a = {"sales": [make_sale_payload(sale_id_1, "POS-01001", tampered_price="10000.00")]}
payload_b = {"sales": [make_sale_payload(sale_id_2, "POS-01001", tampered_price="1.00")]}

r1 = client.post("/api/v1/sales/sync", json=payload_a, headers=cashier_headers)
check("sync venta 1 (caja A)", r1.status_code == 200 and not r1.json().get("errors"), f"{r1.status_code} {r1.text[:300]}")

r2 = client.post("/api/v1/sales/sync", json=payload_b, headers=cashier_headers)
check("sync venta 2 (caja B, precio manipulado)", r2.status_code == 200 and not r2.json().get("errors"), f"{r2.status_code} {r2.text[:300]}")

r = client.get("/api/v1/sales/", headers=admin_headers)
sales = r.json() if r.status_code == 200 else []
check("GET /sales devuelve 2 ventas", len(sales) == 2, str(len(sales)))

numbers = [s["sale_number"] for s in sales]
check("los sale_number asignados por el servidor son DISTINTOS entre si", len(set(numbers)) == len(numbers), str(numbers))

sale_2 = next((s for s in sales if s["id"] == sale_id_2), None)
check(
    "el precio manipulado (1.00) fue corregido a 10000.00 por el servidor",
    sale_2 is not None and Decimal(str(sale_2["total"])) == Decimal("10000.00"),
    str(sale_2.get("total") if sale_2 else None),
)

r = client.get(f"/api/v1/sales/{sale_id_2}", headers=admin_headers)
meta = r.json().get("meta_data", {}) if r.status_code == 200 else {}
check("la venta con precio manipulado quedo marcada pricing_adjusted=True", meta.get("pricing_adjusted") is True, str(meta))

# --- 8. Stock se descuento correctamente (5 - 1 - 1 = 3) ---
r = client.get(f"/api/v1/products/{product_id}", headers=admin_headers)
stock = r.json().get("stock") if r.status_code == 200 else None
check("stock del producto bajo de 5 a 3 tras las 2 ventas", stock == 3, str(stock))

# --- 9. HALLAZGO 5.4: editar producto NO debe poder pisar el stock ---
r = client.put(f"/api/v1/products/{product_id}", json={
    "name": "Producto Smoke",
    "price": "10000.00",
    "cost": "6000.00",
    "stock": 999,  # intento de sobreescribir el stock via edicion general
    "tax_rate": "19.00",
}, headers=admin_headers)
check("PUT producto con stock=999 responde 200", r.status_code == 200, f"{r.status_code} {r.text[:300]}")
r = client.get(f"/api/v1/products/{product_id}", headers=admin_headers)
stock_after_edit = r.json().get("stock")
check("el stock NO fue sobreescrito por la edicion (sigue en 3)", stock_after_edit == 3, str(stock_after_edit))

# --- 10. HALLAZGO 4.2: cierre de caja no debe mezclar metodos de pago ---
r = client.post("/api/v1/cash/open", json={"opening_amount": "50000.00"}, headers=admin_headers)
check("abrir caja", r.status_code == 201, f"{r.status_code} {r.text[:300]}")

# Crear otro producto con stock suficiente para ventas con tarjeta/efectivo
product_id_2 = str(uuid.uuid4())
client.post("/api/v1/products/", json={
    "id": product_id_2, "name": "Producto 2", "sku": "SKU-2",
    "price": "20000.00", "cost": "10000.00", "stock": 10, "tax_rate": "19.00",
}, headers=admin_headers)

def sale_for_cash_test(pm, price):
    sid = str(uuid.uuid4())
    return {
        "id": sid, "sale_number": f"LOCAL-{sid[:8]}", "subtotal": "0", "tax": "0", "total": price,
        "payment_method": pm, "created_at": datetime.now(timezone.utc).isoformat(), "meta_data": {},
        "details": [{"product_id": product_id_2, "quantity": 1, "price": price, "total": price}],
    }

client.post("/api/v1/sales/sync", json={"sales": [sale_for_cash_test("cash", "20000.00")]}, headers=admin_headers)
client.post("/api/v1/sales/sync", json={"sales": [sale_for_cash_test("card", "20000.00")]}, headers=admin_headers)
client.post("/api/v1/sales/sync", json={"sales": [sale_for_cash_test("transfer", "20000.00")]}, headers=admin_headers)

r = client.get("/api/v1/cash/current", headers=admin_headers)
current = r.json() if r.status_code == 200 else {}
check(
    "expected_amount solo cuenta la venta en EFECTIVO (50000 apertura + 20000 cash, no +40000 de card/transfer)",
    current.get("expected_amount") is not None and Decimal(str(current["expected_amount"])) == Decimal("70000.00"),
    str(current.get("expected_amount")),
)

r = client.post(f"/api/v1/cash/{current['session']['id']}/close", json={"actual_closing_amount": "70000.00"}, headers=admin_headers)
close_resp = r.json() if r.status_code == 200 else {}
check(
    "cierre de caja: differencia_amount = 0 cuando el efectivo real coincide (antes daria una diferencia falsa por card/transfer)",
    close_resp.get("difference_amount") is not None and Decimal(str(close_resp["difference_amount"])) == Decimal("0.00"),
    str(close_resp.get("difference_amount")),
)

# --- 11. HALLAZGO 5.7: compra con cantidad negativa debe rechazarse ---
r = client.post("/api/v1/suppliers/", json={"name": "Proveedor Smoke"}, headers=admin_headers)
supplier_id = r.json().get("id") if r.status_code in (200, 201) else None
check("crear proveedor", supplier_id is not None, f"{r.status_code} {r.text[:300]}")

r = client.post("/api/v1/purchases/", json={
    "supplier_id": supplier_id,
    "invoice_number": "F-001",
    "details": [{"product_id": product_id, "quantity": -5, "unit_cost": "1000.00"}],
}, headers=admin_headers)
check("compra con cantidad NEGATIVA -> rechazada (400)", r.status_code == 400, f"{r.status_code} {r.text[:300]}")

# --- 13. Precio al por mayor: el servidor usa wholesale_price y congela el costo ---
wholesale_product_id = str(uuid.uuid4())
r = client.post("/api/v1/products/", json={
    "id": wholesale_product_id,
    "name": "Producto Mayorista",
    "price": "5000.00",
    "wholesale_price": "4000.00",
    "cost": "3000.00",
    "stock": 100,
    "tax_rate": "0.00",
}, headers=admin_headers)
check("crear producto con precio por mayor", r.status_code == 201 and Decimal(str(r.json().get("wholesale_price"))) == Decimal("4000.00"), f"{r.status_code} {r.text[:200]}")

def wholesale_sale(sale_id, mode, client_price):
    return {"sales": [{
        "id": sale_id, "sale_number": "LOCAL-W", "subtotal": "0", "tax": "0", "total": "0",
        "payment_method": "cash", "created_at": datetime.now(timezone.utc).isoformat(), "meta_data": {},
        "details": [{"product_id": wholesale_product_id, "quantity": 10, "price": client_price,
                     "total": "0", "price_mode": mode}],
    }]}

w_sale_id = str(uuid.uuid4())
client.post("/api/v1/sales/sync", json=wholesale_sale(w_sale_id, "wholesale", "4000.00"), headers=admin_headers)
r = client.get(f"/api/v1/sales/{w_sale_id}", headers=admin_headers)
w_sale = r.json() if r.status_code == 200 else {}
w_detail = (w_sale.get("details") or [{}])[0]
check("venta al por mayor usa wholesale_price (10 x 4000 = 40000)", Decimal(str(w_sale.get("total", 0))) == Decimal("40000.00"), str(w_sale.get("total")))
check("detalle guarda price_mode=wholesale y unit_cost=3000", w_detail.get("price_mode") == "wholesale" and Decimal(str(w_detail.get("unit_cost") or 0)) == Decimal("3000.00"), str(w_detail))
check("venta marcada meta_data.price_mode=wholesale", (w_sale.get("meta_data") or {}).get("price_mode") == "wholesale")

# Un cliente que manda precio al por mayor pero dice 'retail' se corrige al detal
t_sale_id = str(uuid.uuid4())
client.post("/api/v1/sales/sync", json=wholesale_sale(t_sale_id, "retail", "4000.00"), headers=admin_headers)
r = client.get(f"/api/v1/sales/{t_sale_id}", headers=admin_headers)
t_sale = r.json() if r.status_code == 200 else {}
check("precio de mayor reportado en venta al detal se corrige a 50000", Decimal(str(t_sale.get("total", 0))) == Decimal("50000.00"), str(t_sale.get("total")))
check("...y queda marcada pricing_adjusted", (t_sale.get("meta_data") or {}).get("pricing_adjusted") is True)

# El catalogo publico solo muestra precios por mayor si el negocio lo habilita
def public_wholesale_product():
    r = client.get(f"/api/v1/products/public/{tenant_slug}")
    data = r.json() if r.status_code == 200 else {}
    prod = next((p for p in data.get("products", []) if str(p.get("id")) == wholesale_product_id), {})
    return data.get("tenant", {}), prod

pub_tenant, pub_prod = public_wholesale_product()
check("catalogo publico: por mayor deshabilitado por defecto", pub_tenant.get("wholesale_enabled") is False and pub_prod.get("wholesale_price") is None, str(pub_prod))
check("catalogo publico NO expone el stock exacto", "stock" not in pub_prod and pub_prod.get("availability") == "available", str(pub_prod))
r = client.put("/api/v1/auth/tenant", json={"catalog_wholesale_enabled": True}, headers=admin_headers)
check("admin habilita precios por mayor en el catalogo", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
pub_tenant, pub_prod = public_wholesale_product()
check("catalogo publico: con por mayor habilitado envia wholesale_price", pub_tenant.get("wholesale_enabled") is True and Decimal(str(pub_prod.get("wholesale_price"))) == Decimal("4000.00"), str(pub_prod))

r = client.get("/api/v1/dashboard/summary", headers=admin_headers)
by_mode = (r.json().get("by_price_mode") or {}).get("today", {}) if r.status_code == 200 else {}
check(
    "dashboard separa ganancia por mayor (40000 - 30000 = 10000)",
    abs(by_mode.get("wholesale", {}).get("profit", 0) - 10000) < 0.01,
    str(by_mode),
)

# --- 14. Subida de fotos de producto ---
webp_bytes = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 32
r = client.post("/api/v1/media/products", files={"file": ("foto.webp", webp_bytes, "image/webp")}, headers=admin_headers)
check("subir foto WebP -> 201", r.status_code == 201, f"{r.status_code} {r.text[:200]}")
media_path = r.json().get("path") if r.status_code == 201 else None
if media_path:
    r = client.get(media_path)
    check("la foto subida se sirve con cache inmutable", r.status_code == 200 and "immutable" in r.headers.get("cache-control", ""), str(r.headers.get("cache-control")))
    stored = os.path.join(BACKEND_DIR, "media", *media_path.split("/")[2:])
    if os.path.exists(stored):
        os.remove(stored)

r = client.post("/api/v1/media/products", files={"file": ("x.webp", b"<svg>no soy imagen</svg>", "image/webp")}, headers=admin_headers)
check("subir archivo que no es imagen -> 415", r.status_code == 415, f"{r.status_code}")

r = client.post("/api/v1/media/products", files={"file": ("big.jpg", b"\xff\xd8\xff" + b"\x00" * 1_600_000, "image/jpeg")}, headers=admin_headers)
check("subir foto demasiado grande -> 413", r.status_code == 413, f"{r.status_code}")

r = client.post("/api/v1/media/products", files={"file": ("foto.webp", webp_bytes, "image/webp")}, headers=cashier_headers)
check("cajero no puede subir fotos -> 403", r.status_code == 403, f"{r.status_code}")

# --- 15. Recibo digital por correo: sale de la plataforma pero con la marca del negocio ---
import app.services.receipts as receipts_module
sent_mails = []
def fake_send_email(recipients, subject, html, text, **kwargs):
    sent_mails.append({"to": list(recipients), "subject": subject, "html": html, **kwargs})
    return True, "ok"
receipts_module.send_email = fake_send_email

r = client.put("/api/v1/auth/tenant", json={
    "display_name": "Panadería La Espiga", "receipt_reply_to_email": "ventas@laespiga.co",
    "business_legal_name": "Panificadora La Espiga S.A.S.", "business_nit": "901.234.567-8",
    "business_address": "Cra 7 # 12-34", "business_city": "Villavicencio", "business_phone": "608 123 4567",
    "whatsapp_number": "+57 300 123 4567", "receipt_footer": "¡Gracias! Pan fresco todos los días desde las 6 a. m.",
    "brand_color": "#b45309",
}, headers=admin_headers)
check("configurar correo de respuesta del recibo", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
r = client.put("/api/v1/auth/tenant", json={"receipt_reply_to_email": "no-es-correo"}, headers=admin_headers)
check("correo de respuesta inválido -> 400", r.status_code == 400, f"{r.status_code}")

r = client.post(f"/api/v1/sales/{w_sale_id}/receipt", json={"email": "cliente@correo.com"}, headers=cashier_headers)
check("cajero envía recibo digital -> 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
mail = sent_mails[-1] if sent_mails else {}
check("remitente visible = nombre del negocio", mail.get("sender_name") == "Panadería La Espiga", str(mail.get("sender_name")))
check("Reply-To = correo del negocio", mail.get("reply_to_email") == "ventas@laespiga.co", str(mail.get("reply_to_email")))
check("asunto y cuerpo con el negocio y el número de venta",
      "Panadería La Espiga" in mail.get("subject", "") and w_sale["sale_number"] in mail.get("html", "") and "por mayor" in mail.get("html", "").lower(),
      mail.get("subject", ""))
check("el recibo trae los datos del negocio (NIT, dirección, pie propio)",
      all(x in mail.get("html", "") for x in ("901.234.567-8", "Cra 7 # 12-34", "Villavicencio", "Pan fresco")),
      "")
if os.environ.get("RECEIPT_PREVIEW"):
    with open(os.environ["RECEIPT_PREVIEW"], "w", encoding="utf-8") as fh:
        fh.write(mail.get("html", ""))
r = client.post("/api/v1/auth/login", data={"username": email, "password": password})
user_meta = (r.json().get("user") or {}).get("meta_data", {}) if r.status_code == 200 else {}
check("el login entrega los datos del recibo al POS (para imprimir sin conexión)", user_meta.get("business_nit") == "901.234.567-8", str(user_meta)[:200])

r = client.post(f"/api/v1/sales/{w_sale_id}/receipt", json={"email": "no-es-correo"}, headers=admin_headers)
check("recibo a correo inválido -> 422", r.status_code == 422, f"{r.status_code}")

before = len(sent_mails)
auto_sale_id = str(uuid.uuid4())
auto = wholesale_sale(auto_sale_id, "retail", "5000.00")
auto["sales"][0]["meta_data"] = {"receipt_email": "otro@correo.com"}
client.post("/api/v1/sales/sync", json=auto, headers=cashier_headers)
check("venta sincronizada con receipt_email envía el recibo sola", len(sent_mails) == before + 1 and sent_mails[-1]["to"] == ["otro@correo.com"], str(len(sent_mails) - before))

r = client.post("/api/v1/auth/register", json={"business_name": "Otro Negocio", "business_type": "retail", "email": "otro@smoketest.com", "password": "otrosecreto123"})
other_headers = {"Authorization": f"Bearer {r.json().get('access_token')}"} if r.status_code == 201 else {}
r = client.post(f"/api/v1/sales/{w_sale_id}/receipt", json={"email": "x@correo.com"}, headers=other_headers)
check("otro negocio NO puede enviar el recibo de esta venta -> 404", r.status_code == 404, f"{r.status_code}")

# --- 16. Prueba gratis de 7 días y aviso de plan vencido ---
from datetime import timedelta
from sqlmodel import Session as _Session, select as _select
from app.core.db import engine as _engine
from app.models.tenant import Tenant as _Tenant

r = client.post("/api/v1/auth/register", json={"business_name": "Negocio Prueba Trial", "business_type": "retail", "email": "trial@smoketest.com", "password": "trialsecreto123"})
trial_user = r.json().get("user", {}) if r.status_code == 201 else {}
ends = trial_user.get("subscription_ends_at") or ""
check("registro nuevo = plan free, prueba vigente", trial_user.get("plan_name") == "free" and trial_user.get("subscription_active") is True, str(trial_user)[:200])
try:
    days = (datetime.fromisoformat(ends.replace("Z", "+00:00")) - datetime.now(timezone.utc)).days
except ValueError:
    days = -1
check("la prueba dura 7 días", days in (6, 7), f"{days} ({ends})")
trial_headers = {"Authorization": f"Bearer {r.json().get('access_token')}"}

with _Session(_engine) as s:
    t = s.exec(_select(_Tenant).where(_Tenant.name == "Negocio Prueba Trial")).first()
    t.subscription_ends_at = datetime.utcnow() - timedelta(days=1)
    s.add(t); s.commit()
r = client.get("/api/v1/auth/subscription", headers=trial_headers)
check("prueba vencida -> subscription_active False", r.status_code == 200 and r.json().get("subscription_active") is False, r.text[:200])
r = client.post("/api/v1/auth/login", data={"username": "trial@smoketest.com", "password": "trialsecreto123"})
check("con la prueba vencida aún puede iniciar sesión (para ver el aviso de planes)", r.status_code == 200 and r.json()["user"].get("subscription_active") is False, r.text[:200])

with _Session(_engine) as s:
    t = s.exec(_select(_Tenant).where(_Tenant.name == "Negocio Prueba Trial")).first()
    t.plan_name = "standard"; t.subscription_ends_at = datetime.utcnow() + timedelta(days=365)
    s.add(t); s.commit()
r = client.get("/api/v1/auth/subscription", headers=trial_headers)
check("al activarlo el superadmin, la app lo ve vigente sin reingresar", r.json().get("subscription_active") is True and r.json().get("plan_name") == "standard", r.text[:200])

# --- 12. HALLAZGO 5.10: guard-rail de JWT_SECRET inseguro en produccion ---
import subprocess
guard_db_path = os.path.join(BACKEND_DIR, "tests", "_smoke_test_guard.db")
result = subprocess.run(
    [sys.executable, "-c",
     f"import os; os.environ['ENV']='production'; os.environ['JWT_SECRET']='change-me-in-production'; "
     f"os.environ['DATABASE_URL']='sqlite:///{guard_db_path}'; "
     f"from app.core.config import get_settings; get_settings()"],
    capture_output=True, text=True, cwd=BACKEND_DIR,
)
if os.path.exists(guard_db_path):
    os.remove(guard_db_path)
check(
    "arrancar en ENV=production con JWT_SECRET por defecto lanza RuntimeError",
    result.returncode != 0 and "JWT_SECRET" in (result.stderr or ""),
    (result.stderr or "")[-300:],
)

_client_cm.__exit__(None, None, None)
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)

print()
if failures:
    print(f"=== {len(failures)} CHEQUEO(S) FALLARON: {failures}")
    sys.exit(1)
else:
    print("=== TODOS LOS CHEQUEOS PASARON ===")
