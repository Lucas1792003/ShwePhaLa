import { describe, expect, it } from "vitest";
import type { PurchaseOrder } from "../../types";
import {
  buildSupplierFinancialSummary,
  getComputedPaymentStatus,
  getPurchaseOrderBalanceMmk,
} from "./debt";

const po = (overrides: Partial<PurchaseOrder>): PurchaseOrder => ({
  id: overrides.id ?? "po-1",
  orderNo: overrides.orderNo ?? "PO-1",
  shopId: overrides.shopId ?? "shop-a",
  supplierId: overrides.supplierId ?? "supplier-1",
  status: overrides.status ?? "RECEIVED",
  subtotalMmk: overrides.subtotalMmk ?? overrides.totalMmk ?? 0,
  totalMmk: overrides.totalMmk ?? 0,
  createdBy: overrides.createdBy ?? "user-1",
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("supplier debt calculations", () => {
  it("sums received PO balances as supplier debt", () => {
    const summary = buildSupplierFinancialSummary("supplier-1", [
      po({ id: "received-unpaid", totalMmk: 100000 }),
      po({ id: "received-partial", totalMmk: 75000, paidMmk: 25000 }),
    ]);

    expect(summary.totalReceivedPurchasesMmk).toBe(175000);
    expect(summary.totalPaidMmk).toBe(25000);
    expect(summary.outstandingDebtMmk).toBe(150000);
  });

  it("does not add created or approved POs to debt before receiving", () => {
    const summary = buildSupplierFinancialSummary("supplier-1", [
      po({ id: "draft", status: "DRAFT", totalMmk: 100000 }),
      po({ id: "approved", status: "APPROVED", totalMmk: 50000 }),
    ]);

    expect(summary.totalReceivedPurchasesMmk).toBe(0);
    expect(summary.outstandingDebtMmk).toBe(0);
    expect(summary.pendingPoCount).toBe(2);
  });

  it("does not count canceled POs as debt", () => {
    const summary = buildSupplierFinancialSummary("supplier-1", [
      po({ id: "canceled", status: "CANCELED", totalMmk: 100000 }),
    ]);

    expect(summary.totalReceivedPurchasesMmk).toBe(0);
    expect(summary.outstandingDebtMmk).toBe(0);
    expect(summary.pendingPoCount).toBe(0);
  });

  it("computes unpaid, partial, and paid statuses from received totals and payments", () => {
    expect(getComputedPaymentStatus(po({ totalMmk: 100000, paidMmk: 0 }))).toBe("UNPAID");
    expect(getComputedPaymentStatus(po({ totalMmk: 100000, paidMmk: 40000 }))).toBe("PARTIAL");
    expect(getComputedPaymentStatus(po({ totalMmk: 100000, paidMmk: 100000 }))).toBe("PAID");
  });

  it("fully paid received POs have zero balance", () => {
    expect(getPurchaseOrderBalanceMmk(po({ totalMmk: 100000, paidMmk: 100000 }))).toBe(0);
  });

  it("can scope debt to a supplier's shop", () => {
    const orders = [
      po({ id: "shop-a", shopId: "shop-a", totalMmk: 100000, paidMmk: 25000 }),
      po({ id: "shop-b", shopId: "shop-b", totalMmk: 90000 }),
    ];

    expect(buildSupplierFinancialSummary("supplier-1", orders, "shop-a").outstandingDebtMmk).toBe(75000);
    expect(buildSupplierFinancialSummary("supplier-1", orders, "shop-b").outstandingDebtMmk).toBe(90000);
  });
});
