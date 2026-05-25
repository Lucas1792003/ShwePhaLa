import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProductUnit } from "../../types";
import {
  getDefaultProductUnit,
  makeDefaultProductUnit,
  sanitizeProductUnits,
  validateProductUnits,
} from "./productUnits";

const unit = (overrides: Partial<ProductUnit> = {}): ProductUnit => ({
  id: "unit-default",
  productId: "prod-1",
  name: "Can",
  baseQuantity: 1,
  salePriceMmk: 2500,
  purchasePriceMmk: undefined,
  isDefault: true,
  isActive: true,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("product_units migration 026", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/026_product_sellable_units.sql", import.meta.url)),
    "utf8",
  ).replace(/\s+/g, " ");

  it("backfills one default product_unit for existing products", () => {
    expect(sql).toContain("INSERT INTO product_units");
    expect(sql).toContain("FROM products p");
    expect(sql).toContain("p.price_mmk");
    expect(sql).toContain("true, true");
  });

  it("blocks duplicate active names and multiple defaults", () => {
    expect(sql).toContain("product_units_unique_active_name");
    expect(sql).toContain("WHERE is_active");
    expect(sql).toContain("product_units_one_default");
    expect(sql).toContain("WHERE is_default");
  });
});

describe("product_unit prices migration 027", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/027_product_unit_prices.sql", import.meta.url)),
    "utf8",
  ).replace(/\s+/g, " ");

  it("splits the legacy price_mmk into sale_price_mmk + purchase_price_mmk", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS sale_price_mmk");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS purchase_price_mmk");
    expect(sql).toContain("DROP COLUMN price_mmk");
  });

  it("backfills purchase_price_mmk from products.cost_mmk for the default unit", () => {
    expect(sql).toContain("UPDATE product_units pu");
    expect(sql).toContain("SET purchase_price_mmk = p.cost_mmk");
    expect(sql).toContain("pu.is_default = true");
    expect(sql).toContain("pu.purchase_price_mmk IS NULL");
  });

  it("complete_sale uses sale_price_mmk for unit price and tier comparisons", () => {
    expect(sql).toContain("v_base_qty_sold := v_qty * v_unit.base_quantity");
    expect(sql).toContain("v_unit.sale_price_mmk");
    // Tier pricing only when the unit is the default.
    expect(sql).toContain("IF v_unit.is_default THEN");
    expect(sql).toContain("v_expected_price := v_unit.sale_price_mmk");
  });

  it("enforces non-negative sale + purchase price checks", () => {
    expect(sql).toContain("product_units_sale_price_nonneg");
    expect(sql).toContain("product_units_purchase_price_nonneg");
  });
});

describe("makeDefaultProductUnit", () => {
  it("seeds name from base unit type and the sale price", () => {
    expect(makeDefaultProductUnit("prod-1", "Sachet", 500)).toMatchObject({
      productId: "prod-1",
      name: "Sachet",
      baseQuantity: 1,
      salePriceMmk: 500,
      purchasePriceMmk: undefined,
      isDefault: true,
      isActive: true,
    });
  });

  it("carries optional purchase price when given", () => {
    expect(makeDefaultProductUnit("prod-1", "Can", 2500, 1800)).toMatchObject({
      salePriceMmk: 2500,
      purchasePriceMmk: 1800,
    });
  });

  it("falls back to 'Piece' when unit type is blank", () => {
    expect(makeDefaultProductUnit("prod-1", "  ", 0).name).toBe("Piece");
  });
});

describe("validateProductUnits", () => {
  it("accepts a single default base unit", () => {
    expect(validateProductUnits([unit()]).valid).toBe(true);
  });

  it("requires at least one active unit", () => {
    expect(validateProductUnits([]).error).toContain("At least one");
    expect(validateProductUnits([unit({ isActive: false })]).error).toContain("At least one");
  });

  it("requires exactly one active default unit", () => {
    expect(validateProductUnits([unit({ isDefault: false })]).error).toContain("Exactly one");
    expect(
      validateProductUnits([unit(), unit({ id: "u2", name: "Case", isDefault: true })]).error,
    ).toContain("Exactly one");
  });

  it("requires the default unit to have base_quantity 1 (smallest unit)", () => {
    expect(
      validateProductUnits([unit({ baseQuantity: 24 })]).error,
    ).toContain("base quantity 1");
  });

  it("blocks duplicate active unit names case-insensitively", () => {
    const result = validateProductUnits([
      unit({ name: "  Case " }),
      unit({ id: "u2", name: "case", isDefault: false, baseQuantity: 24 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Duplicate");
  });

  it("rejects non-positive base_quantity on any active row", () => {
    expect(
      validateProductUnits([
        unit(),
        unit({ id: "u2", name: "Case", isDefault: false, baseQuantity: 0 }),
      ]).error,
    ).toContain("base quantity");
  });

  it("requires a positive Retail price for active units", () => {
    expect(validateProductUnits([unit({ salePriceMmk: 0 })]).error).toContain("Retail price");
    expect(validateProductUnits([unit({ salePriceMmk: -1 })]).error).toContain("Retail price");
  });

  it("rejects negative purchase price when provided", () => {
    expect(
      validateProductUnits([unit({ purchasePriceMmk: -5 })]).error,
    ).toContain("purchase price");
  });

  it("accepts undefined purchase price (legacy + new products without cost)", () => {
    expect(
      validateProductUnits([unit({ purchasePriceMmk: undefined })]).valid,
    ).toBe(true);
  });
});

describe("sanitizeProductUnits", () => {
  it("normalizes name, clamps base_quantity, truncates prices, and assigns sortOrder by index", () => {
    const rows = sanitizeProductUnits(
      [
        unit({ name: "  Can  ", baseQuantity: 1, salePriceMmk: 2500.7, purchasePriceMmk: 1800.4 }),
        unit({
          id: "u2",
          name: " 6 Pack ",
          baseQuantity: 6,
          salePriceMmk: 14000,
          purchasePriceMmk: 10000,
          isDefault: false,
        }),
      ],
      "prod-1",
    );
    expect(rows[0]).toMatchObject({ name: "Can", salePriceMmk: 2500, purchasePriceMmk: 1800, sortOrder: 0 });
    expect(rows[1]).toMatchObject({ name: "6 Pack", baseQuantity: 6, sortOrder: 1 });
  });

  it("preserves undefined purchase price (does not coerce to 0)", () => {
    const rows = sanitizeProductUnits(
      [unit({ purchasePriceMmk: undefined })],
      "prod-1",
    );
    expect(rows[0].purchasePriceMmk).toBeUndefined();
  });
});

describe("getDefaultProductUnit", () => {
  it("falls back to a virtual default for old products without product_units", () => {
    const fallback = getDefaultProductUnit(
      {
        id: "prod-1",
        name: "Coffee Mix",
        category: "Drinks",
        unitType: "Sachet",
        priceMmk: 500,
        costMmk: 300,
        lowStockThreshold: 1,
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      [],
    );
    expect(fallback).toMatchObject({
      name: "Sachet",
      baseQuantity: 1,
      salePriceMmk: 500,
      purchasePriceMmk: 300,
    });
  });
});
