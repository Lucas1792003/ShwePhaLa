import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Migration 037 makes a received purchase order bill at the RECEIVED value, not
// the ordered value, so supplier debt / payments never over-state a partial
// receive. These tests pin the RPC SQL so a regression that reverts to
// ordered-amount billing is caught.

const migration = (file: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../supabase/migrations/${file}`, import.meta.url)),
    "utf8",
  );

describe("receive_purchase_order bills at received value (migration 037)", () => {
  const sql = migration("037_po_received_value.sql");
  const flat = sql.replace(/\s+/g, " ");

  it("accumulates the PO subtotal from received base qty × unit cost", () => {
    expect(flat).toContain("v_line_total := v_received_base * v_poitem.unit_cost_mmk");
    expect(flat).toContain("v_subtotal := v_subtotal + v_line_total");
  });

  it("rewrites each line total to the received value", () => {
    expect(flat).toContain("line_total_mmk = v_line_total");
  });

  it("recomputes the PO subtotal/total on receive", () => {
    expect(flat).toContain("subtotal_mmk = v_subtotal");
    expect(flat).toContain("total_mmk = v_subtotal + COALESCE(tax_mmk, 0)");
  });

  it("returns paidMmk and paymentStatus so the client store stays consistent", () => {
    expect(flat).toContain("'paidMmk', v_po.paid_mmk");
    expect(flat).toContain("'paymentStatus', v_po.payment_status");
  });

  it("still rejects receiving more than ordered (guard preserved)", () => {
    expect(flat).toContain("Received quantity exceeds ordered quantity for product");
  });
});
