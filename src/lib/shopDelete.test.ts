import { describe, expect, it } from "vitest";
import {
  SHOP_DELETE_MESSAGES,
  countShopReferences,
  formatShopReferenceSummary,
  mapShopDeleteError,
} from "./shopDelete";

const emptyRefs = {
  users: [],
  inventory: [],
  shifts: [],
  sales: [],
  purchaseOrders: [],
  supplierPayments: [],
  stockTransfers: [],
  priceTiers: [],
  refundVoidRequests: [],
  auditLogs: [],
};

describe("countShopReferences", () => {
  it("returns total=0 when nothing references the shop", () => {
    expect(countShopReferences("shop-x", emptyRefs).total).toBe(0);
  });

  it("counts references across all shop-bearing tables", () => {
    const counts = countShopReferences("shop-x", {
      ...emptyRefs,
      users: [{ shopId: "shop-x" }, { shopId: "shop-y" }],
      inventory: [{ shopId: "shop-x" }, { shopId: "shop-x" }],
      shifts: [{ shopId: "shop-x" }],
      sales: [{ shopId: "shop-x" }],
      purchaseOrders: [{ shopId: "shop-y" }],
      stockTransfers: [
        { fromShopId: "shop-x", toShopId: "shop-y" },
        { fromShopId: "shop-y", toShopId: "shop-x" },
        { fromShopId: "shop-y", toShopId: "shop-z" },
      ],
      auditLogs: [{ shopId: "shop-x" }, { shopId: null as unknown as string }],
    });
    expect(counts.users).toBe(1);
    expect(counts.inventory).toBe(2);
    expect(counts.shifts).toBe(1);
    expect(counts.sales).toBe(1);
    expect(counts.purchaseOrders).toBe(0);
    expect(counts.stockTransfers).toBe(2);
    expect(counts.auditLogs).toBe(1);
    expect(counts.total).toBe(8);
  });
});

describe("formatShopReferenceSummary", () => {
  it("omits zero buckets and pluralises the labels", () => {
    const summary = formatShopReferenceSummary({
      users: 2, inventory: 5, shifts: 0, sales: 1,
      purchaseOrders: 0, supplierPayments: 0, stockTransfers: 0,
      priceTiers: 0, refundVoidRequests: 0, auditLogs: 0,
      total: 8,
    });
    expect(summary).toBe("2 users, 5 inventory rows, 1 sales");
  });
});

describe("mapShopDeleteError", () => {
  it("maps Postgres FK violation (23503) to the friendly message", () => {
    expect(
      mapShopDeleteError({
        code: "23503",
        message:
          'update or delete on table "shops" violates foreign key constraint "users_shop_id_fkey" on table "users"',
      })
    ).toBe(SHOP_DELETE_MESSAGES.fkViolation);
  });

  it("passes other errors through getErrorMessage", () => {
    expect(mapShopDeleteError(new Error("network down"))).toBe("network down");
  });
});
