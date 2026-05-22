import { describe, it, expect } from "vitest";
import type { Product } from "../../types";
import { countProductsUsingCategory, getCategoryDeleteBlockMessage } from "./categoryUsage";

// countProductsUsingCategory / getCategoryDeleteBlockMessage only read
// `product.category`, so minimal cast objects are enough.
const product = (category: string): Product => ({ category }) as Product;

describe("countProductsUsingCategory", () => {
  it("counts products matched by category name", () => {
    const products = [product("beer"), product("beer"), product("juice")];
    expect(countProductsUsingCategory(products, "beer")).toBe(2);
    expect(countProductsUsingCategory(products, "juice")).toBe(1);
  });

  it("is zero for an unused category", () => {
    expect(countProductsUsingCategory([product("beer")], "wine")).toBe(0);
    expect(countProductsUsingCategory([], "beer")).toBe(0);
  });
});

describe("getCategoryDeleteBlockMessage — safe category delete", () => {
  it("allows deletion (returns null) when no product uses the category", () => {
    expect(getCategoryDeleteBlockMessage([product("beer")], "wine")).toBeNull();
    expect(getCategoryDeleteBlockMessage([], "wine")).toBeNull();
  });

  it("blocks deletion with the friendly message when products use the category", () => {
    const products = [product("beer"), product("beer"), product("beer")];
    expect(getCategoryDeleteBlockMessage(products, "beer")).toBe(
      "This category is used by 3 product(s). Move or edit those products before deleting the category.",
    );
  });

  it("reports the exact product count in the block message", () => {
    expect(getCategoryDeleteBlockMessage([product("juice")], "juice")).toContain(
      "1 product(s)",
    );
  });

  it("a category used only by products of OTHER categories is deletable", () => {
    const products = [product("beer"), product("juice")];
    expect(getCategoryDeleteBlockMessage(products, "water")).toBeNull();
  });
});
