-- ============================================================
-- Migration 047: block non-admins from changing privilege-bearing
-- columns on `users`, even when they hold `user:update`/`user:create`.
--
-- `users_upd` (migration 010) gates UPDATE on the `user:update`
-- PERMISSION, not a hardcoded role check — inert today since only ADMIN
-- holds that permission by default, but the RBAC system is explicitly
-- built to let an ADMIN delegate individual permissions to a MANAGER. The
-- moment `user:update` is ever delegated, the delegate could run a single
-- UPDATE setting `granted_permissions` to include every ADMIN-level
-- permission (or flip their own `role` to ADMIN outright) — a silent
-- full-admin backdoor hiding behind what looks like a narrow grant.
-- `users_ins` has the same shape: `user:create` (a far more plausible
-- permission to delegate — "let this manager onboard new staff") has no
-- column-level restriction either, so a delegate could INSERT a brand
-- new row with role='ADMIN', or with granted_permissions overrides, and
-- hand themselves (or an accomplice) elevated access that way instead.
--
-- Why a trigger instead of extending the RLS policy: the client always
-- resends the full user object on every save (role, permissions, is_active
-- included, whether or not they actually changed — see updateUser() in
-- shopSlice.ts) — a plain RLS `WITH CHECK` can't compare OLD vs NEW values
-- for an UPDATE, only validate the NEW row in isolation. A BEFORE trigger
-- has both OLD and NEW and can reject a REAL change to a sensitive column
-- while leaving no-op resends and genuine non-privilege edits (name,
-- email, shop assignment) untouched.
--
-- Scope, deliberately narrow: only `role`, `granted_permissions`,
-- `revoked_permissions`, and the deprecated legacy `permissions` column
-- are guarded — these are the only columns that can grant capability.
-- `is_active` is NOT guarded: deactivating/reactivating a user doesn't
-- grant anything (a deactivated caller's own `app_has_perm()`/`app_role()`
-- checks already fail immediately, since both require `is_active = true`
-- on the CALLER's own row — self-reactivation-by-a-deactivated-user is
-- already impossible), and blocking it would remove a reasonable future
-- delegation (a manager suspending their own cashier) for no security
-- benefit.
--
-- The very first user (bootstrap) is exempted from the INSERT guard,
-- mirroring `users_ins`'s own `OR NOT EXISTS (SELECT 1 FROM users)`
-- escape hatch — otherwise no one could ever create the first ADMIN.
--
-- A genuine ADMIN is completely unaffected either way — this only ever
-- rejects a change attempted by a non-ADMIN caller.
--
-- Idempotent. Run AFTER 001-046.
-- ============================================================

CREATE OR REPLACE FUNCTION guard_user_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_caller_role text := app_role();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM users) THEN
      RETURN NEW; -- first-ever user: legitimate self-bootstrap as ADMIN.
    END IF;
    IF v_caller_role IS DISTINCT FROM 'ADMIN' THEN
      IF NEW.role = 'ADMIN'
         OR NEW.granted_permissions IS NOT NULL
         OR NEW.revoked_permissions IS NOT NULL
         OR NEW.permissions IS NOT NULL
      THEN
        RAISE EXCEPTION 'Only an ADMIN can create a user with an elevated role or custom permission overrides.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.granted_permissions IS DISTINCT FROM OLD.granted_permissions
      OR NEW.revoked_permissions IS DISTINCT FROM OLD.revoked_permissions
      OR NEW.permissions IS DISTINCT FROM OLD.permissions)
     AND v_caller_role IS DISTINCT FROM 'ADMIN'
  THEN
    RAISE EXCEPTION 'Only an ADMIN can change role or permission overrides.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_privilege_columns ON users;
CREATE TRIGGER users_guard_privilege_columns
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION guard_user_privilege_columns();
