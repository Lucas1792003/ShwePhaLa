import { describe, it, expect } from "vitest";
import type { ProductUnit } from "../../types";
import {
  convertToBaseQuantity,
  decomposeBaseQuantity,
  formatStockQuantity,
} from "./stockDisplay";

const makeUnit = (
  overrides: Partial<ProductUnit> & { id: string; name: string; baseQuantity: number },
): ProductUnit => ({
  id: overrides.id,
  productId: overrides.productId ?? "prod-cola",
  name: overrides.name,
  baseQuantity: overrides.baseQuantity,
  salePriceMmk: overrides.salePriceMmk ?? 0,
  purchasePriceMmk: overrides.purchasePriceMmk,
  isDefault: overrides.isDefault ?? overrides.baseQuantity === 1,
  isActive: overrides.isActive ?? true,
  sortOrder: overrides.sortOrder ?? 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const colaUnits: ProductUnit[] = [
  makeUnit({ id: "u-can", name: "Can", baseQuantity: 1, isDefault: true, sortOrder: 0 }),
  makeUnit({ id: "u-pkg", name: "Package", baseQuantity: 24, sortOrder: 10 }),
];

describe("decomposeBaseQuantity", () => {
  it("returns empty for zero stock", () => {
    expect(decomposeBaseQuantity(0, colaUnits, "prod-cola")).toEqual([]);
  });

  it("greedy-picks the largest active unit first (headline example)", () => {
    // 214 cans = 8 packages (192) + 22 cans
    const parts = decomposeBaseQuantity(214, colaUnits, "prod-cola");
    expect(parts).toHaveLength(2);
    expect(parts[0].unit.name).toBe("Package");
    expect(parts[0].qty).toBe(8);
    expect(parts[1].unit.name).toBe("Can");
    expect(parts[1].qty).toBe(22);
  });

  it("skips tiers that fit zero times", () => {
    // 5 cans → no Package, just Cans
    const parts = decomposeBaseQuantity(5, colaUnits, "prod-cola");
    expect(parts).toEqual([{ unit: colaUnits[1].baseQuantity === 1 ? colaUnits[1] : colaUnits[0], qty: 5 }]);
  });

  it("ignores inactive units", () => {
    const units = [
      ...colaUnits,
      makeUnit({ id: "u-case", name: "Case", baseQuantity: 48, isActive: false }),
    ];
    const parts = decomposeBaseQuantity(214, units, "prod-cola");
    // Should NOT pick Case (48) even though it's larger
    expect(parts.some((p) => p.unit.name === "Case")).toBe(false);
    expect(parts[0].unit.name).toBe("Package");
  });

  it("ignores units of other products", () => {
    const units = [
      ...colaUnits,
      makeUnit({ id: "u-other", name: "Mega", baseQuantity: 100, productId: "prod-other" }),
    ];
    const parts = decomposeBaseQuantity(214, units, "prod-cola");
    expect(parts.some((p) => p.unit.name === "Mega")).toBe(false);
  });

  it("handles three-tier decomposition", () => {
    const threeTier: ProductUnit[] = [
      makeUnit({ id: "a", name: "Can", baseQuantity: 1, sortOrder: 0 }),
      makeUnit({ id: "b", name: "Pack", baseQuantity: 6, sortOrder: 10 }),
      makeUnit({ id: "c", name: "Case", baseQuantity: 24, sortOrder: 20 }),
    ];
    // 75 cans = 3 Case (72) + 0 Pack + 3 Can
    const parts = decomposeBaseQuantity(75, threeTier, "prod-cola");
    expect(parts.map((p) => `${p.qty} ${p.unit.name}`)).toEqual(["3 Case", "3 Can"]);
  });

  it("falls back to empty when no active units exist", () => {
    expect(decomposeBaseQuantity(214, [], "prod-cola")).toEqual([]);
  });
});

describe("formatStockQuantity", () => {
  it("produces the headline 8 Package 22 Can string", () => {
    expect(formatStockQuantity(214, colaUnits, "prod-cola")).toBe("8 Package 22 Can");
  });

  it("returns 0 with base unit name when stock is zero", () => {
    expect(formatStockQuantity(0, colaUnits, "prod-cola", "Can")).toBe("0 Can");
  });

  it("falls back to raw count + baseUnitName when no product units exist", () => {
    expect(formatStockQuantity(214, [], "prod-cola", "Piece")).toBe("214 Piece");
  });

  it("falls back to raw count when no name and no units", () => {
    expect(formatStockQuantity(7, [], "prod-cola")).toBe("7");
  });
});

describe("convertToBaseQuantity", () => {
  it("multiplies quantity by base_quantity", () => {
    expect(convertToBaseQuantity(10, { baseQuantity: 24 })).toBe(240); // 10 packages of 24 = 240 cans
    expect(convertToBaseQuantity(2, { baseQuantity: 24 })).toBe(48); // headline POS example: 2 cases = 48 cans
  });

  it("treats missing or invalid base_quantity as 1", () => {
    expect(convertToBaseQuantity(5, undefined)).toBe(5);
    expect(convertToBaseQuantity(5, { baseQuantity: 0 })).toBe(5);
  });

  it("clamps negative or non-integer quantities", () => {
    expect(convertToBaseQuantity(-3, { baseQuantity: 24 })).toBe(0);
    expect(convertToBaseQuantity(3.7, { baseQuantity: 24 })).toBe(72);
    expect(convertToBaseQuantity(NaN, { baseQuantity: 24 })).toBe(0);
  });
});
