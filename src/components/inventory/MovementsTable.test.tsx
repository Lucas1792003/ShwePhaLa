import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InventoryMovement, Product } from "../../types";
import { MovementsTable } from "./MovementsTable";

const product: Product = {
  id: "prod-cola",
  name: "Cola",
  category: "Drinks",
  unitType: "Can",
  priceMmk: 2500,
  lowStockThreshold: 5,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("MovementsTable", () => {
  it("shows transfer base movement with entered-as unit snapshot", () => {
    const movement: InventoryMovement = {
      id: "move-1",
      shopId: "shop-a",
      productId: "prod-cola",
      type: "TRANSFER_OUT",
      qtyChange: -48,
      qtyBefore: 100,
      qtyAfter: 52,
      reason: "Stock transfer TRF-1",
      referenceType: "transfer",
      referenceId: "transfer-1",
      createdBy: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      productUnitId: "unit-case",
      unitNameSnapshot: "Case",
      unitBaseQuantitySnapshot: 24,
      selectedUnitQuantity: 2,
    };

    const markup = renderToStaticMarkup(
      <MovementsTable movements={[movement]} products={[product]} />
    );

    expect(markup).toContain("-48 Can");
    expect(markup).toContain("Entered as 2 Case");
  });
});
