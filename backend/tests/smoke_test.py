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
