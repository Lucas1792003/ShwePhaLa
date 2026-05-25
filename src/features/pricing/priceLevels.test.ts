import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PriceLevel, ProductUnit, ProductUnitPrice } from "../../types";
import {
  getActivePriceLevels,
  getDefaultPriceLevel,
  resolveProductUnitPrice,
} from "./priceLevels";

const ts = "2026-01-01T00:00:00.000Z";

const level = (overrides: Partial<PriceLevel> & { id: string; code: string; name: string }): PriceLevel => ({
  id: overrides.id,
  code: overrides.code,
  name: overrides.name,
  isDefault: overrides.isDefault ?? false,
  isActive: overrides.isActive ?? true,
  sortOrder: overrides.sortOrder ?? 0,
  createdAt: ts,
  updatedAt: ts,
});

const price = (overrides: Partial<ProductUnitPrice> & {
  id: string;
  productUnitId: string;
  priceLevelId: string;
  priceMmk: number;
}): ProductUnitPrice => ({
  id: overrides.id,
  productUnitId: overrides.productUnitId,
  priceLevelId: overrides.priceLevelId,
  shopId: overrides.shopId,
  priceMmk: overrides.priceMmk,
  isActive: overrides.isActive ?? true,
  createdAt: ts,
  updatedAt: ts,
});

const baseUnit: Pick<ProductUnit, "id" | "salePriceMmk"> = {
  id: "unit-can",
  salePriceMmk: 1000,
};

const retail = level({ id: "plv-retail", code: "retail", name: "Retail", isDefault: true, sortOrder: 10 });
const wholesale = level({ id: "plv-wholesale", code: "wholesale", name: "Wholesale", sortOrder: 20 });
const special = level({ id: "plv-special", code: "special", name: "Special", sortOrder: 30 });

describe("getDefaultPriceLevel", () => {
  it("returns the active default level", () => {
    expect(getDefaultPriceLevel([retail, wholesale, special])?.code).toBe("retail");
  });

  it("falls back to any active level when no default is flagged", () => {
    const noDefault = level({ id: "plv-x", code: "x", name: "X" });
    expect(getDefaultPriceLevel([noDefault])?.id).toBe("plv-x");
  });
});

describe("getActivePriceLevels", () => {
  it("filters inactive and sorts by sort_order then name", () => {
    const inactive = level({ id: "plv-y", code: "y", name: "Y", isActive: false, sortOrder: 5 });
    const same = level({ id: "plv-z", code: "z", name: "Apple", sortOrder: 20 });
    const result = getActivePriceLevels([special, retail, wholesale, inactive, same]);
    expect(result.map((l) => l.code)).toEqual(["retail", "z", "wholesale", "special"]);
  });
});

describe("resolveProductUnitPrice", () => {
  it("uses shop_override when it exists", () => {
    const got = resolveProductUnitPrice({
      unit: baseUnit,
      priceLevelId: "plv-wholesale",
      shopId: "shop-a",
      priceLevels: [retail, wholesale],
      productUnitPrices: [
        price({ id: "pup-1", productUnitId: baseUnit.id, priceLevelId: "plv-wholesale", priceMmk: 950, shopId: "shop-a" }),
        price({ id: "pup-2", productUnitId: baseUnit.id, priceLevelId: "plv-wholesale", priceMmk: 960 }),
      ],
    });
    expect(got).toMatchObject({ priceMmk: 950, source: "shop_override", isFallback: false });
  });

  it("uses global_price_level when no shop override matches", () => {
    const got = resolveProductUnitPrice({
      unit: baseUnit,
      priceLevelId: "plv-wholesale",
      shopId: "shop-a",
      priceLevels: [retail, wholesale],
      productUnitPrices: [
        price({ id: "pup-2", productUnitId: baseUnit.id, priceLevelId: "plv-wholesale", priceMmk: 960 }),
      ],
    });
    expect(got).toMatchObject({ priceMmk: 960, source: "global_price_level", isFallback: false });
  });

  it("falls back to retail (shop-specific) when wholesale row is missing", () => {
    const got = resolveProductUnitPrice({
      unit: baseUnit,
      priceLevelId: "plv-wholesale",
      shopId: "shop-a",
      priceLevels: [retail, wholesale],
      productUnitPrices: [
        price({ id: "pup-r", productUnitId: baseUnit.id, priceLevelId: "plv-retail", priceMmk: 1000, shopId: "shop-a" }),
      ],
    });
    expect(got).toMatchObject({
      priceMmk: 1000,
      priceLevelId: "plv-retail",
      source: "retail_fallback_shop",
      isFallback: true,
    });
  });

  it("falls back to retail (global) when wholesale + shop-retail are missing", () => {
    const got = resolveProductUnitPrice({
      unit: baseUnit,
      priceLevelId: "plv-wholesale",
      shopId: "shop-a",
      priceLevels: [retail, wholesale],
      productUnitPrices: [
        price({ id: "pup-r", productUnitId: baseUnit.id, priceLevelId: "plv-retail", priceMmk: 1000 }),
      ],
    });
    expect(got).toMatchObject({ source: "retail_fallback_global", isFallback: true, priceMmk: 1000 });
  });

  it("falls back to legacy sale_price_mmk when nothing exists in product_unit_prices", () => {
    const got = resolveProductUnitPrice({
      unit: baseUnit,
      priceLevelId: "plv-retail",
      shopId: "shop-a",
      priceLevels: [retail, wholesale],
      productUnitPrices: [],
    });
    expect(got).toMatchObject({ priceMmk: 1000, source: "legacy_sale_price", isFallback: true });
  });

  it("rejects an inactive requested level by silently dropping back to the default level", () => {
    const inactiveWholesale = { ...wholesale, isActive: false };
    const got = resolveProductUnitPrice({
      unit: baseUnit,
      priceLevelId: "plv-wholesale",
      shopId: "shop-a",
      priceLevels: [retail, inactiveWholesale],
      productUnitPrices: [
        price({ id: "pup-r", productUnitId: baseUnit.id, priceLevelId: "plv-retail", priceMmk: 1000 }),
      ],
    });
    expect(got.priceLevelId).toBe("plv-retail");
    expect(got.source).toBe("global_price_level");
  });

  it("never returns undefined", () => {
    const got = resolveProductUnitPrice({
      unit: { id: "no-prices", salePriceMmk: 0 },
      priceLevelId: "plv-special",
      shopId: "shop-a",
      priceLevels: [retail, special],
      productUnitPrices: [],
    });
    expect(typeof got.priceMmk).toBe("number");
    expect(got.source).toBe("legacy_sale_price");
  });
});

describe("migration 030 — SQL guards", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/030_price_levels.sql", import.meta.url)),
    "utf8",
  ).replace(/\s+/g, " ");

  it("creates price_levels with one-active-default and unique code", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS price_levels");
    expect(sql).toContain("price_levels_one_active_default");
    expect(sql).toContain("price_levels_code_normalized");
  });

  it("seeds Retail (default) / Wholesale / Special", () => {
    expect(sql).toContain("'plv-retail', 'retail', 'Retail', true");
    expect(sql).toContain("'plv-wholesale', 'wholesale', 'Wholesale'");
    expect(sql).toContain("'plv-special', 'special', 'Special'");
  });

  it("creates product_unit_prices with shop-specific + global unique active partial indexes", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS product_unit_prices");
    expect(sql).toContain("product_unit_prices_unique_global_active");
    expect(sql).toContain("product_unit_prices_unique_shop_active");
    expect(sql).toContain("CHECK (price_mmk >= 0)");
  });

  it("backfills retail rows from product_units.sale_price_mmk without overwriting existing rows", () => {
    expect(sql).toContain("INSERT INTO product_unit_prices");
    expect(sql).toContain("'plv-retail'");
    expect(sql).toContain("pu.sale_price_mmk");
    expect(sql).toContain("WHERE NOT EXISTS");
  });

  it("adds price-level snapshot columns to sale_items", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS price_level_id");
    expect(sql).toContain("price_level_name_snapshot");
    expect(sql).toContain("price_source_snapshot");
  });

  it("complete_sale accepts price_level_id and resolves price server-side with the documented chain", () => {
    expect(sql).toContain("v_requested_level_id := NULLIF(v_item->>'price_level_id', '')");
    expect(sql).toContain("'shop_override'");
    expect(sql).toContain("'global_price_level'");
    expect(sql).toContain("'retail_fallback_shop'");
    expect(sql).toContain("'retail_fallback_global'");
    expect(sql).toContain("'legacy_sale_price'");
  });

  it("complete_sale rejects an inactive requested price level", () => {
    expect(sql).toContain("Price level % is not active");
  });

  it("complete_sale keeps price tiers limited to default unit + default price level", () => {
    expect(sql).toContain("IF v_unit.is_default AND v_resolved_level_id = COALESCE(v_default_level.id");
  });

  it("complete_sale writes price-level snapshot fields onto sale_items", () => {
    expect(sql).toContain("price_level_id, price_level_name_snapshot, price_source_snapshot");
  });

  it("widens duplicate cart-line guard to include the price level", () => {
    expect(sql).toContain("v_line_key := v_product.id || ':' || v_unit.id || ':' || v_resolved_level_id");
  });
});
