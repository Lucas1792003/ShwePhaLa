-- ============================================================
-- Migration 039: void / correct a supplier payment
--
-- record_supplier_payment (018) is immutable from the client (INSERT/UPDATE/
-- DELETE revoked), so a mis-entered payment could not be corrected. This adds a
-- SECURITY DEFINER RPC that voids a payment using the void_* columns already on
-- supplier_payments: it reverses the PO's paid_mmk, recomputes payment_status,
-- stamps voided_at/by + reason, and writes an audit row. Permission mirrors
-- recording (supplier:payment_create for the PO's shop; ADMIN always).
--
-- Idempotent. Run AFTER 001-038.
-- ============================================================

CREATE OR REPLACE FUNCTION void_supplier_payment(
  p_payment_id text,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user     users;
  v_pay      supplier_payments;
  v_po       purchase_orders;
  v_now      timestamptz := now();
  v_new_paid integer;
  v_new_status text;
  v_audit_id text := 'audit-' || replace(gen_random_uuid()::text, '-', '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_payment_id IS NULL OR btrim(p_payment_id) = '' THEN
    RAISE EXCEPTION 'Payment is required';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A void reason is required';
  END IF;

  SELECT * INTO v_pay FROM supplier_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'Supplier payment not found'; END IF;
  IF v_pay.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Supplier payment is already voided';
  END IF;
  IF NOT (app_role() = 'ADMIN' OR app_can_for_shop('supplier:payment_create', v_pay.shop_id)) THEN
    RAISE EXCEPTION 'You are not permitted to void supplier payments for this shop';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_pay.purchase_order_id FOR UPDATE;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  -- Reverse the payment off the PO and recompute its status.
  v_new_paid := GREATEST(COALESCE(v_po.paid_mmk, 0) - v_pay.amount_mmk, 0);
  v_new_status := CASE
    WHEN v_new_paid >= v_po.total_mmk AND v_po.total_mmk > 0 THEN 'PAID'
    WHEN v_new_paid > 0 THEN 'PARTIAL'
    ELSE 'UNPAID'
  END;

  UPDATE purchase_orders
     SET paid_mmk = v_new_paid, payment_status = v_new_status
   WHERE id = v_po.id
   RETURNING * INTO v_po;

  UPDATE supplier_payments
     SET voided_at = v_now, voided_by = v_user.id, void_reason = btrim(p_reason)
   WHERE id = v_pay.id
   RETURNING * INTO v_pay;

  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_po.shop_id, v_user.id, 'SUPPLIER_PAYMENT_VOIDED',
    'Supplier payment voided for ' || v_po.order_no || ': MMK ' || v_pay.amount_mmk || '. Reason: ' || btrim(p_reason),
    'SupplierPayment', v_pay.id, v_now);

  RETURN jsonb_build_object(
    'purchaseOrder', jsonb_build_object(
      'id', v_po.id, 'orderNo', v_po.order_no, 'shopId', v_po.shop_id, 'supplierId', v_po.supplier_id,
      'status', v_po.status, 'subtotalMmk', v_po.subtotal_mmk, 'taxMmk', v_po.tax_mmk,
      'totalMmk', v_po.total_mmk, 'paidMmk', v_po.paid_mmk, 'paymentStatus', v_po.payment_status,
      'supplierInvoiceNo', v_po.supplier_invoice_no, 'deliveryNoteNo', v_po.delivery_note_no,
      'notes', v_po.notes, 'createdBy', v_po.created_by, 'createdAt', v_po.created_at,
      'approvedBy', v_po.approved_by, 'approvedAt', v_po.approved_at,
      'receivedBy', v_po.received_by, 'receivedAt', v_po.received_at
    ),
    'supplierPayment', jsonb_build_object(
      'id', v_pay.id, 'supplierId', v_pay.supplier_id, 'purchaseOrderId', v_pay.purchase_order_id,
      'shopId', v_pay.shop_id, 'amountMmk', v_pay.amount_mmk, 'paymentMethod', v_pay.payment_method,
      'referenceNo', v_pay.reference_no, 'notes', v_pay.notes, 'paidAt', v_pay.paid_at,
      'createdBy', v_pay.created_by, 'createdAt', v_pay.created_at,
      'voidedAt', v_pay.voided_at, 'voidedBy', v_pay.voided_by, 'voidReason', v_pay.void_reason
    ),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', v_po.shop_id, 'actorId', v_user.id,
      'actionType', 'SUPPLIER_PAYMENT_VOIDED',
      'message', 'Supplier payment voided for ' || v_po.order_no || ': MMK ' || v_pay.amount_mmk,
      'entityType', 'SupplierPayment', 'entityId', v_pay.id, 'createdAt', v_now
    ))
  );
END;
$$;

REVOKE ALL ON FUNCTION void_supplier_payment(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_supplier_payment(text, text) TO authenticated;
