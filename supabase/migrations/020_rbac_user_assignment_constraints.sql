-- ============================================================
-- Migration 020: RBAC user-assignment constraints
-- Enforce, at the database level, the user-assignment business rules:
--   * Exactly ONE row with role = 'ADMIN' may exist in the whole system.
--   * At most ONE active MANAGER may exist per shop.
--   * MANAGER / CASHIER / BUYER must have a shop_id; ADMIN must not.
--   * An active CASHIER may only exist in a shop with an active MANAGER.
--   * Deactivating / demoting / re-assigning the only active MANAGER of
--     a shop is blocked while that shop still has active CASHIER rows.
--
-- Run AFTER 001-019. Idempotent (CREATE OR REPLACE, IF NOT EXISTS).
--
-- WHY in the DB, not just the UI:
--   The current Users page writes directly to public.users. A frontend
--   bug, a manual SQL session, or a future migration to RPCs must NEVER
--   be able to create a second admin or strand a cashier without a
--   manager. Indexes + triggers make these rules total.
--
-- INTERACTS WITH:
--   * 010_rls_lockdown_phase_1.sql -- still gates writes by RBAC perms.
--   * 014_rbac_role_tuning.sql      -- role_default_permissions() stays.
--   * src/types/domain.ts / Users page -- frontend mirrors these rules
--                                          but is not the source of truth.
-- ============================================================

-- ============================================================
-- 1. Preflight: refuse to apply on dirty data so existing
--    violations are surfaced rather than silently picked over.
-- ============================================================
DO $$
DECLARE
  v_admin_count           int;
  v_dup_manager_shops     int;
  v_manager_null_shop     int;
  v_cashier_null_shop     int;
  v_cashier_no_manager    int;
BEGIN
  SELECT count(*) INTO v_admin_count
    FROM users
   WHERE role = 'ADMIN';
  IF v_admin_count > 1 THEN
    RAISE EXCEPTION
      'Migration 020 aborted: % rows with role=ADMIN exist (only 1 allowed). '
      'Demote or delete the extras before re-running this migration.',
      v_admin_count;
  END IF;

  SELECT count(*) INTO v_dup_manager_shops FROM (
    SELECT shop_id
      FROM users
     WHERE role = 'MANAGER'
       AND is_active = true
       AND shop_id IS NOT NULL
     GROUP BY shop_id
    HAVING count(*) > 1
  ) t;
  IF v_dup_manager_shops > 0 THEN
    RAISE EXCEPTION
      'Migration 020 aborted: % shop(s) have more than one active MANAGER. '
      'Deactivate the extras before re-running this migration.',
      v_dup_manager_shops;
  END IF;

  SELECT count(*) INTO v_manager_null_shop
    FROM users
   WHERE role = 'MANAGER' AND is_active = true AND shop_id IS NULL;
  IF v_manager_null_shop > 0 THEN
    RAISE EXCEPTION
      'Migration 020 aborted: % active MANAGER row(s) have NULL shop_id. '
      'Assign a shop or deactivate before re-running this migration.',
      v_manager_null_shop;
  END IF;

  SELECT count(*) INTO v_cashier_null_shop
    FROM users
   WHERE role = 'CASHIER' AND is_active = true AND shop_id IS NULL;
  IF v_cashier_null_shop > 0 THEN
    RAISE EXCEPTION
      'Migration 020 aborted: % active CASHIER row(s) have NULL shop_id. '
      'Assign a shop or deactivate before re-running this migration.',
      v_cashier_null_shop;
  END IF;

  SELECT count(*) INTO v_cashier_no_manager
    FROM users c
   WHERE c.role = 'CASHIER'
     AND c.is_active = true
     AND c.shop_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM users m
        WHERE m.role = 'MANAGER'
          AND m.is_active = true
          AND m.shop_id = c.shop_id
     );
  IF v_cashier_no_manager > 0 THEN
    RAISE EXCEPTION
      'Migration 020 aborted: % active CASHIER row(s) belong to shops with no active MANAGER. '
      'Assign a manager (or deactivate the cashiers) before re-running this migration.',
      v_cashier_no_manager;
  END IF;
END;
$$;

-- ============================================================
-- 2. Partial unique indexes.
--    The WHERE clauses make these uniqueness rules total: even a
--    direct SQL INSERT cannot bypass them.
-- ============================================================

-- A. One admin in the whole system. We index a constant expression so
--    every ADMIN row produces the same key and a second admin collides.
CREATE UNIQUE INDEX IF NOT EXISTS users_only_one_admin
  ON users ((true))
  WHERE role = 'ADMIN';

-- B. At most one ACTIVE manager per shop. Inactive managers are
--    intentionally exempt so a deactivated former manager can stay
--    on the row as history without blocking a successor.
CREATE UNIQUE INDEX IF NOT EXISTS users_one_active_manager_per_shop
  ON users (shop_id)
  WHERE role = 'MANAGER' AND is_active = true;

-- ============================================================
-- 3. Trigger function: role/shop assignment + cashier-needs-manager.
--    Errors are short, end-user-facing strings so the frontend can
--    surface them as-is (see src/features/admin/userFormErrors.ts).
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_user_assignment_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_active_manager_exists  boolean;
  v_active_cashier_count   int;
  v_replacement_manager    boolean;
BEGIN
  ----------------------------------------------------------------
  -- ADMIN: shop_id is meaningless globally. Normalise to NULL so
  -- callers don't have to remember to clear it on role flips.
  ----------------------------------------------------------------
  IF NEW.role = 'ADMIN' THEN
    NEW.shop_id := NULL;
  END IF;

  ----------------------------------------------------------------
  -- Role/shop binding requirements.
  ----------------------------------------------------------------
  IF NEW.role = 'MANAGER' AND NEW.shop_id IS NULL THEN
    RAISE EXCEPTION 'Manager must be assigned to a shop.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.role = 'CASHIER' AND NEW.shop_id IS NULL THEN
    RAISE EXCEPTION 'Cashier must be assigned to a shop.'
      USING ERRCODE = 'P0001';
  END IF;

  -- BUYER is a per-shop purchasing role (purchase:create / purchase:view
  -- are shop-scoped by RLS) so a shopless BUYER cannot do anything.
  IF NEW.role = 'BUYER' AND NEW.shop_id IS NULL THEN
    RAISE EXCEPTION 'Buyer must be assigned to a shop.'
      USING ERRCODE = 'P0001';
  END IF;

  ----------------------------------------------------------------
  -- An ACTIVE cashier must sit under an active manager of the same
  -- shop. (Inactive cashiers are exempt so historical rows survive.)
  ----------------------------------------------------------------
  IF NEW.role = 'CASHIER' AND NEW.is_active = true THEN
    SELECT EXISTS (
      SELECT 1
        FROM users m
       WHERE m.role = 'MANAGER'
         AND m.is_active = true
         AND m.shop_id = NEW.shop_id
         AND m.id <> NEW.id
    ) INTO v_active_manager_exists;

    IF NOT v_active_manager_exists THEN
      RAISE EXCEPTION 'Cannot create cashier for a shop without an active manager.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  ----------------------------------------------------------------
  -- Manager deactivation / demotion / reassignment safety.
  -- Block the change if it would strip a shop of its only active
  -- manager while active cashiers are still attached to that shop.
  -- A replacement manager already in place lifts the block.
  ----------------------------------------------------------------
  IF TG_OP = 'UPDATE'
     AND OLD.role = 'MANAGER'
     AND OLD.is_active = true
     AND OLD.shop_id IS NOT NULL
     AND (
       NEW.role <> 'MANAGER'
       OR NEW.is_active = false
       OR NEW.shop_id IS DISTINCT FROM OLD.shop_id
     )
  THEN
    SELECT count(*) INTO v_active_cashier_count
      FROM users c
     WHERE c.role = 'CASHIER'
       AND c.is_active = true
       AND c.shop_id = OLD.shop_id
       AND c.id <> NEW.id;

    IF v_active_cashier_count > 0 THEN
      SELECT EXISTS (
        SELECT 1
          FROM users m
         WHERE m.role = 'MANAGER'
           AND m.is_active = true
           AND m.shop_id = OLD.shop_id
           AND m.id <> NEW.id
      ) INTO v_replacement_manager;

      IF NOT v_replacement_manager THEN
        RAISE EXCEPTION
          'Cannot remove the only manager of this shop while % active cashier(s) remain. '
          'Reassign or deactivate the cashiers first, or assign another manager.',
          v_active_cashier_count
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach the trigger (drop-then-create so a re-run picks up
-- any function-body changes from later migrations).
DROP TRIGGER IF EXISTS trg_enforce_user_assignment_rules ON users;
CREATE TRIGGER trg_enforce_user_assignment_rules
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_user_assignment_rules();

-- ============================================================
-- 4. Preflight helper VIEW.
--    A read-only view operators can SELECT from to audit violations
--    before re-running this (or any future) migration. Safe to keep
--    around — it's purely a diagnostic.
-- ============================================================
CREATE OR REPLACE VIEW rbac_assignment_violations AS
SELECT 'multiple_admins' AS kind,
       NULL::text         AS shop_id,
       u.id               AS user_id,
       u.name             AS user_name,
       u.role,
       u.is_active
  FROM users u
 WHERE u.role = 'ADMIN'
   AND (SELECT count(*) FROM users WHERE role = 'ADMIN') > 1
UNION ALL
SELECT 'shop_with_multiple_active_managers',
       u.shop_id, u.id, u.name, u.role, u.is_active
  FROM users u
 WHERE u.role = 'MANAGER'
   AND u.is_active = true
   AND u.shop_id IN (
     SELECT shop_id FROM users
      WHERE role = 'MANAGER' AND is_active = true AND shop_id IS NOT NULL
      GROUP BY shop_id HAVING count(*) > 1
   )
UNION ALL
SELECT 'active_manager_without_shop',
       u.shop_id, u.id, u.name, u.role, u.is_active
  FROM users u
 WHERE u.role = 'MANAGER' AND u.is_active = true AND u.shop_id IS NULL
UNION ALL
SELECT 'active_cashier_without_shop',
       u.shop_id, u.id, u.name, u.role, u.is_active
  FROM users u
 WHERE u.role = 'CASHIER' AND u.is_active = true AND u.shop_id IS NULL
UNION ALL
SELECT 'active_cashier_without_manager',
       u.shop_id, u.id, u.name, u.role, u.is_active
  FROM users u
 WHERE u.role = 'CASHIER'
   AND u.is_active = true
   AND u.shop_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM users m
      WHERE m.role = 'MANAGER' AND m.is_active = true AND m.shop_id = u.shop_id
   );

GRANT SELECT ON rbac_assignment_violations TO authenticated;
