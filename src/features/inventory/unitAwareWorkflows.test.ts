import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/028_unit_aware_stock_workflows.sql", import.meta.url)),
  "utf8",
);

const flat = migration.replace(/\s+/g, " ");

const migration029 = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/029_unit_aware_transfer_creation.sql", import.meta.url)),
  "utf8",
);

const flat029 = migration029.replace(/\s+/g, " ");

describe("migration 028 — schema additions", () => {
  it("adds the product_unit_id + snapshot columns to purchase_order_items", () => {
    expect(flat).toMatch(/ALTER TABLE purchase_order_items[\s\S]*?product_unit_id/);
    expect(flat).toContain("unit_name_snapshot");
    expect(flat).toContain("unit_base_quantity_snapshot");
    expect(flat).toContain("selected_unit_quantity");
    expect(flat).toContain("unit_purchase_price_snapshot");
  });

  it("adds the snapshot columns to stock_transfer_items and inventory_movements", () => {
    expect(flat).toMatch(/ALTER TABLE stock_transfer_items[\s\S]*?product_unit_id/);
    expect(flat).toMatch(/ALTER TABLE inventory_movements[\s\S]*?product_unit_id/);
  });

  it("indexes the new product_unit_id columns when set", () => {
    expect(flat).toContain("purchase_order_items_unit_idx");
    expect(flat).toContain("stock_transfer_items_unit_idx");
    expect(flat).toContain("inventory_movements_unit_idx");
  });
});

describe("migration 028 — receive_purchase_order", () => {
  it("computes base qty server-side from the unit qty × base_quantity", () => {
    // The headline rule: 10 Package of base_quantity 24 ⇒ 240 base units.
    expect(flat).toContain("v_received_base := v_unit_qty * v_unit.base_quantity");
  });

  it("validates the picked unit belongs to the product and is active", () => {
    expect(flat).toMatch(/FROM product_units[\s\S]*?WHERE id = v_unit_id[\s\S]*?product_id = v_poitem\.product_id[\s\S]*?is_active = true/);
    expect(flat).toContain("Sellable unit % is not active for product %");
  });

  it("persists the snapshot on purchase_order_items and inventory_movements", () => {
    expect(flat).toContain("UPDATE purchase_order_items SET received_qty = v_received_base, product_unit_id = COALESCE(v_unit.id, product_unit_id)");
    expect(flat).toContain("INSERT INTO inventory_movements");
    expect(flat).toContain("v_unit.id, v_unit.name, v_unit.base_quantity, v_unit_qty");
  });

  it("rejects received quantity that exceeds the ordered quantity", () => {
    expect(flat).toContain("Received quantity exceeds ordered quantity");
  });
});

describe("migration 028 — adjust_stock", () => {
  it("accepts optional p_product_unit_id and p_unit_qty parameters", () => {
    expect(flat).toMatch(/CREATE OR REPLACE FUNCTION adjust_stock\([\s\S]*?p_product_unit_id text DEFAULT NULL,[\s\S]*?p_unit_qty\s+integer DEFAULT NULL/);
  });

  it("computes base delta as sign × unit_qty × unit.base_quantity when a unit is picked", () => {
    expect(flat).toContain("v_delta := v_sign * (p_unit_qty * v_unit.base_quantity)");
  });

  it("validates the unit belongs to the product and is active", () => {
    expect(flat).toContain("Sellable unit % is not active for product %");
  });

  it("retains the legacy 5-arg signature drop so PostgREST routes to the new one", () => {
    expect(flat).toContain("DROP FUNCTION IF EXISTS adjust_stock(text, text, text, integer, text)");
  });

  it("rejects DAMAGE / stock-in sign mismatches in the new path too", () => {
    expect(flat).toContain("Damage write-off must reduce stock");
    expect(flat).toContain("Stock-in adjustments must increase stock");
  });

  it("writes the unit snapshot onto inventory_movements", () => {
    expect(flat).toContain(
      "v_unit.id, v_unit.name, v_unit.base_quantity, p_unit_qty",
    );
  });
});

describe("migration 028 — complete_stock_transfer", () => {
  it("propagates the snapshot from stock_transfer_items into both movements", () => {
    expect(flat).toContain("v_titem.product_unit_id, v_titem.unit_name_snapshot");
    expect(flat).toContain("'TRANSFER_OUT'");
    expect(flat).toContain("'TRANSFER_IN'");
  });

  it("does not change the base-unit inventory math (still uses approved/requested qty)", () => {
    expect(flat).toContain(
      "v_qty := COALESCE(v_titem.approved_qty, v_titem.requested_qty)",
    );
  });
});

describe("migration 029 - create_stock_transfer", () => {
  it("accepts product_unit_id + selected_unit_quantity and computes base qty server-side", () => {
    expect(flat029).toContain("v_selected_qty * v_unit.base_quantity");
    expect(flat029).toContain("'requestedQty', v_base_qty");
  });

  it("validates the selected unit belongs to the product and is active", () => {
    expect(flat029).toMatch(/FROM product_units[\s\S]*?WHERE id = v_unit_id[\s\S]*?product_id = v_product_id[\s\S]*?is_active = true/);
    expect(flat029).toContain("Sellable unit % is not active for product %");
  });

  it("rejects zero or negative selected unit quantity", () => {
    expect(flat029).toContain("Invalid selected unit quantity");
    expect(flat029).toContain("v_selected_qty IS NULL OR v_selected_qty <= 0");
  });

  it("validates combined base stock by product", () => {
    expect(flat029).toContain("sum((i->>'requestedQty')::integer)");
    expect(flat029).toContain("Insufficient stock for % at the source shop");
  });

  it("persists stock_transfer_items unit snapshots", () => {
    expect(flat029).toContain("product_unit_id, unit_name_snapshot, unit_base_quantity_snapshot");
    expect(flat029).toContain("'unitNameSnapshot'");
    expect(flat029).toContain("'selectedUnitQuantity'");
  });

  it("keeps approval results from dropping snapshot fields", () => {
    expect(flat029).toMatch(/CREATE OR REPLACE FUNCTION approve_stock_transfer/);
    expect(flat029).toContain("'productUnitId', i.product_unit_id");
    expect(flat029).toContain("'unitBaseQuantitySnapshot', i.unit_base_quantity_snapshot");
  });
});
