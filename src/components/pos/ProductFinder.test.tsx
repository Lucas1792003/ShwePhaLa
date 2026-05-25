import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Category, Product, ProductUnit } from "../../types";
import { ProductFinder } from "./ProductFinder";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "prod-1",
  sku: "TEA-001",
  name: "Tea Mix",
  category: "Drinks",
  unitType: "Sachet",
  priceMmk: 1000,
  lowStockThreshold: 2,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const category = (overrides: Partial<Category> = {}): Category => ({
  id: "cat-drinks",
  name: "Drinks",
  color: "blue",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const unit = (overrides: Partial<ProductUnit> = {}): ProductUnit => ({
  id: "unit-prod-1-default",
  productId: "prod-1",
  name: "Sachet",
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

describe("ProductFinder", () => {
  it("does not render Add Pack from legacy packSize", () => {
    const markup = renderToStaticMarkup(
      <ProductFinder
        products={[product({ packSize: 24 })]}
        categories={[category()]}
        search=""
        category="all"
        onSearch={() => undefined}
        onCategory={() => undefined}
        inventoryById={{ "prod-1": 100 }}
        productUnits={[unit()]}
        onAdd={() => undefined}
      />
    );

    expect(markup).not.toContain("Add Pack");
    expect(markup).not.toContain("pack of");
  });

  it("renders configured sellable units instead of legacy pack controls", () => {
    const markup = renderToStaticMarkup(
      <ProductFinder
        products={[product()]}
        categories={[category()]}
        search=""
        category="all"
        onSearch={() => undefined}
        onCategory={() => undefined}
        inventoryById={{ "prod-1": 100 }}
        productUnits={[unit(), unit({ id: "unit-case", name: "Case", baseQuantity: 24, salePriceMmk: 22000, isDefault: false })]}
        onAdd={() => undefined}
      />
    );

    expect(markup).toContain("Sachet");
    expect(markup).toContain("Case");
    expect(markup).not.toContain("Add Pack");
  });
});
