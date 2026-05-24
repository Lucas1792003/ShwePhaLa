import { describe, expect, it } from "vitest";
import type { Product } from "../../types";
import {
  PRODUCT_FORM_VISIBLE_FIELDS,
  buildProductFromFormValues,
  type ProductFormValues,
} from "./productForm";

const values = (overrides: Partial<ProductFormValues> = {}): ProductFormValues => ({
  sku: "TEA-001",
  name: "Tea Mix",
  category: "Drinks",
  unitType: "Sachet",
  priceMmk: 1000,
  costMmk: undefined,
  lowStockThreshold: 5,
  expiryDate: undefined,
  imageUrl: undefined,
  isActive: true,
  ...overrides,
});

const legacyProduct = (overrides: Partial<Product> = {}): Product => ({
  id: "prod-1",
  sku: "TEA-001",
  name: "Tea Mix",
  category: "Drinks",
  unitType: "Sachet",
  priceMmk: 1000,
  lowStockThreshold: 5,
  packSize: 24,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("product form fields", () => {
  it("does not expose Pack Size in the create/edit field list", () => {
    expect(PRODUCT_FORM_VISIBLE_FIELDS).toContain("Unit Type");
    expect(PRODUCT_FORM_VISIBLE_FIELDS).toContain("Sellable Units");
    expect(PRODUCT_FORM_VISIBLE_FIELDS).not.toContain("Package Barcodes");
    expect(PRODUCT_FORM_VISIBLE_FIELDS).not.toContain("Pack Size");
  });

  it("creates products without writing a new packSize", () => {
    const product = buildProductFromFormValues(values(), "prod-new", null);
    expect(product.packSize).toBeUndefined();
    expect(product.unitType).toBe("Sachet");
  });

  it("edits old products without losing legacy packSize", () => {
    const existing = legacyProduct();
    const product = buildProductFromFormValues(values({ name: "Tea Mix Updated" }), existing.id, existing);
    expect(product.name).toBe("Tea Mix Updated");
    expect(product.packSize).toBe(24);
    expect(product.createdAt).toBe(existing.createdAt);
  });
});
