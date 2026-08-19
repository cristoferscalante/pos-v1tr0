-- Migración: Añadir columnas de SaaS al sistema POS

-- 1. Columna is_superadmin en tabla user
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Hacer tenant_id nullable
ALTER TABLE "user" ALTER COLUMN tenant_id DROP NOT NULL;

-- 3. Columnas de suscripción en tabla tenant
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS plan_name VARCHAR NOT NULL DEFAULT 'free';
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP;
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS has_electronic_billing BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS folios_remaining INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS folios_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. Establecer superadmin
UPDATE "user" SET is_superadmin = TRUE WHERE email = 'cristoferscalante@gmail.com';

-- 5. Verificar
SELECT id, email, role, is_superadmin, is_admin, tenant_id FROM "user" WHERE email = 'cristoferscalante@gmail.com';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user' ORDER BY ordinal_position;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tenant' ORDER BY ordinal_position;
