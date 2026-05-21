-- ============================================================
-- Migration 003: Identity-aware SQL helper functions
-- These are building blocks for the locked-down RLS policies and
-- transactional RPCs added in later steps. This migration ONLY adds
-- helper functions — it does NOT change any RLS policy or table grant.
-- Run AFTER 001_identity_linking.sql and 002_rbac_permissions.sql.
-- ============================================================

-- The app `users` row for the currently authenticated Supabase user.
-- SECURITY DEFINER so it can be called from RLS policies on other tables
-- without recursing through users' own RLS.
CREATE OR REPLACE FUNCTION current_app_user()
RETURNS users
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM users
  WHERE auth_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

-- Role of the current app user (NULL if unauthenticated / no profile).
CREATE OR REPLACE FUNCTION app_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM users
  WHERE auth_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

-- Assigned shop of the current app user (NULL for ADMIN / unassigned).
CREATE OR REPLACE FUNCTION app_shop_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT shop_id FROM users
  WHERE auth_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

-- Whether the current app user holds an effective permission:
--   effective = (role defaults UNION granted) EXCEPT revoked
CREATE OR REPLACE FUNCTION app_has_perm(p_perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.auth_id = auth.uid()
      AND u.is_active = true
      AND p_perm IN (
        SELECT unnest(role_default_permissions(u.role))
        UNION
        SELECT unnest(COALESCE(u.granted_permissions, ARRAY[]::text[]))
        EXCEPT
        SELECT unnest(COALESCE(u.revoked_permissions, ARRAY[]::text[]))
      )
  );
$$;

-- Permission AND shop scope. ADMIN spans all shops; everyone else is limited
-- to their assigned shop. Use for shop-scoped RLS / RPC checks.
CREATE OR REPLACE FUNCTION app_can_for_shop(p_perm text, p_shop_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT app_has_perm(p_perm)
     AND (app_role() = 'ADMIN' OR app_shop_id() IS NOT DISTINCT FROM p_shop_id);
$$;

-- Allow authenticated clients to call the helpers.
GRANT EXECUTE ON FUNCTION current_app_user()                 TO authenticated;
GRANT EXECUTE ON FUNCTION app_role()                         TO authenticated;
GRANT EXECUTE ON FUNCTION app_shop_id()                      TO authenticated;
GRANT EXECUTE ON FUNCTION app_has_perm(text)                 TO authenticated;
GRANT EXECUTE ON FUNCTION app_can_for_shop(text, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION role_default_permissions(text)     TO authenticated;
