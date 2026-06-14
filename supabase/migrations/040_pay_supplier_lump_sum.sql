-- ============================================================
-- Migration 040: lump-sum supplier payment
--
-- record_supplier_payment (018) pays ONE purchase order. Real AP often pays a
-- supplier a single amount that settles several invoices. This RPC takes one
-- amount for a (supplier, shop) and allocates it across that supplier's
-- RECEIVED, not-fully-paid POs oldest-first, writing one supplier_payments row
-- per PO it touches and recomputing each PO's payment_status. It never overpays
-- (amount must be <= total outstanding) and is gated like recording.
--
-- Idempotent. Run AFTER 001-039.
-- ============================================================

CREATE OR REPLACE FUNCTION pay_supplier_lump_sum(
  p_supplier_id    text,
  p_shop_id        text,
  p_amount_mmk     integer,
  p_payment_method text,
  p_reference_no   text DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user        users;
  v_now         timestamptz := now();
  v_method      text := upper(COALESCE(NULLIF(btrim(p_payment_method), ''), ''));
  v_remaining   integer;
  v_outstanding integer;
  v_po          purchase_orders;
  v_bal         integer;
  v_apply       integer;
  v_new_paid    integer;
  v_new_status  text;
  v_pay_id      text;
  v_audit_id    text;
  v_pays_out    jsonb := '[]'::jsonb;
  v_pos_out     jsonb := '[]'::jsonb;
  v_audits_out  jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_supplier_id IS NULL OR btrim(p_supplier_id) = '' THEN RAISE EXCEPTION 'Supplier is required'; END IF;
  IF p_shop_id IS NULL OR btrim(p_shop_id) = '' THEN RAISE EXCEPTION 'Shop is required'; END IF;
  IF p_amount_mmk IS NULL OR p_amount_mmk <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  IF v_method NOT IN ('CASH', 'BANK', 'MOBILE', 'OTHER') THEN
    RAISE EXCEPTION 'Unsupported supplier payment method: %', p_payment_method;
  END IF;
  IF NOT app_can_for_shop('supplier:payment_create', p_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to record supplier payments for this shop';
  END IF;

  -- Total outstanding for this supplier in this shop (received, unpaid balance).
  SELECT COALESCE(sum(total_mmk - COALESCE(paid_mmk, 0)), 0)
    INTO v_outstanding
    FROM purchase_orders
   WHERE supplier_id = p_supplier_id AND shop_id = p_shop_id
     AND status = 'RECEIVED' AND total_mmk - COALESCE(paid_mmk, 0) > 0;

  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'This supplier has no outstanding balance in this shop';
  END IF;
  IF p_amount_mmk > v_outstanding THEN
    RAISE EXCEPTION 'Payment amount exceeds total outstanding balance';
  END IF;

  v_remaining := p_amount_mmk;

  FOR v_po IN
    SELECT * FROM purchase_orders
     WHERE supplier_id = p_supplier_id AND shop_id = p_shop_id
       AND status = 'RECEIVED' AND total_mmk - COALESCE(paid_mmk, 0) > 0
     ORDER BY created_at ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_bal := v_po.total_mmk - COALESCE(v_po.paid_mmk, 0);
    v_apply := LEAST(v_remaining, v_bal);
    IF v_apply <= 0 THEN CONTINUE; END IF;

    v_pay_id := 'suppay-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO supplier_payments (
      id, supplier_id, purchase_order_id, shop_id, amount_mmk,
      payment_method, reference_no, notes, paid_at, created_by, created_at
    )
    VALUES (
      v_pay_id, v_po.supplier_id, v_po.id, v_po.shop_id, v_apply,
      v_method, NULLIF(btrim(p_reference_no), ''), NULLIF(btrim(p_notes), ''),
      v_now, v_user.id, v_now
    );

    v_new_paid := COALESCE(v_po.paid_mmk, 0) + v_apply;
    v_new_status := CASE
      WHEN v_new_paid >= v_po.total_mmk THEN 'PAID'
      WHEN v_new_paid > 0 THEN 'PARTIAL'
      ELSE 'UNPAID'
    END;
    UPDATE purchase_orders
       SET paid_mmk = v_new_paid, payment_status = v_new_status
     WHERE id = v_po.id
     RETURNING * INTO v_po;

    v_remaining := v_remaining - v_apply;

    v_pays_out := v_pays_out || jsonb_build_array(jsonb_build_object(
      'id', v_pay_id, 'supplierId', v_po.supplier_id, 'purchaseOrderId', v_po.id,
      'shopId', v_po.shop_id, 'amountMmk', v_apply, 'paymentMethod', v_method,
      'referenceNo', NULLIF(btrim(p_reference_no), ''), 'notes', NULLIF(btrim(p_notes), ''),
      'paidAt', v_now, 'createdBy', v_user.id, 'createdAt', v_now,
      'voidedAt', NULL, 'voidedBy', NULL, 'voidReason', NULL
    ));
    v_pos_out := v_pos_out || jsonb_build_array(jsonb_build_object(
      'id', v_po.id, 'orderNo', v_po.order_no, 'shopId', v_po.shop_id, 'supplierId', v_po.supplier_id,
      'status', v_po.status, 'subtotalMmk', v_po.subtotal_mmk, 'taxMmk', v_po.tax_mmk,
      'totalMmk', v_po.total_mmk, 'paidMmk', v_po.paid_mmk, 'paymentStatus', v_po.payment_status,
      'supplierInvoiceNo', v_po.supplier_invoice_no, 'deliveryNoteNo', v_po.delivery_note_no,
      'notes', v_po.notes, 'createdBy', v_po.created_by, 'createdAt', v_po.created_at,
      'approvedBy', v_po.approved_by, 'approvedAt', v_po.approved_at,
      'receivedBy', v_po.received_by, 'receivedAt', v_po.received_at
    ));

    v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
    VALUES (v_audit_id, v_po.shop_id, v_user.id, 'SUPPLIER_PAYMENT_RECORDED',
      'Supplier payment (lump-sum) for ' || v_po.order_no || ': MMK ' || v_apply,
      'SupplierPayment', v_pay_id, v_now);
    v_audits_out := v_audits_out || jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', v_po.shop_id, 'actorId', v_user.id,
      'actionType', 'SUPPLIER_PAYMENT_RECORDED',
      'message', 'Supplier payment (lump-sum) for ' || v_po.order_no || ': MMK ' || v_apply,
      'entityType', 'SupplierPayment', 'entityId', v_pay_id, 'createdAt', v_now));
  END LOOP;

  RETURN jsonb_build_object(
    'supplierPayments', v_pays_out,
    'purchaseOrders', v_pos_out,
    'auditLogs', v_audits_out
  );
END;
$$;

REVOKE ALL ON FUNCTION pay_supplier_lump_sum(text, text, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pay_supplier_lump_sum(text, text, integer, text, text, text) TO authenticated;
