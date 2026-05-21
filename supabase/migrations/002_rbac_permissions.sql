-- ============================================================
-- Migration 002: RBAC grant/deny permission model
-- - Adds granted_permissions / revoked_permissions to users.
-- - Adds role_default_permissions() (used here and by migration 003).
-- - Migrates any existing custom `permissions` into the grant/deny model.
-- Idempotent. Does NOT drop the legacy `permissions` column.
-- Run AFTER 001_identity_linking.sql and BEFORE 003_identity_rls_helpers.sql.
-- ============================================================

-- 1. New columns (nullable — null means "pure role defaults").
ALTER TABLE users ADD COLUMN IF NOT EXISTS granted_permissions text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS revoked_permissions text[];

-- 2. Role default permissions.
--    KEEP IN SYNC with DEFAULT_ROLE_PERMISSIONS in src/types/domain.ts.
CREATE OR REPLACE FUNCTION role_default_permissions(p_role text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE upper(p_role)
    WHEN 'ADMIN' THEN ARRAY[
      'shop:create','shop:read','shop:update','shop:delete',
      'user:create','user:read','user:update','user:delete',
      'product:create','product:read','product:update','product:delete','product:edit_price','barcode:manage',
      'inventory:read','inventory:adjust','inventory:damage',
      'transfer:create','transfer:approve','transfer:cancel','transfer:view',
      'pos:create_sale','pos:apply_discount','pos:override_price','pos:override_stock','pos:void_sale','pos:refund','sale:view',
      'supplier:create','supplier:read','supplier:update','supplier:delete',
      'purchase:create','purchase:approve','purchase:receive','purchase:view',
      'pricing:manage','approval:view',
      'shift:manage_own','shift:manage_all','shift:verify',
      'report:shop','report:global','report:profit',
      'audit:view_shop','audit:view_global'
    ]
    WHEN 'MANAGER' THEN ARRAY[
      'shop:read','user:read',
      'product:read','product:update','product:edit_price',
      'inventory:read','inventory:adjust','inventory:damage',
      'transfer:create','transfer:approve','transfer:view',
      'pos:create_sale','pos:apply_discount','pos:override_price','pos:override_stock','pos:void_sale','pos:refund','sale:view',
      'supplier:read',
      'purchase:create','purchase:receive','purchase:view','approval:view',
      'shift:manage_own','shift:manage_all','shift:verify',
      'report:shop','report:profit','audit:view_shop'
    ]
    WHEN 'CASHIER' THEN ARRAY[
      'product:read','inventory:read','transfer:view',
      'pos:create_sale','pos:apply_discount','sale:view',
      'shift:manage_own','report:shop'
    ]
    WHEN 'BUYER' THEN ARRAY['product:read']
    ELSE ARRAY[]::text[]
  END;
$$;

-- 3. Migrate existing custom `permissions` (replacement model) into grant/deny.
--    granted = permissions not in the role default
--    revoked = role defaults not in permissions
--    Effective set is therefore preserved exactly. Guarded so re-runs are no-ops.
UPDATE users u
SET
  granted_permissions = (
    SELECT COALESCE(array_agg(p), ARRAY[]::text[])
    FROM unnest(u.permissions) AS p
    WHERE NOT (p = ANY (role_default_permissions(u.role)))
  ),
  revoked_permissions = (
    SELECT COALESCE(array_agg(p), ARRAY[]::text[])
    FROM unnest(role_default_permissions(u.role)) AS p
    WHERE NOT (p = ANY (u.permissions))
  )
WHERE u.permissions IS NOT NULL
  AND array_length(u.permissions, 1) > 0
  AND u.granted_permissions IS NULL
  AND u.revoked_permissions IS NULL;

-- The legacy `permissions` column is intentionally retained until all clients
-- run on the grant/deny model. A later migration may drop it.
