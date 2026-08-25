-- ============================================================
-- Migration 051: Harden log_audit_event against forgery
--
-- Flagged in docs/09-roadmap-todo.md: log_audit_event had no permission
-- check and no verification that p_shop_id matched anything real, so any
-- authenticated user could call the RPC directly (bypassing the UI) and
-- insert an audit_logs row with an arbitrary action_type/message for any
-- shop, self-attributed (actor_id is forced to the caller, so it can't be
-- used to frame another user, but it could still pollute/spoof the trail
-- for a shop the caller has nothing to do with).
--
-- Every real caller (src/stores/data/slices/auditSlice.ts, called from
-- UnitTypesPage/ProductFormPage/ProductsManagePage) uses one of 7 action
-- types for the global product/category/unit-type catalog, and always
-- passes shop_id as null. Fix: allow-list those action types, require the
-- permission that already gates the corresponding UI action, and ignore
-- any caller-supplied shop_id (force NULL) since no legitimate use is
-- shop-scoped.
-- Run AFTER 001-050. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION log_audit_event(
  p_action_type text,
  p_message     text,
  p_entity_type text,
  p_entity_id   text,
  p_shop_id     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_now timestamptz := now();
  v_audit_id text := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  v_required_perm text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Allow-list of legitimate action types, mapped to the same permission
  -- that already gates the UI action producing them (see
  -- src/lib/permissions.ts: adminProductCreate/Edit/adminUnitTypes).
  v_required_perm := CASE p_action_type
    WHEN 'PRODUCT_CREATE'   THEN 'product:create'
    WHEN 'PRODUCT_IMPORT'   THEN 'product:create'
    WHEN 'PRODUCT_EDIT'     THEN 'product:update'
    WHEN 'PRODUCT_DELETE'   THEN 'product:delete'
    WHEN 'CATEGORY_CREATE'  THEN 'product:create'
    WHEN 'CATEGORY_EDIT'    THEN 'product:update'
    WHEN 'CATEGORY_DELETE'  THEN 'product:delete'
    ELSE NULL
  END;

  IF v_required_perm IS NULL THEN
    RAISE EXCEPTION 'Unsupported audit action type: %', p_action_type;
  END IF;

  IF NOT app_has_perm(v_required_perm) THEN
    RAISE EXCEPTION 'You are not permitted to record this audit event';
  END IF;

  -- Every allow-listed action type above is a global catalog entity (no
  -- shop scope) — never trust a caller-supplied shop_id, always record NULL.
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, NULL, v_user.id, p_action_type, p_message, p_entity_type, p_entity_id, v_now);

  RETURN jsonb_build_object('auditLog', jsonb_build_object(
    'id', v_audit_id, 'shopId', NULL, 'actorId', v_user.id, 'actionType', p_action_type,
    'message', p_message, 'entityType', p_entity_type, 'entityId', p_entity_id, 'createdAt', v_now));
END;
$$;

REVOKE ALL ON FUNCTION log_audit_event(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_audit_event(text, text, text, text, text) TO authenticated;
