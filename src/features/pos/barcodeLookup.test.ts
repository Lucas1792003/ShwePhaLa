import { describe, expect, it } from "vitest";
import type { Product, ProductBarcode } from "../../types";
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

describe("findProductForScan", () => {
  it("matches against product_barcodes.value first", () => {
    const p = product();
    const result = findProductForScan("8801001", [p], [barcode("prod-1", "8801001")]);
    expect(result?.id).toBe("prod-1");
  });

  it("falls back to products.sku when no barcode row matches", () => {
    const p = product({ sku: "BEE-001" });
    const result = findProductForScan("BEE-001", [p], []);
    expect(result?.id).toBe("prod-1");
  });

  it("matches SKU case-insensitively (manual entry tolerance)", () => {
    const p = product({ sku: "BEE-001" });
    expect(findProductForScan("bee-001", [p], [])?.id).toBe("prod-1");
    expect(findProductForScan("Bee-001", [p], [])?.id).toBe("prod-1");
  });

  it("trims whitespace from the scanned value", () => {
    const p = product({ sku: "BEE-001" });
    expect(findProductForScan("  BEE-001  ", [p], [])?.id).toBe("prod-1");
    expect(findProductForScan(" 8801001 ", [p], [barcode("prod-1", "8801001")])?.id).toBe("prod-1");
  });

  it("returns undefined for empty / whitespace / unknown codes", () => {
    const p = product({ sku: "BEE-001" });
    expect(findProductForScan("", [p], [])).toBeUndefined();
    expect(findProductForScan("   ", [p], [])).toBeUndefined();
    expect(findProductForScan("not-a-code", [p], [])).toBeUndefined();
  });

  it("does not let an SKU collision override an explicit barcode mapping", () => {
    const p1 = product({ id: "p1", sku: "SHARED" });
    const p2 = product({ id: "p2", sku: "OTHER" });
    // p2 has a registered barcode whose value happens to equal p1's SKU.
    const result = findProductForScan("SHARED", [p1, p2], [barcode("p2", "SHARED")]);
    expect(result?.id).toBe("p2");
  });

  it("matches product_barcodes.value verbatim (no case folding for EAN/UPC)", () => {
    // Real EAN/UPC codes are numeric, so this guards a hypothetical
    // alpha-coded internal barcode from being silently uppercased.
    const p = product({ id: "p1", sku: undefined });
    const result = findProductForScan("abc123", [p], [barcode("p1", "ABC123")]);
    expect(result).toBeUndefined();
  });

  it("printed label barcode and POS scanner lookup agree (barcode source)", () => {
    const p = product({ id: "p1", sku: "ALT-001" });
    const barcodes = [barcode("p1", "8801001")];
    const printable = getPrintableBarcodeValue(p, barcodes);
    expect(printable?.source).toBe("barcode");
    expect(findProductForScan(printable!.value, [p], barcodes)?.id).toBe("p1");
  });

  it("printed label barcode and POS scanner lookup agree (sku source)", () => {
    const p = product({ id: "p1", sku: "BEE-001" });
    const printable = getPrintableBarcodeValue(p, []);
    expect(printable?.source).toBe("sku");
    // Regression: previously, labels with SKU-source printed but scanned
    // as "Barcode not found" because POS only consulted product_barcodes.
    expect(findProductForScan(printable!.value, [p], [])?.id).toBe("p1");
  });
});
