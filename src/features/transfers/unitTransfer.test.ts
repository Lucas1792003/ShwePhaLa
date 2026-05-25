import { describe, expect, it } from "vitest";
import type { ProductUnit } from "../../types";
import {
  getMaxTransferUnitQuantity,
  getTransferLineBaseQuantity,
  getTransferProductBaseTotal,
  transferProductExceedsStock,
  type UnitTransferLine,
} from "./unitTransfer";

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

const units = [
  makeUnit({ id: "unit-can", name: "Can", baseQuantity: 1, isDefault: true }),
  makeUnit({ id: "unit-case", name: "Case", baseQuantity: 24 }),
];

describe("unit-aware transfer helpers", () => {
  it("converts 2 Cases into 48 base units", () => {
    const line: UnitTransferLine = {
      productId: "prod-cola",
      productUnitId: "unit-case",
      selectedUnitQuantity: 2,
    };

    expect(getTransferLineBaseQuantity(line, units)).toBe(48);
  });

  it("keeps the legacy base-unit path working", () => {
    expect(getTransferLineBaseQuantity({ productId: "prod-cola", requestedQty: 7 }, units)).toBe(7);
  });

  it("totals mixed units by product in base units", () => {
    const lines: UnitTransferLine[] = [
      { lineId: "a", productId: "prod-cola", productUnitId: "unit-case", selectedUnitQuantity: 1 },
      { lineId: "b", productId: "prod-cola", productUnitId: "unit-can", selectedUnitQuantity: 1 },
    ];

    expect(getTransferProductBaseTotal(lines, "prod-cola", units)).toBe(25);
    expect(transferProductExceedsStock(lines, "prod-cola", units, 25)).toBe(false);
    expect(transferProductExceedsStock(lines, "prod-cola", units, 24)).toBe(true);
  });

  it("computes max selectable unit quantity from remaining base stock", () => {
    const lines: UnitTransferLine[] = [
      { lineId: "case", productId: "prod-cola", productUnitId: "unit-case", selectedUnitQuantity: 1 },
      { lineId: "can", productId: "prod-cola", productUnitId: "unit-can", selectedUnitQuantity: 1 },
    ];

    expect(getMaxTransferUnitQuantity(lines, lines[0], units, 25)).toBe(1);
    expect(getMaxTransferUnitQuantity(lines, lines[1], units, 25)).toBe(1);
  });
});
