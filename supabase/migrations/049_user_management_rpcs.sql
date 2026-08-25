-- ============================================================
-- Migration 049: User management RPCs + atomic manager replacement
--
-- create_app_user / update_app_user / deactivate_app_user wrap the
-- `public.users` writes UsersPage.tsx currently does directly, adding a
-- permission check with a friendly error, an audit row per call, and (for
-- update) a per-field change list — same shape as migration 048's
-- create_supplier/update_supplier. These do NOT touch Supabase Auth
-- account creation (`supabase.auth.signUp`) — that's a GoTrue API call a
-- SQL function can't make, so it stays client-side; UsersPage.tsx calls
-- create_app_user AFTER signUp succeeds, exactly like it calls addUser()
-- today. Migration 020's assignment-rule trigger and 047's privilege-
-- column guard are UNCHANGED and still fire on every write through these
-- RPCs, since they're real INSERT/UPDATE statements underneath.
--
-- replace_manager(p_shop_id, p_new_manager_id) is the harder piece: today
-- swapping a shop's manager while it has active cashiers is a manual
-- two-step dance (see 05-roles-permissions.md "Manager replacement")
-- because activating a second manager for one moment collides with
-- `users_one_active_manager_per_shop`, and deactivating the old one first
-- is blocked by 020's own safety trigger until a replacement is already
-- active — a real deadlock between the two protections.
--
-- Fix, verified against a real rolled-back transaction before writing
-- this file (see conversation): `users_one_active_manager_per_shop` was a
-- plain unique index, checked immediately per statement, not deferrable.
-- A **partial** unique index cannot be converted straight to a deferrable
-- CONSTRAINT via `ADD CONSTRAINT ... USING INDEX` (Postgres rejects
-- partial indexes there) — the fix is a DEFERRABLE EXCLUDE constraint
-- instead, which does support a WHERE predicate. Two things were
-- confirmed empirically, not assumed:
--   1. A single multi-row UPDATE that swaps both rows in one statement
--      does NOT work here — 020's trigger does a live `EXISTS` subquery
--      for "is a replacement already active", and a row-level BEFORE
--      trigger's query does not see another row's change from later in
--      the SAME statement, so it still raises the "only manager" error.
--   2. Two SEPARATE statements (activate the new manager first, THEN
--      deactivate the old one) works correctly: statement 2 runs with a
--      fresh snapshot that sees statement 1's already-applied change, so
--      the trigger's replacement check passes, and the deferred EXCLUDE
--      constraint (checked at transaction end, not per-statement) never
--      sees the two-active-managers moment in between.
--
-- `users_one_active_manager_per_shop`'s error code changes from 23505
-- (unique_violation) to 23P01 (exclusion_violation) — userFormErrors.ts
-- is updated in the same commit as this migration to still map it.
--
-- Run AFTER 001-048. Idempotent (CREATE OR REPLACE for functions; the
-- index/constraint swap uses IF EXISTS / a DO block so a re-run is safe).
-- ============================================================

-- ============================================================
-- 1. Make the one-active-manager-per-shop rule deferrable.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_one_active_manager_per_shop'
  ) THEN
    RETURN; -- already converted by a previous run of this migration
  END IF;
  DROP INDEX IF EXISTS users_one_active_manager_per_shop;
  ALTER TABLE users ADD CONSTRAINT users_one_active_manager_per_shop
    EXCLUDE USING btree (shop_id WITH =) WHERE (role = 'MANAGER' AND is_active)
    DEFERRABLE INITIALLY DEFERRED;
END;
$$;

-- ============================================================
-- 2. create_app_user / update_app_user / deactivate_app_user
-- ============================================================

CREATE OR REPLACE FUNCTION create_app_user(
  p_id                  text,
  p_name                text,
  p_email               text,
  p_role                text,
  p_shop_id             text,
  p_auth_id             uuid,
  p_granted_permissions text[] DEFAULT NULL,
  p_revoked_permissions text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user     users;
  v_now      timestamptz := now();
  v_audit_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT app_has_perm('user:create') THEN
    RAISE EXCEPTION 'You are not permitted to create users';
  END IF;
  IF p_id IS NULL OR p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'User id and name are required';
  END IF;

  INSERT INTO users (
    id, name, email, role, shop_id, auth_id,
    granted_permissions, revoked_permissions, is_active, created_at
  )
  VALUES (
    p_id, p_name, p_email, p_role, p_shop_id, p_auth_id,
    p_granted_permissions, p_revoked_permissions, true, v_now
  );

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, p_shop_id, v_user.id, 'USER_CREATED',
    'User ' || p_name || ' (' || p_role || ') created', 'User', p_id, v_now);

  RETURN jsonb_build_object(
    'id', p_id, 'name', p_name, 'email', p_email, 'role', p_role, 'shopId', p_shop_id,
    'authId', p_auth_id, 'grantedPermissions', p_granted_permissions,
    'revokedPermissions', p_revoked_permissions, 'isActive', true, 'createdAt', v_now
  );
END;
$$;

CREATE OR REPLACE FUNCTION update_app_user(
  p_id                  text,
  p_name                text,
  p_role                text,
  p_shop_id             text,
  p_granted_permissions text[] DEFAULT NULL,
  p_revoked_permissions text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user     users;
  v_old      users;
  v_new      users;
  v_now      timestamptz := now();
  v_audit_id text;
  v_changes  text[] := '{}';
  v_msg      text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT app_has_perm('user:update') THEN
    RAISE EXCEPTION 'You are not permitted to update users';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'User name is required';
  END IF;

  SELECT * INTO v_old FROM users WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  IF v_old.name IS DISTINCT FROM p_name THEN v_changes := array_append(v_changes, 'name'); END IF;
  IF v_old.role IS DISTINCT FROM p_role THEN v_changes := array_append(v_changes, 'role'); END IF;
  IF v_old.shop_id IS DISTINCT FROM p_shop_id THEN v_changes := array_append(v_changes, 'shop'); END IF;
  IF v_old.granted_permissions IS DISTINCT FROM p_granted_permissions THEN
    v_changes := array_append(v_changes, 'granted permissions');
  END IF;
  IF v_old.revoked_permissions IS DISTINCT FROM p_revoked_permissions THEN
    v_changes := array_append(v_changes, 'revoked permissions');
  END IF;

  UPDATE users
     SET name = p_name, role = p_role, shop_id = p_shop_id,
         granted_permissions = p_granted_permissions, revoked_permissions = p_revoked_permissions
   WHERE id = p_id
   RETURNING * INTO v_new;

  v_msg := 'User ' || v_new.name
           || CASE WHEN array_length(v_changes, 1) > 0
                THEN '. Changed: ' || array_to_string(v_changes, ', ')
                ELSE ' updated (no field changes)' END;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_new.shop_id, v_user.id, 'USER_UPDATED', v_msg, 'User', v_new.id, v_now);

  RETURN jsonb_build_object(
    'id', v_new.id, 'name', v_new.name, 'email', v_new.email, 'role', v_new.role,
    'shopId', v_new.shop_id, 'authId', v_new.auth_id,
    'grantedPermissions', v_new.granted_permissions, 'revokedPermissions', v_new.revoked_permissions,
    'isActive', v_new.is_active, 'createdAt', v_new.created_at
  );
END;
$$;

-- p_is_active is the target state, not a toggle — the caller (UsersPage's
-- handleToggleActive) computes !user.isActive today; keeping that logic
-- client-side and passing the target avoids a check-then-act race.
CREATE OR REPLACE FUNCTION deactivate_app_user(
  p_id        text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user     users;
  v_target   users;
  v_now      timestamptz := now();
  v_audit_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT app_has_perm('user:update') THEN
    RAISE EXCEPTION 'You are not permitted to change user status';
  END IF;

  SELECT * INTO v_target FROM users WHERE id = p_id FOR UPDATE;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  UPDATE users SET is_active = p_is_active WHERE id = p_id
    RETURNING * INTO v_target;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_target.shop_id, v_user.id,
    CASE WHEN p_is_active THEN 'USER_ACTIVATED' ELSE 'USER_DEACTIVATED' END,
    'User ' || v_target.name || CASE WHEN p_is_active THEN ' activated' ELSE ' deactivated' END,
    'User', v_target.id, v_now);

  RETURN jsonb_build_object('id', v_target.id, 'isActive', v_target.is_active);
END;
$$;

-- ============================================================
-- 3. replace_manager — atomic manager swap.
-- ============================================================
CREATE OR REPLACE FUNCTION replace_manager(
  p_shop_id        text,
  p_new_manager_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user        users;
  v_old_manager users;
  v_new_manager users;
  v_now         timestamptz := now();
  v_audit_id    text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT app_has_perm('user:update') THEN
    RAISE EXCEPTION 'You are not permitted to change shop managers';
  END IF;

  PERFORM 1 FROM shops WHERE id = p_shop_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shop not found'; END IF;

  SELECT * INTO v_new_manager FROM users WHERE id = p_new_manager_id FOR UPDATE;
  IF v_new_manager.id IS NULL THEN RAISE EXCEPTION 'New manager not found'; END IF;

  SELECT * INTO v_old_manager FROM users
   WHERE role = 'MANAGER' AND is_active = true AND shop_id = p_shop_id
   FOR UPDATE;

  IF v_old_manager.id = v_new_manager.id THEN
    RAISE EXCEPTION 'This user is already the manager of this shop';
  END IF;

  -- Statement 1: activate the new manager. Momentarily leaves two active
  -- managers for this shop if one already existed — safe only because
  -- users_one_active_manager_per_shop is DEFERRABLE (section 1 above);
  -- re-checked at this function's implicit transaction commit.
  UPDATE users SET role = 'MANAGER', shop_id = p_shop_id, is_active = true
   WHERE id = v_new_manager.id
   RETURNING * INTO v_new_manager;

  -- Statement 2, separate on purpose: 020's trigger does a live check for
  -- "is a replacement already active" when deactivating the shop's only
  -- manager — it only sees statement 1's change because this is a fresh
  -- statement, not folded into one multi-row UPDATE (verified; see the
  -- file header comment for why the combined form doesn't work).
  IF v_old_manager.id IS NOT NULL THEN
    UPDATE users SET is_active = false WHERE id = v_old_manager.id;
  END IF;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, p_shop_id, v_user.id, 'MANAGER_REPLACED',
    'Manager for shop replaced: ' || COALESCE(v_old_manager.name, '(none)') || ' -> ' || v_new_manager.name,
    'User', v_new_manager.id, v_now);

  RETURN jsonb_build_object(
    'newManagerId', v_new_manager.id,
    'oldManagerId', v_old_manager.id
  );
END;
$$;

-- ============================================================
-- Grants
-- ============================================================
REVOKE ALL ON FUNCTION create_app_user(text, text, text, text, text, uuid, text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_app_user(text, text, text, text, text[], text[])              FROM PUBLIC;
REVOKE ALL ON FUNCTION deactivate_app_user(text, boolean)                                    FROM PUBLIC;
REVOKE ALL ON FUNCTION replace_manager(text, text)                                           FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_app_user(text, text, text, text, text, uuid, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION update_app_user(text, text, text, text, text[], text[])              TO authenticated;
GRANT EXECUTE ON FUNCTION deactivate_app_user(text, boolean)                                    TO authenticated;
GRANT EXECUTE ON FUNCTION replace_manager(text, text)                                           TO authenticated;
