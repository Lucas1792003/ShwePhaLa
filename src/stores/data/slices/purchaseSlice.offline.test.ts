import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rpc = vi.fn();
vi.mock("../../../lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
  dbExec: vi.fn(),
}));
vi.mock("../../authStore", () => ({
  useAuthStore: { getState: () => ({ currentUserId: "user-1" }) },
}));

import { createPurchaseSlice } from "./purchaseSlice";
import { localDb } from "../../../lib/localDb";
import { drainOutbox, registerOutboxReconciler } from "../outbox";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStore(seed: Record<string, any> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let state: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (updater: any) => {
    const patch = typeof updater === "function" ? updater(state) : updater;
    state = { ...state, ...patch };
  };
  const get = () => state;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slice = createPurchaseSlice(set as any, get as any, {} as any);
  state = {
    ...slice,
    productUnits: [],
    getInventoryQty: (shopId: string, productId: string) =>
      state.inventory.find((i: { shopId: string; productId: string }) => i.shopId === shopId && i.productId === productId)
        ?.qtyBaseUnits ?? 0,
    purchaseOrders: [{ id: "po-1", orderNo: "PO-1", shopId: "shop-1", supplierId: "sup-1", status: "APPROVED", subtotalMmk: 0, totalMmk: 0, createdBy: "user-1", createdAt: "t0" }],
    purchaseOrderItems: [{ id: "poi-1", purchaseOrderId: "po-1", productId: "p1", orderedQty: 10, unitCostMmk: 1000, lineTotalMmk: 10000 }],
    inventory: [{ shopId: "shop-1", productId: "p1", qtyBaseUnits: 5 }],
    movements: [],
    supplierPayments: [],
    auditLogs: [],
    ...seed,
  };
  registerOutboxReconciler("receive_purchase_order", (data, provisional) =>
    get().reconcileReceivePurchaseOrder(data, provisional ?? []));
  registerOutboxReconciler("record_supplier_payment", (data, provisional) =>
    get().reconcileRecordSupplierPayment(data, provisional ?? []));
  return { get };
}

beforeEach(async () => {
  rpc.mockReset();
  await Promise.all(localDb.tables.map((t) => t.clear()));
  vi.stubGlobal("navigator", { onLine: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("receivePurchaseOrder offline", () => {
  it("bills at received value, updates the PO to RECEIVED, and stages a stock-in movement", async () => {
    const { get } = makeStore();

    await get().receivePurchaseOrder({
      purchaseOrderId: "po-1", receiverId: "user-1",
      receivedItems: [{ productId: "p1", receivedQty: 7 }], // less than ordered (10) — partial receive
    });

    const po = get().purchaseOrders[0];
    expect(po).toMatchObject({ status: "RECEIVED", subtotalMmk: 7000, totalMmk: 7000, pendingSync: true });
    expect(get().purchaseOrderItems[0].receivedQty).toBe(7);
    expect(get().inventory.find((i: { productId: string }) => i.productId === "p1")?.qtyBaseUnits).toBe(12);
    expect(get().movements[0]).toMatchObject({ type: "PURCHASE_IN", qtyChange: 7, pendingSync: true });

    const queued = await localDb.syncOutbox.toArray();
    expect(queued[0].name).toBe("receive_purchase_order");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a PO that isn't APPROVED", async () => {
    const { get } = makeStore({ purchaseOrders: [{ id: "po-1", status: "RECEIVED", shopId: "shop-1", totalMmk: 0 }] });
    await expect(
      get().receivePurchaseOrder({ purchaseOrderId: "po-1", receiverId: "user-1", receivedItems: [] }),
    ).rejects.toThrow("not in a receivable (APPROVED) status");
  });

  it("replaces the provisional movement with the server's on sync", async () => {
    const { get } = makeStore();
    await get().receivePurchaseOrder({
      purchaseOrderId: "po-1", receiverId: "user-1",
      receivedItems: [{ productId: "p1", receivedQty: 7 }],
    });
    const provisionalMovementId = get().movements[0].id;

    vi.stubGlobal("navigator", { onLine: true });
    rpc.mockResolvedValue({
      data: {
        purchaseOrder: { id: "po-1", status: "RECEIVED", totalMmk: 7000 },
        purchaseOrderItems: [{ id: "poi-1", purchaseOrderId: "po-1", receivedQty: 7 }],
        inventory: [{ shopId: "shop-1", productId: "p1", qtyBaseUnits: 12 }],
        movements: [{ id: "mv-server-1", shopId: "shop-1", productId: "p1" }],
        auditLogs: [],
      },
      error: null,
    });
    await drainOutbox();

    expect(get().movements.map((m: { id: string }) => m.id)).toEqual(["mv-server-1"]);
    expect(await localDb.movements.get(provisionalMovementId)).toBeUndefined();
  });
});

describe("recordSupplierPayment offline", () => {
  it("computes the new paid amount/status and stages a payment", async () => {
    const { get } = makeStore({
      purchaseOrders: [{ id: "po-1", shopId: "shop-1", supplierId: "sup-1", status: "RECEIVED", totalMmk: 10000, paidMmk: 4000 }],
    });

    await get().recordSupplierPayment({ purchaseOrderId: "po-1", amountMmk: 3000, paymentMethod: "CASH" });

    const po = get().purchaseOrders[0];
    expect(po).toMatchObject({ paidMmk: 7000, paymentStatus: "PARTIAL", pendingSync: true });
    expect(get().supplierPayments[0]).toMatchObject({ amountMmk: 3000, createdBy: "user-1", pendingSync: true });
  });

  it("marks the PO PAID once the payment covers the total", async () => {
    const { get } = makeStore({
      purchaseOrders: [{ id: "po-1", shopId: "shop-1", supplierId: "sup-1", status: "RECEIVED", totalMmk: 10000, paidMmk: 4000 }],
    });
    await get().recordSupplierPayment({ purchaseOrderId: "po-1", amountMmk: 6000, paymentMethod: "CASH" });
    expect(get().purchaseOrders[0].paymentStatus).toBe("PAID");
  });

  it("rejects a payment exceeding the outstanding balance", async () => {
    const { get } = makeStore({
      purchaseOrders: [{ id: "po-1", shopId: "shop-1", status: "RECEIVED", totalMmk: 10000, paidMmk: 9000 }],
    });
    await expect(
      get().recordSupplierPayment({ purchaseOrderId: "po-1", amountMmk: 2000, paymentMethod: "CASH" }),
    ).rejects.toThrow("exceeds outstanding balance");
  });

  it("rejects a payment against a PO that isn't RECEIVED", async () => {
    const { get } = makeStore({
      purchaseOrders: [{ id: "po-1", shopId: "shop-1", status: "APPROVED", totalMmk: 10000 }],
    });
    await expect(
      get().recordSupplierPayment({ purchaseOrderId: "po-1", amountMmk: 1000, paymentMethod: "CASH" }),
    ).rejects.toThrow("only be recorded against received purchase orders");
  });
});
