import { describe, expect, it } from "vitest";
import type { CartItem, Product } from "../../types";
import {
  STOCK_OVERRIDE_REQUIRED_MESSAGE,
  clampCartItemQuantity,
  getCartAddStockStatus,
  normalizeCartQuantityInput,
  validatePosCart,
} from "./cartStock";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "prod-1",
  name: "Tea Mix",
  category: "Drinks",
  unitType: "piece",
  priceMmk: 1000,
  lowStockThreshold: 2,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const cartItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: "prod-1-1",
  productId: "prod-1",
  productUnitId: "unit-single",
  name: "Tea Mix",
  unitName: "Sachet",
  qty: 1,
  unitPriceMmk: 1000,
  unitsPerItem: 1,
  unitBaseQuantity: 1,
  unitLabel: "unit",
  ...overrides,
});

describe("POS cart stock rules", () => {
  it("allows adding a product until shop stock is reserved in the cart", () => {
    const item = cartItem({ qty: 3 });
    expect(getCartAddStockStatus(product(), false, [item], { "prod-1": 4 }).canAdd).toBe(true);
    expect(getCartAddStockStatus(product(), false, [{ ...item, qty: 4 }], { "prod-1": 4 }).canAdd).toBe(false);
  });

  it("clamps manual quantity above available stock", () => {
    const item = cartItem({ qty: 1 });
    const result = clampCartItemQuantity(item, [item], { "prod-1": 4 }, 9);
    expect(result.qty).toBe(4);
    expect(result.clamped).toBe(true);
    expect(result.blockedByStock).toBe(true);
  });

  it("normalizes leading zeros and pasted separators", () => {
    expect(normalizeCartQuantityInput("09")).toBe("9");
    expect(normalizeCartQuantityInput("1,000")).toBe("1000");
    expect(normalizeCartQuantityInput("-5")).toBe("5");
    expect(normalizeCartQuantityInput("")).toBe("");
  });

  it("ignores legacy packSize for add attempts", () => {
    const status = getCartAddStockStatus(product({ packSize: 24 }), true, [], { "prod-1": 4 });
    expect(status.canAdd).toBe(true);
    expect(status.unitsPerItem).toBe(1);
  });

  it("tracks mixed sellable units by base stock", () => {
    const caseLine = cartItem({
      id: "prod-1-case",
      productUnitId: "unit-case",
      unitName: "Case",
      qty: 1,
      unitBaseQuantity: 24,
      unitsPerItem: 24,
    });
    const status = getCartAddStockStatus(
      product(),
      { baseQuantity: 6 },
      [caseLine],
      { "prod-1": 25 }
    );
    expect(status.canAdd).toBe(false);
    expect(status.remainingUnits).toBe(1);

    const singleStatus = getCartAddStockStatus(
      product(),
      { baseQuantity: 1 },
      [caseLine],
      { "prod-1": 25 }
    );
    expect(singleStatus.canAdd).toBe(true);
  });

  it("disables checkout when there is no open shift", () => {
    const validation = validatePosCart([cartItem()], { "prod-1": 4 }, {
      hasOpenShift: false,
      canOverrideStock: false,
    });
    expect(validation.canCheckout).toBe(false);
    expect(validation.errors).toContain("Open a shift before checkout.");
  });

  it("disables checkout when quantity exceeds stock", () => {
    const validation = validatePosCart([cartItem({ qty: 5 })], { "prod-1": 4 }, {
      hasOpenShift: true,
      canOverrideStock: false,
    });
    expect(validation.canCheckout).toBe(false);
    expect(validation.errors).toContain("Only 4 in stock for this shop.");
  });

  it("does not let manager/admin stock override happen silently", () => {
    const validation = validatePosCart([cartItem({ qty: 5 })], { "prod-1": 4 }, {
      hasOpenShift: true,
      canOverrideStock: true,
    });
    expect(validation.canCheckout).toBe(false);
    expect(validation.errors[0]).toContain(STOCK_OVERRIDE_REQUIRED_MESSAGE);
    expect(validation.errors[0]).toContain("Stock override UI is needed before checkout.");
  });

  it("does not let a cashier override stock", () => {
    const validation = validatePosCart([cartItem({ qty: 5 })], { "prod-1": 4 }, {
      hasOpenShift: true,
      canOverrideStock: false,
    });
    expect(validation.canCheckout).toBe(false);
    expect(validation.errors).not.toContain(STOCK_OVERRIDE_REQUIRED_MESSAGE);
  });
});
