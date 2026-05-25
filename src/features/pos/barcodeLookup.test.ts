import { describe, expect, it } from "vitest";
import type { Product, ProductBarcode, ProductUnit } from "../../types";
import { findProductForScan } from "./barcodeLookup";
import { getPrintableBarcodeValue } from "../barcodes/labels";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "prod-1",
  sku: "ALT-001",
  name: "Tea Mix",
  category: "Drinks",
  unitType: "piece",
  priceMmk: 1000,
  lowStockThreshold: 2,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const barcode = (productId: string, value: string): ProductBarcode => ({
  id: `${productId}-${value}`,
  productId,
  value,
  type: "EAN13",
});

const unit = (overrides: Partial<ProductUnit> = {}): ProductUnit => ({
  id: "unit-prod-1-default",
  productId: "prod-1",
  name: "Can",
  baseQuantity: 1,
  salePriceMmk: 1000,
  purchasePriceMmk: undefined,
  isDefault: true,
  isActive: true,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("findProductForScan", () => {
  it("matches against product_barcodes.value first", () => {
    const p = product();
    const result = findProductForScan("8801001", [p], [unit()], [barcode("prod-1", "8801001")]);
    expect(result?.product.id).toBe("prod-1");
    expect(result?.unit.name).toBe("Can");
  });

  it("falls back to products.sku when no barcode row matches", () => {
    const p = product({ sku: "BEE-001" });
    const result = findProductForScan("BEE-001", [p], [unit()], []);
    expect(result?.product.id).toBe("prod-1");
  });

  it("matches SKU case-insensitively (manual entry tolerance)", () => {
    const p = product({ sku: "BEE-001" });
    expect(findProductForScan("bee-001", [p], [unit()], [])?.product.id).toBe("prod-1");
    expect(findProductForScan("Bee-001", [p], [unit()], [])?.product.id).toBe("prod-1");
  });

  it("trims whitespace from the scanned value", () => {
    const p = product({ sku: "BEE-001" });
    expect(findProductForScan("  BEE-001  ", [p], [unit()], [])?.product.id).toBe("prod-1");
    expect(findProductForScan(" 8801001 ", [p], [unit()], [barcode("prod-1", "8801001")])?.product.id).toBe("prod-1");
  });

  it("returns undefined for empty / whitespace / unknown codes", () => {
    const p = product({ sku: "BEE-001" });
    expect(findProductForScan("", [p], [unit()], [])).toBeUndefined();
    expect(findProductForScan("   ", [p], [unit()], [])).toBeUndefined();
    expect(findProductForScan("not-a-code", [p], [unit()], [])).toBeUndefined();
  });

  it("does not let an SKU collision override an explicit barcode mapping", () => {
    const p1 = product({ id: "p1", sku: "SHARED" });
    const p2 = product({ id: "p2", sku: "OTHER" });
    // p2 has a registered barcode whose value happens to equal p1's SKU.
    const result = findProductForScan("SHARED", [p1, p2], [unit({ productId: "p2" })], [barcode("p2", "SHARED")]);
    expect(result?.product.id).toBe("p2");
  });

  it("matches product_barcodes.value verbatim (no case folding for EAN/UPC)", () => {
    // Real EAN/UPC codes are numeric, so this guards a hypothetical
    // alpha-coded internal barcode from being silently uppercased.
    const p = product({ id: "p1", sku: undefined });
    const result = findProductForScan("abc123", [p], [unit({ productId: "p1" })], [barcode("p1", "ABC123")]);
    expect(result).toBeUndefined();
  });

  it("adds the exact unit when a barcode is linked to product_unit_id", () => {
    const p = product({ id: "p1", sku: "ALT-001" });
    const caseUnit = unit({
      id: "unit-case",
      productId: "p1",
      name: "Case",
      baseQuantity: 24,
      salePriceMmk: 55000,
      isDefault: false,
    });
    const result = findProductForScan(
      "CASE-001",
      [p],
      [unit({ id: "unit-default", productId: "p1" }), caseUnit],
      [{ ...barcode("p1", "CASE-001"), productUnitId: "unit-case" }]
    );
    expect(result?.unit).toMatchObject({ id: "unit-case", baseQuantity: 24 });
  });

  it("printed label barcode and POS scanner lookup agree (barcode source)", () => {
    const p = product({ id: "p1", sku: "ALT-001" });
    const barcodes = [barcode("p1", "8801001")];
    const units = [unit({ id: "unit-default", productId: "p1" })];
    const printable = getPrintableBarcodeValue(p, barcodes, units[0]);
    expect(printable?.source).toBe("barcode");
    expect(findProductForScan(printable!.value, [p], units, barcodes)?.product.id).toBe("p1");
  });

  it("printed label barcode and POS scanner lookup agree (sku source)", () => {
    const p = product({ id: "p1", sku: "BEE-001" });
    const units = [unit({ id: "unit-default", productId: "p1" })];
    const printable = getPrintableBarcodeValue(p, [], units[0]);
    expect(printable?.source).toBe("sku");
    // Regression: previously, labels with SKU-source printed but scanned
    // as "Barcode not found" because POS only consulted product_barcodes.
    expect(findProductForScan(printable!.value, [p], units, [])?.product.id).toBe("p1");
  });
});
