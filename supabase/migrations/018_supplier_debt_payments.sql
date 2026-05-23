-- ============================================================
-- Migration 018: Supplier debt, purchase payment tracking
-- Adds supplier_payments and PO payment status without weakening the
-- existing RPC/RLS hardening architecture.
--
-- Run AFTER 001-017. Idempotent where possible.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. Permission defaults.
--    KEEP IN SYNC with src/types/domain.ts DEFAULT_ROLE_PERMISSIONS.
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
      'transfer:create','transfer:approve','transfer:view',
      'pos:create_sale','pos:apply_discount','pos:override_price','pos:override_stock',
      'pos:void_sale','pos:refund','pos:request_refund','pos:request_void',
      'sale:view','sales:view_own_shift','receipt:reprint',
      'supplier:read','supplier:debt_view','supplier:payment_create',
      'purchase:create','purchase:receive','purchase:view','approval:view',
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
-- 2. Purchase-order payment columns.
-- ============================================================
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS paid_mmk integer NOT NULL DEFAULT 0;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'UNPAID';

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_invoice_no text;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_note_no text;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS received_by text;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS received_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_paid_mmk_nonnegative'
  ) THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_paid_mmk_nonnegative CHECK (paid_mmk >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_paid_mmk_not_over_total'
  ) THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_paid_mmk_not_over_total CHECK (paid_mmk <= total_mmk);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_payment_status_chk'
  ) THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_payment_status_chk
      CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID'));
  END IF;
END $$;

UPDATE purchase_orders
   SET payment_status = CASE
     WHEN status = 'RECEIVED' AND paid_mmk >= total_mmk AND total_mmk > 0 THEN 'PAID'
     WHEN status = 'RECEIVED' AND paid_mmk > 0 THEN 'PARTIAL'
     ELSE 'UNPAID'
   END
 WHERE payment_status IS NULL
    OR payment_status NOT IN ('UNPAID', 'PARTIAL', 'PAID')
    OR (status <> 'RECEIVED' AND payment_status <> 'UNPAID');

-- ============================================================
-- 3. Supplier payments table. Writes are RPC-only.
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_payments (
  id text PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES suppliers(id),
  purchase_order_id text NOT NULL REFERENCES purchase_orders(id),
  shop_id text NOT NULL REFERENCES shops(id),
  amount_mmk integer NOT NULL CHECK (amount_mmk > 0),
  payment_method text NOT NULL,
  reference_no text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by text REFERENCES users(id),
  void_reason text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_method_chk'
  ) THEN
    ALTER TABLE supplier_payments
      ADD CONSTRAINT supplier_payments_method_chk
      CHECK (payment_method IN ('CASH', 'BANK', 'MOBILE', 'OTHER'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx ON supplier_payments (supplier_id);
CREATE INDEX IF NOT EXISTS supplier_payments_po_idx ON supplier_payments (purchase_order_id);
CREATE INDEX IF NOT EXISTS supplier_payments_shop_paid_idx ON supplier_payments (shop_id, paid_at DESC);

ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_payments_sel" ON supplier_payments;
CREATE POLICY "supplier_payments_sel" ON supplier_payments FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR (
      shop_id = app_shop_id()
      AND (app_has_perm('supplier:debt_view') OR app_has_perm('purchase:view'))
    )
  );

DROP POLICY IF EXISTS "supplier_payments_ins" ON supplier_payments;
DROP POLICY IF EXISTS "supplier_payments_upd" ON supplier_payments;
DROP POLICY IF EXISTS "supplier_payments_del" ON supplier_payments;

GRANT SELECT ON supplier_payments TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON supplier_payments FROM authenticated;

-- ============================================================
-- 4. Supplier payment RPC.
-- ============================================================
CREATE OR REPLACE FUNCTION record_supplier_payment(
  p_purchase_order_id text,
  p_amount_mmk integer,
  p_payment_method text,
  p_reference_no text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users;
  v_po purchase_orders;
  v_payment supplier_payments;
  v_now timestamptz := now();
  v_outstanding integer;
  v_new_paid integer;
  v_new_status text;
  v_payment_id text := 'suppay-' || replace(gen_random_uuid()::text, '-', '');
  v_audit_id text := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  v_method text := upper(COALESCE(NULLIF(btrim(p_payment_method), ''), ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_purchase_order_id IS NULL OR btrim(p_purchase_order_id) = '' THEN
    RAISE EXCEPTION 'Purchase order is required';
  END IF;
  IF p_amount_mmk IS NULL OR p_amount_mmk <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  IF v_method NOT IN ('CASH', 'BANK', 'MOBILE', 'OTHER') THEN
    RAISE EXCEPTION 'Unsupported supplier payment method: %', p_payment_method;
  END IF;

  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = p_purchase_order_id
   FOR UPDATE;

  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_po.status <> 'RECEIVED' THEN
    RAISE EXCEPTION 'Supplier payments can only be recorded against received purchase orders';
  END IF;
  IF NOT app_can_for_shop('supplier:payment_create', v_po.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to record supplier payments for this shop';
  END IF;

  v_outstanding := v_po.total_mmk - COALESCE(v_po.paid_mmk, 0);
  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'Purchase order is already paid';
  END IF;
  IF p_amount_mmk > v_outstanding THEN
    RAISE EXCEPTION 'Payment amount exceeds outstanding balance';
  END IF;

  INSERT INTO supplier_payments (
    id, supplier_id, purchase_order_id, shop_id, amount_mmk,
    payment_method, reference_no, notes, paid_at, created_by, created_at
  )
  VALUES (
    v_payment_id, v_po.supplier_id, v_po.id, v_po.shop_id, p_amount_mmk,
    v_method, NULLIF(btrim(p_reference_no), ''), NULLIF(btrim(p_notes), ''),
    v_now, v_user.id, v_now
  )
  RETURNING * INTO v_payment;

  v_new_paid := COALESCE(v_po.paid_mmk, 0) + p_amount_mmk;
  v_new_status := CASE
    WHEN v_new_paid >= v_po.total_mmk THEN 'PAID'
    WHEN v_new_paid > 0 THEN 'PARTIAL'
    ELSE 'UNPAID'
  END;

  UPDATE purchase_orders
     SET paid_mmk = v_new_paid,
         payment_status = v_new_status
   WHERE id = v_po.id
   RETURNING * INTO v_po;

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, v_po.shop_id, v_user.id, 'SUPPLIER_PAYMENT_RECORDED',
    'Supplier payment recorded for ' || v_po.order_no || ': MMK ' || p_amount_mmk,
    'SupplierPayment', v_payment.id, v_now
  );

  RETURN jsonb_build_object(
    'purchaseOrder', jsonb_build_object(
      'id', v_po.id,
      'orderNo', v_po.order_no,
      'shopId', v_po.shop_id,
      'supplierId', v_po.supplier_id,
      'status', v_po.status,
      'subtotalMmk', v_po.subtotal_mmk,
      'taxMmk', v_po.tax_mmk,
      'totalMmk', v_po.total_mmk,
      'paidMmk', v_po.paid_mmk,
      'paymentStatus', v_po.payment_status,
      'supplierInvoiceNo', v_po.supplier_invoice_no,
      'deliveryNoteNo', v_po.delivery_note_no,
      'notes', v_po.notes,
      'createdBy', v_po.created_by,
      'createdAt', v_po.created_at,
      'approvedBy', v_po.approved_by,
      'approvedAt', v_po.approved_at,
      'receivedBy', v_po.received_by,
      'receivedAt', v_po.received_at
    ),
    'supplierPayment', jsonb_build_object(
      'id', v_payment.id,
      'supplierId', v_payment.supplier_id,
      'purchaseOrderId', v_payment.purchase_order_id,
      'shopId', v_payment.shop_id,
      'amountMmk', v_payment.amount_mmk,
      'paymentMethod', v_payment.payment_method,
      'referenceNo', v_payment.reference_no,
      'notes', v_payment.notes,
      'paidAt', v_payment.paid_at,
      'createdBy', v_payment.created_by,
      'createdAt', v_payment.created_at,
      'voidedAt', v_payment.voided_at,
      'voidedBy', v_payment.voided_by,
      'voidReason', v_payment.void_reason
    ),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id,
      'shopId', v_po.shop_id,
      'actorId', v_user.id,
      'actionType', 'SUPPLIER_PAYMENT_RECORDED',
      'message', 'Supplier payment recorded for ' || v_po.order_no || ': MMK ' || p_amount_mmk,
      'entityType', 'SupplierPayment',
      'entityId', v_payment.id,
      'createdAt', v_now
    ))
  );
END;
$$;

REVOKE ALL ON FUNCTION record_supplier_payment(text, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_supplier_payment(text, integer, text, text, text) TO authenticated;
