import { describe, expect, it } from "vitest";
import type { Refund, Sale, Shift } from "../../types";
import { buildShiftBreakdown } from "./service";

const shift = (overrides: Partial<Shift> = {}): Shift => ({
  id: "shift-a",
  shopId: "shop-a",
  cashierId: "cashier-a",
  startedAt: "2026-05-15T08:00:00.000Z",
  openingCashMmk: 1000,
  ...overrides,
});

const sale = (overrides: Partial<Sale>): Sale => ({
  id: "sale-a",
  shopId: "shop-a",
  shiftId: "shift-a",
  receiptNo: "A-001",
  cashierId: "cashier-a",
  status: "NORMAL",
  subtotalMmk: 0,
  discountMmk: 0,
  totalMmk: 0,
  paymentMethod: "CASH",
  paidMmk: 0,
  changeMmk: 0,
  createdAt: "2026-05-15T09:00:00.000Z",
  ...overrides,
});

const refund = (overrides: Partial<Refund>): Refund => ({
  id: "refund-a",
  saleId: "sale-cash",
  shopId: "shop-a",
  type: "PARTIAL",
  reason: "return",
  createdBy: "manager-a",
  createdAt: "2026-05-15T10:00:00.000Z",
  status: "APPROVED",
  items: [{ productId: "product-a", qtyUnits: 1, amountMmk: 200 }],
  ...overrides,
});

describe("buildShiftBreakdown", () => {
  it("computes active expected cash from opening cash, cash sales, and approved cash refunds", () => {
    const sales: Sale[] = [
      sale({ id: "sale-cash", totalMmk: 2500, paymentMethod: "CASH" }),
      sale({ id: "sale-other", totalMmk: 800, paymentMethod: "OTHER" }),
      sale({ id: "sale-void", totalMmk: 900, paymentMethod: "CASH", status: "VOID" }),
    ];

    const breakdown = buildShiftBreakdown(shift(), sales, [
      refund({ saleId: "sale-cash", items: [{ productId: "product-a", qtyUnits: 1, amountMmk: 200 }] }),
      refund({ id: "refund-other", saleId: "sale-other", items: [{ productId: "product-b", qtyUnits: 1, amountMmk: 300 }] }),
      refund({ id: "refund-pending", saleId: "sale-cash", status: "REQUESTED", items: [{ productId: "product-a", qtyUnits: 1, amountMmk: 100 }] }),
    ]);

    expect(breakdown).toMatchObject({
      isOpen: true,
      cashSaleCount: 1,
      otherSaleCount: 1,
      cashTotal: 2500,
      otherTotal: 800,
      voidedCount: 1,
      approvedCashRefunds: 200,
      expectedCash: 3300,
      salesCount: 3,
    });
  });

  it("uses stored expected cash for closed shifts", () => {
    const closed = shift({
      endedAt: "2026-05-15T12:00:00.000Z",
      expectedCashMmk: 4200,
      closingCashMmk: 4200,
      varianceMmk: 0,
    });

    expect(buildShiftBreakdown(closed, [sale({ id: "sale-cash", totalMmk: 100 })]).expectedCash).toBe(4200);
  });
});
