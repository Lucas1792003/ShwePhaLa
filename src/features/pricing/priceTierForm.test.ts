import { describe, expect, it } from "vitest";
import type { Product } from "../../types";
import { getPriceTierProductError } from "./priceTierForm";

const products: Product[] = [
  {
    id: "active-product",
    sku: "SKU-001",
    name: "Active Product",
    category: "Snacks",
    unitType: "piece",
    priceMmk: 2000,
    lowStockThreshold: 5,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "inactive-product",
    sku: "SKU-002",
    name: "Inactive Product",
    category: "Snacks",
    unitType: "piece",
    priceMmk: 3000,
    lowStockThreshold: 5,
    isActive: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("getPriceTierProductError", () => {
  it("blocks saving without a product", () => {
    expect(getPriceTierProductError("", products)).toBe("Product is required.");
  });

  it("allows active selected products", () => {
    expect(getPriceTierProductError("active-product", products)).toBeNull();
  });

  it("blocks missing products", () => {
    expect(getPriceTierProductError("missing-product", products)).toBe(
      "Selected product is no longer available.",
    );
  });

  it("blocks inactive products", () => {
    expect(getPriceTierProductError("inactive-product", products)).toBe(
      "Selected product is no longer available.",
    );
  });
});
