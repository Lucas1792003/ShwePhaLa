-- ============================================================
-- Migration 009: Transactional shift open / close RPCs
-- Moves shift lifecycle writes into authenticated, permission-checked
-- SECURITY DEFINER functions.
-- Run AFTER 001-008. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS variance_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'shifts_one_open_per_cashier_shop'
  ) THEN
    IF EXISTS (
      SELECT 1
        FROM shifts
       WHERE ended_at IS NULL
       GROUP BY cashier_id, shop_id
      HAVING count(*) > 1
    ) THEN
      RAISE NOTICE 'Skipped shifts_one_open_per_cashier_shop: duplicate open shifts per cashier/shop exist.';
    ELSE
      CREATE UNIQUE INDEX shifts_one_open_per_cashier_shop
        ON shifts (cashier_id, shop_id)
        WHERE ended_at IS NULL;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION open_shift(
  p_shop_id text,
  p_opening_cash_mmk integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid   uuid := auth.uid();
  v_user       users;
  v_shop       shops;
  v_shift      shifts;
  v_shift_id   text := 'shift-' || replace(gen_random_uuid()::text, '-', '');
  v_now        timestamptz := now();
  v_audit_id   text;
  v_audit_logs jsonb := '[]'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_shop_id IS NULL OR btrim(p_shop_id) = '' THEN
    RAISE EXCEPTION 'Shop is required';
  END IF;

  IF p_opening_cash_mmk IS NULL OR p_opening_cash_mmk < 0 THEN
    RAISE EXCEPTION 'Opening cash must be zero or greater';
  END IF;

  SELECT * INTO v_shop FROM shops WHERE id = p_shop_id AND is_active = true;
  IF v_shop.id IS NULL THEN
    RAISE EXCEPTION 'Shop not found or inactive';
  END IF;

  IF NOT (
    app_can_for_shop('shift:manage_own', p_shop_id)
    OR app_can_for_shop('shift:manage_all', p_shop_id)
  ) THEN
    RAISE EXCEPTION 'You are not permitted to open shifts in this shop';
  END IF;

  -- Serialize open attempts for this cashier so the global-open-shift rule is
  -- reliable even across different shops.
  PERFORM pg_advisory_xact_lock(hashtext('open_shift:' || v_user.id));

  IF EXISTS (
    SELECT 1
      FROM shifts
     WHERE cashier_id = v_user.id AND ended_at IS NULL
     FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'This cashier already has an open shift';
  END IF;

  INSERT INTO shifts (
    id, shop_id, cashier_id, started_at, opening_cash_mmk
  )
  VALUES (
    v_shift_id, p_shop_id, v_user.id, v_now, p_opening_cash_mmk
  )
  RETURNING * INTO v_shift;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, p_shop_id, v_user.id, 'SHIFT_OPENED',
    'Opened shift with opening cash ' || p_opening_cash_mmk || ' MMK',
    'Shift', v_shift.id, v_now
  );

  v_audit_logs := v_audit_logs || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id,
    'shopId', p_shop_id,
    'actorId', v_user.id,
    'actionType', 'SHIFT_OPENED',
    'message', 'Opened shift with opening cash ' || p_opening_cash_mmk || ' MMK',
    'entityType', 'Shift',
    'entityId', v_shift.id,
    'createdAt', v_now
  ));

  RETURN jsonb_build_object(
    'shift', jsonb_build_object(
      'id', v_shift.id,
      'shopId', v_shift.shop_id,
      'cashierId', v_shift.cashier_id,
      'startedAt', v_shift.started_at,
      'endedAt', v_shift.ended_at,
      'openingCashMmk', v_shift.opening_cash_mmk,
      'closingCashMmk', v_shift.closing_cash_mmk,
      'expectedCashMmk', v_shift.expected_cash_mmk,
      'varianceMmk', v_shift.variance_mmk,
      'varianceReason', v_shift.variance_reason
    ),
    'auditLogs', v_audit_logs
  );
END;
$$;

CREATE OR REPLACE FUNCTION close_shift(
  p_shift_id text,
  p_closing_cash_mmk integer,
  p_variance_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid      uuid := auth.uid();
  v_user          users;
  v_shift         shifts;
  v_now           timestamptz := now();
  v_cash_sales    integer := 0;
  v_cash_refunds  integer := 0;
  v_expected_cash integer;
  v_variance      integer;
  v_audit_id      text;
  v_audit_logs    jsonb := '[]'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_shift_id IS NULL OR btrim(p_shift_id) = '' THEN
    RAISE EXCEPTION 'Shift is required';
  END IF;

  IF p_closing_cash_mmk IS NULL OR p_closing_cash_mmk < 0 THEN
    RAISE EXCEPTION 'Closing cash must be zero or greater';
  END IF;

  SELECT * INTO v_shift
    FROM shifts
   WHERE id = p_shift_id
   FOR UPDATE;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  IF v_shift.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Shift is already closed';
  END IF;

  IF NOT (
    (v_shift.cashier_id = v_user.id AND app_can_for_shop('shift:manage_own', v_shift.shop_id))
    OR app_can_for_shop('shift:manage_all', v_shift.shop_id)
  ) THEN
    RAISE EXCEPTION 'You are not permitted to close this shift';
  END IF;

  SELECT COALESCE(sum(total_mmk), 0) INTO v_cash_sales
    FROM sales
   WHERE shift_id = v_shift.id
     AND payment_method = 'CASH'
     AND status <> 'VOID';

  SELECT COALESCE(sum((COALESCE(item->>'amountMmk', item->>'amount_mmk'))::integer), 0)
    INTO v_cash_refunds
    FROM refund_void_requests r
    JOIN sales s ON s.id = r.sale_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items, '[]'::jsonb)) item
   WHERE s.shift_id = v_shift.id
     AND s.payment_method = 'CASH'
     AND r.type = 'PARTIAL'
     AND r.status = 'APPROVED';

  v_expected_cash := v_shift.opening_cash_mmk + v_cash_sales - v_cash_refunds;
  v_variance := p_closing_cash_mmk - v_expected_cash;

  IF v_variance <> 0 AND COALESCE(btrim(p_variance_reason), '') = '' THEN
    RAISE EXCEPTION 'Variance reason is required when closing cash does not match expected cash';
  END IF;

  UPDATE shifts
     SET ended_at = v_now,
         closing_cash_mmk = p_closing_cash_mmk,
         expected_cash_mmk = v_expected_cash,
         variance_mmk = v_variance,
         variance_reason = NULLIF(btrim(p_variance_reason), '')
   WHERE id = v_shift.id
   RETURNING * INTO v_shift;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, v_shift.shop_id, v_user.id, 'SHIFT_CLOSED',
    'Closed shift. Expected cash ' || v_expected_cash || ' MMK, closing cash '
      || p_closing_cash_mmk || ' MMK, variance ' || v_variance || ' MMK',
    'Shift', v_shift.id, v_now
  );

  v_audit_logs := v_audit_logs || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id,
    'shopId', v_shift.shop_id,
    'actorId', v_user.id,
    'actionType', 'SHIFT_CLOSED',
    'message', 'Closed shift. Expected cash ' || v_expected_cash || ' MMK, closing cash '
      || p_closing_cash_mmk || ' MMK, variance ' || v_variance || ' MMK',
    'entityType', 'Shift',
    'entityId', v_shift.id,
    'createdAt', v_now
  ));

  RETURN jsonb_build_object(
    'shift', jsonb_build_object(
      'id', v_shift.id,
      'shopId', v_shift.shop_id,
      'cashierId', v_shift.cashier_id,
      'startedAt', v_shift.started_at,
      'endedAt', v_shift.ended_at,
      'openingCashMmk', v_shift.opening_cash_mmk,
      'closingCashMmk', v_shift.closing_cash_mmk,
      'expectedCashMmk', v_shift.expected_cash_mmk,
      'varianceMmk', v_shift.variance_mmk,
      'varianceReason', v_shift.variance_reason
    ),
    'auditLogs', v_audit_logs
  );
END;
$$;

REVOKE ALL ON FUNCTION open_shift(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION close_shift(text, integer, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION open_shift(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION close_shift(text, integer, text) TO authenticated;
