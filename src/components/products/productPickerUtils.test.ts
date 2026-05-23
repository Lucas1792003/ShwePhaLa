import { describe, expect, it } from "vitest";
import type { Category, Product, ProductBarcode } from "../../types";
import {
  filterProductPickerOptions,
  getProductPickerCategoryIcon,
  getSelectedProduct,
} from "./productPickerUtils";

const products: Product[] = [
  {
    id: "p-lays",
    sku: "SNK-001",
    name: "Lay's Original",
    category: "Snacks",
    unitType: "piece",
    priceMmk: 2500,
    lowStockThreshold: 5,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "p-water",
    sku: "DRK-002",
    name: "Mineral Water",
    category: "Drinks",
    unitType: "piece",
    priceMmk: 1000,
    lowStockThreshold: 10,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const categories: Category[] = [
  {
    id: "cat-snacks",
    name: "Snacks",
    color: "amber",
    iconKey: "snack",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "cat-drinks",
    name: "Drinks",
    color: "blue",
    iconKey: "water",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const barcodes: ProductBarcode[] = [
  {
    id: "barcode-lays",
    productId: "p-lays",
    value: "8851234567890",
    type: "EAN13",
  },
];

describe("filterProductPickerOptions", () => {
  it("filters by product name", () => {
    expect(filterProductPickerOptions(products, "lays", categories, barcodes)).toEqual([
      products[0],
    ]);
  });

  it("filters by SKU", () => {
    expect(filterProductPickerOptions(products, "drk-002", categories, barcodes)).toEqual([
      products[1],
    ]);
  });

  it("filters by barcode", () => {
    expect(filterProductPickerOptions(products, "885123", categories, barcodes)).toEqual([
      products[0],
    ]);
  });

  it("filters by category", () => {
    expect(filterProductPickerOptions(products, "snacks", categories, barcodes)).toEqual([
      products[0],
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterProductPickerOptions(products, "missing", categories, barcodes)).toEqual([]);
  });
});

describe("product picker helpers", () => {
  it("returns the selected product", () => {
    expect(getSelectedProduct(products, "p-water")).toBe(products[1]);
  });

  it("uses the category iconKey before name fallback", () => {
    expect(getProductPickerCategoryIcon(products[1], categories).key).toBe("water");
  });

  it("falls back to the product category name when category rows are missing", () => {
    expect(getProductPickerCategoryIcon(products[0], []).key).toBe("snack");
  });
});
