-- ============================================================
-- Migration 048: Supplier create/update RPCs
-- Moves direct suppliers table writes (addSupplier / updateSupplier in
-- dataSlice) into SECURITY DEFINER RPCs so permission checks and the
-- SUPPLIER_CREATED / SUPPLIER_UPDATED audit trail live in the database
-- instead of the client. Suppliers are a global entity (no shop_id), so
-- app_can_for_shop() is not used and audit_logs.shop_id is NULL.
-- Run AFTER 001-047. Idempotent (CREATE OR REPLACE).
-- ============================================================

-- create_supplier ------------------------------------------------
CREATE OR REPLACE FUNCTION create_supplier(
  p_code           text,
  p_name           text,
  p_contact_person text DEFAULT NULL,
  p_phone          text DEFAULT NULL,
  p_email          text DEFAULT NULL,
  p_address        text DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user        users;
  v_supplier_id text := 'supplier-' || replace(gen_random_uuid()::text, '-', '');
  v_now         timestamptz := now();
  v_audit_id    text;
  v_msg         text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT app_has_perm('supplier:create') THEN
    RAISE EXCEPTION 'You are not permitted to create suppliers';
  END IF;

  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RAISE EXCEPTION 'Supplier code is required';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Supplier name is required';
  END IF;

  INSERT INTO suppliers (
    id, code, name, contact_person, phone, email, address, notes, is_active, created_at
  )
  VALUES (
    v_supplier_id, p_code, p_name, p_contact_person, p_phone, p_email, p_address, p_notes,
    true, v_now
  );

  v_msg := 'Supplier ' || p_code || ' (' || p_name || ') created';
  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, NULL, v_user.id, 'SUPPLIER_CREATED', v_msg, 'Supplier', v_supplier_id, v_now);

  RETURN jsonb_build_object(
    'supplier', jsonb_build_object(
      'id', v_supplier_id, 'code', p_code, 'name', p_name, 'contactPerson', p_contact_person,
      'phone', p_phone, 'email', p_email, 'address', p_address, 'notes', p_notes,
      'isActive', true, 'createdAt', v_now, 'updatedAt', v_now),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', NULL, 'actorId', v_user.id, 'actionType', 'SUPPLIER_CREATED',
      'message', v_msg, 'entityType', 'Supplier', 'entityId', v_supplier_id, 'createdAt', v_now))
  );
END;
$$;

-- update_supplier --------------------------------------------------
-- p_is_active is nullable so the RPC also covers the activate/deactivate
-- toggle on SuppliersPage, which round-trips the full row with only
-- isActive flipped.
CREATE OR REPLACE FUNCTION update_supplier(
  p_id             text,
  p_code           text,
  p_name           text,
  p_contact_person text DEFAULT NULL,
  p_phone          text DEFAULT NULL,
  p_email          text DEFAULT NULL,
  p_address        text DEFAULT NULL,
  p_notes          text DEFAULT NULL,
  p_is_active      boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user      users;
  v_old       suppliers;
  v_new       suppliers;
  v_now       timestamptz := now();
  v_audit_id  text;
  v_changes   text[] := '{}';
  v_msg       text;
  v_is_active boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT app_has_perm('supplier:update') THEN
    RAISE EXCEPTION 'You are not permitted to update suppliers';
  END IF;

  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RAISE EXCEPTION 'Supplier code is required';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Supplier name is required';
  END IF;

  SELECT * INTO v_old FROM suppliers WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Supplier not found'; END IF;

  v_is_active := COALESCE(p_is_active, v_old.is_active);

  -- array_append(), not `||` — `text[] || 'literal'` is ambiguous between
  -- the array-concat and element-append overloads and Postgres resolves it
  -- by trying to parse the untyped literal AS an array literal, raising
  -- "malformed array literal" (verified against a real database: every
  -- branch below failed until switched to array_append).
  IF v_old.code IS DISTINCT FROM p_code THEN v_changes := array_append(v_changes, 'code'); END IF;
  IF v_old.name IS DISTINCT FROM p_name THEN v_changes := array_append(v_changes, 'name'); END IF;
  IF v_old.contact_person IS DISTINCT FROM p_contact_person THEN v_changes := array_append(v_changes, 'contact person'); END IF;
  IF v_old.phone IS DISTINCT FROM p_phone THEN v_changes := array_append(v_changes, 'phone'); END IF;
  IF v_old.email IS DISTINCT FROM p_email THEN v_changes := array_append(v_changes, 'email'); END IF;
  IF v_old.address IS DISTINCT FROM p_address THEN v_changes := array_append(v_changes, 'address'); END IF;
  IF v_old.notes IS DISTINCT FROM p_notes THEN v_changes := array_append(v_changes, 'notes'); END IF;
  IF v_old.is_active IS DISTINCT FROM v_is_active THEN
    v_changes := array_append(v_changes, CASE WHEN v_is_active THEN 'activated' ELSE 'deactivated' END);
  END IF;

  UPDATE suppliers
     SET code = p_code, name = p_name, contact_person = p_contact_person, phone = p_phone,
         email = p_email, address = p_address, notes = p_notes, is_active = v_is_active
   WHERE id = p_id
   RETURNING * INTO v_new;

  v_msg := 'Supplier ' || v_new.code || ' (' || v_new.name || ') updated'
           || CASE WHEN array_length(v_changes, 1) > 0
                THEN '. Changed: ' || array_to_string(v_changes, ', ')
                ELSE '' END;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, NULL, v_user.id, 'SUPPLIER_UPDATED', v_msg, 'Supplier', v_new.id, v_now);

  RETURN jsonb_build_object(
    'supplier', jsonb_build_object(
      'id', v_new.id, 'code', v_new.code, 'name', v_new.name, 'contactPerson', v_new.contact_person,
      'phone', v_new.phone, 'email', v_new.email, 'address', v_new.address, 'notes', v_new.notes,
      'isActive', v_new.is_active, 'createdAt', v_new.created_at),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', NULL, 'actorId', v_user.id, 'actionType', 'SUPPLIER_UPDATED',
      'message', v_msg, 'entityType', 'Supplier', 'entityId', v_new.id, 'createdAt', v_now))
  );
END;
$$;

-- ============================================================
-- Grants
-- ============================================================
REVOKE ALL ON FUNCTION create_supplier(text, text, text, text, text, text, text)              FROM PUBLIC;
REVOKE ALL ON FUNCTION update_supplier(text, text, text, text, text, text, text, text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_supplier(text, text, text, text, text, text, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION update_supplier(text, text, text, text, text, text, text, text, boolean) TO authenticated;
