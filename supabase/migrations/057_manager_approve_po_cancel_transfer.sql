-- ============================================================
-- Migration 057: MANAGER gets purchase:approve + transfer:cancel
--
-- Flagged during the 2026-08-25 live verification pass and confirmed with
-- the business owner: MANAGER had purchase:create/purchase:receive but not
-- purchase:approve, and transfer:create/transfer:approve but not
-- transfer:cancel — only ADMIN held those two, making the single ADMIN
-- account a hard bottleneck. Concretely: a BUYER (or MANAGER) creates a PO,
-- goods physically arrive, but nothing can be logged as received stock
-- until the PO is APPROVED — which required the ADMIN login specifically.
--
-- Decision: grant both to MANAGER, but treat them differently —
--   - purchase:approve gets a self-approval guard (this migration), same
--     shape as migration 053's refund/void fix: a MANAGER can now approve
--     a BUYER's (or another manager's) PO, but not their own. This still
--     requires ADMIN for the "manager creates their own PO" case, which is
--     correct maker-checker behavior, not a regression.
--   - transfer:cancel gets NO self-guard. Canceling is an undo on an
--     internal stock movement the manager already has full visibility
--     into (not an external financial commitment like a PO) — requiring a
--     second person to undo your own mistake is friction with no real
--     security benefit here.
--
-- Run AFTER 001-056. Idempotent (CREATE OR REPLACE for the function;
-- role_default_permissions is a pure lookup, safe to redefine).
-- ============================================================

-- ============================================================
-- 1. Grant the two permissions to MANAGER's role defaults.
-- ============================================================
CREATE OR REPLACE FUNCTION role_default_permissions(p_role text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE upper(p_role)
    WHEN 'ADMIN' THEN ARRAY[
      'shop:create','shop:read','shop:update','shop:delete',
      'user:create','user:read','user:update','user:delete',
      'product:create','product:read','product:update','product:delete','product:edit_price','barcode:manage',
      'inventory:view_stock','inventory:view_movements','inventory:adjust','inventory:damage','inventory:override_negative',
      'transfer:create','transfer:approve','transfer:cancel','transfer:view',
      'pos:create_sale','pos:apply_discount','pos:override_price','pos:override_stock',
      'pos:void_sale','pos:refund','pos:request_refund','pos:request_void',
      'sale:view','sales:view_own_shift','receipt:reprint',
      'supplier:create','supplier:read','supplier:update','supplier:delete',
      'supplier:debt_view','supplier:payment_create',
      'purchase:create','purchase:approve','purchase:receive','purchase:view',
      'pricing:manage','approval:view',
      'shift:manage_own','shift:manage_all','shift:verify',
      'report:own_shift','report:shop_sales','report:shop_inventory','report:shop_profit','report:global',
      'audit:view_shop','audit:view_global'
    ]
    WHEN 'MANAGER' THEN ARRAY[
      'shop:read','user:read',
      'product:read','product:update','product:edit_price',
      'inventory:view_stock','inventory:view_movements','inventory:adjust','inventory:damage','inventory:override_negative',
      'transfer:create','transfer:approve','transfer:cancel','transfer:view',
      'pos:create_sale','pos:apply_discount','pos:override_price','pos:override_stock',
      'pos:void_sale','pos:refund','pos:request_refund','pos:request_void',
      'sale:view','sales:view_own_shift','receipt:reprint',
      'supplier:read','supplier:debt_view','supplier:payment_create',
      'purchase:create','purchase:approve','purchase:receive','purchase:view','approval:view',
      'shift:manage_own','shift:manage_all','shift:verify',
      'report:own_shift','report:shop_sales','report:shop_inventory',
      'audit:view_shop'
    ]
    WHEN 'CASHIER' THEN ARRAY[
      'product:read','inventory:view_stock',
      'pos:create_sale','pos:apply_discount','pos:request_refund','pos:request_void',
      'sales:view_own_shift','receipt:reprint',
      'shift:manage_own','report:own_shift'
    ]
    WHEN 'BUYER' THEN ARRAY[
      'product:read','supplier:read','supplier:debt_view','purchase:view','purchase:create'
    ]
    ELSE ARRAY[]::text[]
  END;
$$;

GRANT EXECUTE ON FUNCTION role_default_permissions(text) TO authenticated;

-- ============================================================
-- 2. Self-approval guard on approve_purchase_order. Full body copied
--    unchanged from migration 012 with one guard added, same
--    DROP-then-CREATE-OR-REPLACE-compatible pattern as migration 053.
-- ============================================================
CREATE OR REPLACE FUNCTION approve_purchase_order(p_purchase_order_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_po purchase_orders; v_now timestamptz := now(); v_audit_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_po.status NOT IN ('DRAFT', 'SUBMITTED') THEN
    RAISE EXCEPTION 'Purchase order cannot be approved from status %', v_po.status;
  END IF;
  IF NOT app_can_for_shop('purchase:approve', v_po.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to approve purchase orders for this shop';
  END IF;
  IF v_po.created_by = v_user.id THEN
    RAISE EXCEPTION 'You cannot approve your own purchase order';
  END IF;

  UPDATE purchase_orders
     SET status = 'APPROVED', approved_by = v_user.id, approved_at = v_now
   WHERE id = v_po.id
   RETURNING * INTO v_po;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_po.shop_id, v_user.id, 'PO_APPROVED',
    'Purchase order ' || v_po.order_no || ' approved', 'PurchaseOrder', v_po.id, v_now);

  RETURN jsonb_build_object(
    'purchaseOrder', jsonb_build_object(
      'id', v_po.id, 'orderNo', v_po.order_no, 'shopId', v_po.shop_id, 'supplierId', v_po.supplier_id,
      'status', v_po.status, 'subtotalMmk', v_po.subtotal_mmk, 'taxMmk', v_po.tax_mmk,
      'totalMmk', v_po.total_mmk, 'notes', v_po.notes, 'createdBy', v_po.created_by,
      'createdAt', v_po.created_at, 'approvedBy', v_po.approved_by, 'approvedAt', v_po.approved_at,
      'receivedBy', v_po.received_by, 'receivedAt', v_po.received_at),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', v_po.shop_id, 'actorId', v_user.id, 'actionType', 'PO_APPROVED',
      'message', 'Purchase order ' || v_po.order_no || ' approved',
      'entityType', 'PurchaseOrder', 'entityId', v_po.id, 'createdAt', v_now))
  );
END;
$$;
