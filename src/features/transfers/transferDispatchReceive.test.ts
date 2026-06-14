import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Migration 038 splits stock-transfer completion into dispatch (source marks
// IN_TRANSIT, no inventory change) → receive (destination confirms, moves stock
// for the received qty). These tests pin the RPC SQL so the two-step
// receipt flow and its guards can't silently regress.

const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/038_transfer_dispatch_receive.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

describe("dispatch_stock_transfer (migration 038)", () => {
  it("only moves an APPROVED transfer to IN_TRANSIT", () => {
    expect(sql).toContain("Transfer cannot be dispatched from status");
    expect(sql).toContain("status = 'IN_TRANSIT', dispatched_by = v_user.id");
  });

  it("is gated on the source shop and changes no inventory", () => {
    expect(sql).toContain("app_can_for_shop('transfer:approve', v_t.from_shop_id)");
    const dispatchBody = sql.slice(
      sql.indexOf("FUNCTION dispatch_stock_transfer"),
      sql.indexOf("FUNCTION receive_stock_transfer"),
    );
    expect(dispatchBody).not.toContain("UPDATE inventory");
  });
});

describe("receive_stock_transfer (migration 038)", () => {
  it("requires IN_TRANSIT and is confirmed by the destination shop", () => {
    expect(sql).toContain("Transfer cannot be received from status");
    expect(sql).toContain("app_can_for_shop('transfer:approve', v_transfer.to_shop_id)");
  });

  it("clamps the received qty to the approved qty (short receive allowed)", () => {
    expect(sql).toContain("Received quantity exceeds approved quantity for product");
    expect(sql).toContain("v_qty := COALESCE(v_input_qty, v_approved)");
  });

  it("moves stock source → dest with paired ledger rows and re-checks source", () => {
    expect(sql).toContain("Insufficient stock at source for");
    expect(sql).toContain("'TRANSFER_OUT'");
    expect(sql).toContain("'TRANSFER_IN'");
  });

  it("marks the transfer COMPLETED and records the receiver", () => {
    expect(sql).toContain("status = 'COMPLETED', received_by = v_user.id");
  });
});
