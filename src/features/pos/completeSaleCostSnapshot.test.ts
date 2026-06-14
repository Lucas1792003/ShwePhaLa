import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Migration 041 captures the product cost on each sale line at checkout so
// profit/COGS use the historical cost, not the drifting current cost. These
// tests pin the column add + the three complete_sale additions, and that the
// rest of the checkout RPC (locks, multi-line stock running, negative guard)
// is preserved.

const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/041_complete_sale_cost_snapshot.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

describe("complete_sale cost snapshot (migration 041)", () => {
  it("adds the sale_items.unit_cost_mmk_snapshot column", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS unit_cost_mmk_snapshot integer");
  });

  it("captures the product cost into the computed line", () => {
    expect(sql).toContain("'unit_cost', v_product.cost_mmk");
  });

  it("writes the snapshot on the sale_items insert", () => {
    expect(sql).toContain("unit_cost_mmk_snapshot");
    expect(sql).toContain("(v_c->>'unit_cost')::integer");
  });

  it("returns unitCostMmkSnapshot to the client", () => {
    expect(sql).toContain("'unitCostMmkSnapshot', (v_c->>'unit_cost')::integer");
  });

  it("preserves the checkout safety logic (locks, running stock, negative guard)", () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('complete_sale:' || p_shop_id))");
    expect(sql).toContain("v_stock_running");
    expect(sql).toContain("Insufficient stock for %: have %, need %");
  });
});
