# Produccion

## Variables de entorno

Usa `.env.prod.example` como base para el VPS y guárdalo como `.env` junto a `docker-compose.prod.yml`.

Variables obligatorias:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `JWT_SECRET`
- `ALLOWED_ORIGINS`
- `EMAIL_ENABLED`
- `EMAIL_API_TOKEN`
- `EMAIL_FROM_EMAIL`
- `FRONTEND_URL`

## Notas de correo

El backend usa una API HTTP de correo compatible con `sender`, `to`, `subject`, `htmlContent` y `textContent`.

Valores esperados por defecto:

- `EMAIL_API_BASE_URL=https://api.brevo.com/v3/smtp/email`
- `EMAIL_API_AUTH_HEADER=api-key`

Si tu proveedor usa otra URL o cabecera, ajusta esas variables.

## Eventos implementados

- `sale_created`
- `cash_opened`
- `cash_closed`
- `low_stock_alert`
- `daily_summary`

## Despliegue

1. Crear `.env` en el VPS desde `.env.prod.example`.
2. Rotar cualquier secreto ya expuesto anteriormente.
3. Ejecutar `docker compose -f docker-compose.prod.yml up -d --build`.
4. Verificar `http://127.0.0.1:8088/health` en backend.
5. Verificar login desde frontend y probar correo desde Configuración.

## Recuperación de contraseña

Endpoints implementados:

- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

## Scheduler diario

Variables:

- `SCHEDULER_ENABLED=true`
- `DAILY_SUMMARY_HOUR_UTC=23`

Cuando está activo, el backend envía el resumen diario por tenant a la hora indicada en UTC según las reglas `daily_summary`.

## Migraciones

Revisiones actuales:

- `0001_init`: baseline del esquema actual
- `0002_tenant_idx`: índices compuestos por tenant
- `0003_supply`: proveedores, compras y movimientos base
- `0004_purchase`: flujo ampliado de compras y campos extra de proveedor

Comandos dentro de `backend`:

- `alembic stamp 0001_init`
- `alembic upgrade head`
- `alembic revision -m "descripcion"`

### Producción con base existente

Usa esto una sola vez si la base ya fue creada antes de Alembic:

1. `alembic stamp 0001_init`
2. `alembic upgrade head`

Eso registra la base actual como baseline y luego aplica las migraciones incrementales siguientes.

### Producción con base nueva

1. `alembic upgrade head`

### Ejecución automática opcional

Puedes activar:

- `RUN_MIGRATIONS_ON_STARTUP=true`

Recomendación:

- `false` en producción crítica y correr migraciones manualmente
- `true` en staging o despliegues controlados

## Pendientes recomendados

1. Reemplazar `init_db()` y ALTER manuales por flujo 100% Alembic cuando la base esté estampada.
2. Agregar restricciones únicas por tenant donde aplique.
3. Reemplazar simulación DIAN por integración real.
