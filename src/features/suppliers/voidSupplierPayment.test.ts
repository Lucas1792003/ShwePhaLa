import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Migration 039 lets a recorded supplier payment be voided/corrected. These
// tests pin the RPC SQL so the reversal + permission guard can't silently
// regress (the table itself is INSERT/UPDATE/DELETE-revoked, so this RPC is the
// only correction path).

const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/039_void_supplier_payment.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

describe("void_supplier_payment (migration 039)", () => {
  it("blocks double-voiding", () => {
    expect(sql).toContain("Supplier payment is already voided");
    expect(sql).toContain("v_pay.voided_at IS NOT NULL");
  });

  it("is gated on supplier:payment_create for the shop (ADMIN always)", () => {
    expect(sql).toContain("app_role() = 'ADMIN' OR app_can_for_shop('supplier:payment_create', v_pay.shop_id)");
  });

  it("reverses the PO paid amount (floored at 0) and recomputes payment_status", () => {
    expect(sql).toContain("v_new_paid := GREATEST(COALESCE(v_po.paid_mmk, 0) - v_pay.amount_mmk, 0)");
    expect(sql).toContain("SET paid_mmk = v_new_paid, payment_status = v_new_status");
  });

  it("stamps the payment voided + writes an audit row", () => {
    expect(sql).toContain("SET voided_at = v_now, voided_by = v_user.id, void_reason");
    expect(sql).toContain("'SUPPLIER_PAYMENT_VOIDED'");
  });
});
