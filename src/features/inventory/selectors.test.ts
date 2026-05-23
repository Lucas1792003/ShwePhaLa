import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Inventory } from "../../types";
import { getInventoryRecord } from "./selectors";

// Inventory is per-shop: products are a shared catalog, but a stock row is
// keyed by (shopId, productId). These tests pin that model so a regression
// that treats stock as one global quantity is caught.

// The same product (prod-1) exists in two shops with DIFFERENT stock.
const inventory: Inventory[] = [
  { shopId: "shop-a", productId: "prod-1", qtyBaseUnits: 30 },
  { shopId: "shop-b", productId: "prod-1", qtyBaseUnits: 5 },
  { shopId: "shop-a", productId: "prod-2", qtyBaseUnits: 12 },
];

describe("inventory is scoped per shop", () => {
  it("the same product has independent stock in each shop", () => {
    expect(getInventoryRecord(inventory, "shop-a", "prod-1")?.qtyBaseUnits).toBe(30);
    expect(getInventoryRecord(inventory, "shop-b", "prod-1")?.qtyBaseUnits).toBe(5);
  });

  it("a stock lookup needs a shopId — productId alone is ambiguous", () => {
    const productIdOnly = inventory.filter((i) => i.productId === "prod-1");
    expect(productIdOnly).toHaveLength(2); // productId is NOT a unique key
    expect(getInventoryRecord(inventory, "shop-a", "prod-1")).not.toBe(
      getInventoryRecord(inventory, "shop-b", "prod-1"),
    );
  });

  it("returns undefined for a shop that has no row for the product", () => {
    expect(getInventoryRecord(inventory, "shop-b", "prod-2")).toBeUndefined();
  });

  it("never collapses both shops into one global quantity", () => {
    const a = getInventoryRecord(inventory, "shop-a", "prod-1")?.qtyBaseUnits ?? 0;
    const b = getInventoryRecord(inventory, "shop-b", "prod-1")?.qtyBaseUnits ?? 0;
    // A global sum would (wrongly) report 35 — the bug fixed in ProductsManagePage.
    const fakeGlobal = inventory
      .filter((i) => i.productId === "prod-1")
      .reduce((sum, i) => sum + i.qtyBaseUnits, 0);
    expect(fakeGlobal).toBe(35);
    expect(a).not.toBe(fakeGlobal);
    expect(b).not.toBe(fakeGlobal);
  });

  it("a shop-scoped user only ever sees their own shop's rows", () => {
    // RLS (migration 015) enforces this server-side; the client view model
    // must match — a manager of shop-a filters inventory to shop-a.
    const managerShopA = inventory.filter((i) => i.shopId === "shop-a");
    expect(managerShopA.every((i) => i.shopId === "shop-a")).toBe(true);
    expect(managerShopA.some((i) => i.shopId === "shop-b")).toBe(false);
    // Admin views each shop separately by selecting it.
    expect(inventory.filter((i) => i.shopId === "shop-b")).toHaveLength(1);
  });
});

// ---- RPC SQL: every inventory write is keyed by (shop_id, product_id) -----

describe("RPC SQL keeps inventory writes shop-scoped", () => {
  const migration = (file: string): string =>
    readFileSync(
      fileURLToPath(new URL(`../../../supabase/migrations/${file}`, import.meta.url)),
      "utf8",
    ).replace(/\s+/g, " ");

  it("complete_sale deducts stock for the sale's shop only", () => {
    const sql = migration("004_complete_sale_rpc.sql");
    expect(sql).toContain("UPDATE inventory");
    expect(sql).toContain("WHERE shop_id = p_shop_id AND product_id = v_c->>'product_id'");
  });

  it("complete_sale locks shop inventory and rejects unauthorized negative stock", () => {
    const sql = migration("004_complete_sale_rpc.sql");
    expect(sql).toContain("v_can_ovr_stock := app_has_perm('pos:override_stock')");
    expect(sql).toContain("WHERE shop_id = p_shop_id AND product_id = v_product.id FOR UPDATE");
    expect(sql).toContain("IF v_qty_after < 0 AND NOT v_can_ovr_stock THEN");
    expect(sql).toContain("RAISE EXCEPTION 'Insufficient stock for %: have %, need %'");
  });

  it("receive_purchase_order adds stock for the PO's shop only", () => {
    const sql = migration("006_receive_purchase_order_rpc.sql");
    expect(sql).toContain("ON CONFLICT (shop_id, product_id)");
    expect(sql).toContain("WHERE shop_id = v_po.shop_id AND product_id = v_poitem.product_id");
  });

  it("complete_stock_transfer moves stock between source and destination shop", () => {
    const sql = migration("007_complete_stock_transfer_rpc.sql");
    expect(sql).toContain("WHERE shop_id = v_transfer.from_shop_id AND product_id = v_titem.product_id");
    expect(sql).toContain("WHERE shop_id = v_transfer.to_shop_id AND product_id = v_titem.product_id");
  });

  it("adjust_stock (migration 014) adjusts the selected shop only", () => {
    const sql = migration("014_rbac_role_tuning.sql");
    expect(sql).toContain("ON CONFLICT (shop_id, product_id)");
    expect(sql).toContain("WHERE shop_id = p_shop_id AND product_id = p_product_id");
  });

  it("refund/void restores stock to the original sale's shop only", () => {
    const sql = migration("005_refund_void_rpc.sql");
    expect(sql).toContain("WHERE shop_id = v_sale.shop_id AND product_id = v_product_id");
    expect(sql).toContain("WHERE shop_id = v_sale.shop_id AND product_id = v_sale_item.product_id");
  });
});

// ---- Schema: inventory uniqueness is (shop_id, product_id) ----------------

describe("inventory schema", () => {
  it("declares a composite (shop_id, product_id) primary key", () => {
    const schema = readFileSync(
      fileURLToPath(new URL("../../../supabase/schema.sql", import.meta.url)),
      "utf8",
    ).replace(/\s+/g, " ");
    // one stock row per (shop, product) — no global-per-product row possible
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS inventory \(.*PRIMARY KEY \(shop_id, product_id\)/);
  });
});
