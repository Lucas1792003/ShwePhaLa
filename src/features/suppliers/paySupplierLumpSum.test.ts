import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Migration 040 lets one payment settle several of a supplier's invoices,
// allocated oldest-first. These tests pin the RPC SQL so the allocation,
// no-overpay guard, and per-PO status recompute can't silently regress.

const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/040_pay_supplier_lump_sum.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

describe("pay_supplier_lump_sum (migration 040)", () => {
  it("is gated on supplier:payment_create for the shop", () => {
    expect(sql).toContain("app_can_for_shop('supplier:payment_create', p_shop_id)");
  });

  it("never overpays the total outstanding", () => {
    expect(sql).toContain("Payment amount exceeds total outstanding balance");
    expect(sql).toContain("This supplier has no outstanding balance in this shop");
  });

  it("allocates oldest-first across received, unpaid POs", () => {
    expect(sql).toContain("status = 'RECEIVED' AND total_mmk - COALESCE(paid_mmk, 0) > 0");
    expect(sql).toContain("ORDER BY created_at ASC, id ASC");
    expect(sql).toContain("v_apply := LEAST(v_remaining, v_bal)");
  });

  it("recomputes each PO's payment_status and writes a payment per PO", () => {
    expect(sql).toContain("SET paid_mmk = v_new_paid, payment_status = v_new_status");
    expect(sql).toContain("INSERT INTO supplier_payments");
  });
});
