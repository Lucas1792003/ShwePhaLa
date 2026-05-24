import { describe, expect, it } from "vitest";
import type { CartItem } from "../../types";
import { calculateCartTotals } from "./service";

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: "prod-1-unit-case",
  productId: "prod-1",
  productUnitId: "unit-case",
  name: "Shark Energy Drink",
  unitName: "Case",
  qty: 2,
  unitPriceMmk: 55000,
  unitBaseQuantity: 24,
  unitsPerItem: 24,
  unitLabel: "Case",
  ...overrides,
});

describe("calculateCartTotals", () => {
  it("uses sellable-unit price per cart quantity, not per base unit", () => {
    const totals = calculateCartTotals([item()], 0);
    expect(totals.subtotal).toBe(110000);
    expect(totals.total).toBe(110000);
  });

  it("rounds item discounts on the sellable-unit line total", () => {
    const totals = calculateCartTotals([item({ qty: 1, itemDiscountPct: 10 })], 0);
    expect(totals.itemDiscount).toBe(5500);
    expect(totals.total).toBe(49500);
  });
});

