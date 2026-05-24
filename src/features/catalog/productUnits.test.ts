import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProductUnit } from "../../types";
import {
  getDefaultProductUnit,
  makeDefaultProductUnit,
  validateProductUnits,
} from "./productUnits";

const unit = (overrides: Partial<ProductUnit> = {}): ProductUnit => ({
  id: "unit-default",
  productId: "prod-1",
  name: "Can",
  baseQuantity: 1,
  priceMmk: 2500,
  isDefault: true,
  isActive: true,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("product_units migration", () => {
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

  it("complete_sale deducts base units from sellable unit quantity", () => {
    expect(sql).toContain("v_base_qty_sold := v_qty * v_unit.base_quantity");
    expect(sql).toContain("SET qty_base_units = (v_c->>'qty_after')::integer");
    expect(sql).toContain("'baseQuantitySold'");
  });

  it("keeps price tiers limited to default units", () => {
    expect(sql).toContain("IF v_unit.is_default THEN");
    expect(sql).toContain("FROM price_tiers pt");
    expect(sql).toContain("ELSE v_expected_price := v_unit.price_mmk");
  });
});

describe("product sellable units", () => {
  it("creates the default sellable unit from base unit type and selling price", () => {
    expect(makeDefaultProductUnit("prod-1", "Sachet", 500)).toMatchObject({
      productId: "prod-1",
      name: "Sachet",
      baseQuantity: 1,
      priceMmk: 500,
      isDefault: true,
      isActive: true,
    });
  });

  it("requires exactly one active default unit", () => {
    expect(validateProductUnits([unit()]).valid).toBe(true);
    expect(validateProductUnits([unit({ isDefault: false })]).error).toContain("Exactly one");
    expect(validateProductUnits([unit(), unit({ id: "unit-2", name: "Case", isDefault: true })]).error).toContain("Exactly one");
  });

  it("blocks duplicate active unit names", () => {
    const result = validateProductUnits([
      unit({ name: "  Case " }),
      unit({ id: "unit-2", name: "case", isDefault: false, baseQuantity: 24 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Duplicate");
  });

  it("validates positive base quantity and non-negative price", () => {
    expect(validateProductUnits([unit({ baseQuantity: 0 })]).error).toContain("base quantity");
    expect(validateProductUnits([unit({ priceMmk: -1 })]).error).toContain("non-negative");
  });

  it("falls back to a virtual default for old products without product_units", () => {
    const fallback = getDefaultProductUnit({
      id: "prod-1",
      name: "Coffee Mix",
      category: "Drinks",
      unitType: "Sachet",
      priceMmk: 500,
      lowStockThreshold: 1,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    }, []);
    expect(fallback).toMatchObject({ name: "Sachet", baseQuantity: 1, priceMmk: 500 });
  });
});
