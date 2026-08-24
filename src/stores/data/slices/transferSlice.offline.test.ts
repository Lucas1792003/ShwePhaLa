import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rpc = vi.fn();
vi.mock("../../../lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { createTransferSlice } from "./transferSlice";
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
  const slice = createTransferSlice(set as any, get as any, {} as any);
  state = {
    ...slice,
    getInventoryQty: (shopId: string, productId: string) =>
      state.inventory.find((i: { shopId: string; productId: string }) => i.shopId === shopId && i.productId === productId)
        ?.qtyBaseUnits ?? 0,
    stockTransfers: [{ id: "tr-1", transferNo: "TR-1", fromShopId: "shop-a", toShopId: "shop-b", status: "APPROVED", createdBy: "user-1", createdAt: "t0" }],
    stockTransferItems: [{ id: "tri-1", transferId: "tr-1", productId: "p1", requestedQty: 10, approvedQty: 10 }],
    inventory: [
      { shopId: "shop-a", productId: "p1", qtyBaseUnits: 50 },
      { shopId: "shop-b", productId: "p1", qtyBaseUnits: 0 },
    ],
    movements: [],
    auditLogs: [],
    ...seed,
  };
  registerOutboxReconciler("dispatch_stock_transfer", (data, provisional) =>
    get().reconcileDispatchTransfer(data, provisional ?? []));
  registerOutboxReconciler("receive_stock_transfer", (data, provisional) =>
    get().reconcileReceiveTransfer(data, provisional ?? []));
  return { get };
}

beforeEach(async () => {
  rpc.mockReset();
  await Promise.all(localDb.tables.map((t) => t.clear()));
  vi.stubGlobal("navigator", { onLine: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("dispatchTransfer offline", () => {
  it("flips the transfer to IN_TRANSIT with no inventory change", async () => {
    const { get } = makeStore();

    await get().dispatchTransfer({ transferId: "tr-1", actorId: "user-1" });

    expect(get().stockTransfers[0]).toMatchObject({ status: "IN_TRANSIT", dispatchedBy: "user-1", pendingSync: true });
    expect(get().inventory).toEqual([
      { shopId: "shop-a", productId: "p1", qtyBaseUnits: 50 },
      { shopId: "shop-b", productId: "p1", qtyBaseUnits: 0 },
    ]);
    expect(rpc).not.toHaveBeenCalled();
    expect((await localDb.syncOutbox.toArray())[0].name).toBe("dispatch_stock_transfer");
  });

  it("rejects dispatching a transfer that isn't APPROVED", async () => {
    const { get } = makeStore({ stockTransfers: [{ id: "tr-1", status: "PENDING" }] });
    await expect(get().dispatchTransfer({ transferId: "tr-1", actorId: "user-1" }))
      .rejects.toThrow("cannot be dispatched from status PENDING");
  });
});

describe("receiveTransfer offline", () => {
  it("moves stock source → dest, writes paired movements, and completes the transfer", async () => {
    const { get } = makeStore({
      stockTransfers: [{ id: "tr-1", transferNo: "TR-1", fromShopId: "shop-a", toShopId: "shop-b", status: "IN_TRANSIT" }],
    });

    await get().receiveTransfer({ transferId: "tr-1", actorId: "user-2" });

    expect(get().stockTransfers[0]).toMatchObject({ status: "COMPLETED", receivedBy: "user-2", pendingSync: true });
    expect(get().inventory).toEqual(expect.arrayContaining([
      { shopId: "shop-a", productId: "p1", qtyBaseUnits: 40 },
      { shopId: "shop-b", productId: "p1", qtyBaseUnits: 10 },
    ]));
    expect(get().movements).toHaveLength(2);
    expect(get().movements.find((m: { type: string }) => m.type === "TRANSFER_OUT")).toMatchObject({ qtyChange: -10, pendingSync: true });
    expect(get().movements.find((m: { type: string }) => m.type === "TRANSFER_IN")).toMatchObject({ qtyChange: 10, pendingSync: true });
  });

  it("clamps to the approved quantity and refuses insufficient source stock", async () => {
    const { get } = makeStore({
      stockTransfers: [{ id: "tr-1", transferNo: "TR-1", fromShopId: "shop-a", toShopId: "shop-b", status: "IN_TRANSIT" }],
      inventory: [{ shopId: "shop-a", productId: "p1", qtyBaseUnits: 3 }, { shopId: "shop-b", productId: "p1", qtyBaseUnits: 0 }],
    });
    await expect(get().receiveTransfer({ transferId: "tr-1", actorId: "user-2" }))
      .rejects.toThrow("Insufficient stock at source");
  });

  it("honors a short (partial) receipt", async () => {
    const { get } = makeStore({
      stockTransfers: [{ id: "tr-1", transferNo: "TR-1", fromShopId: "shop-a", toShopId: "shop-b", status: "IN_TRANSIT" }],
    });
    await get().receiveTransfer({ transferId: "tr-1", actorId: "user-2", receivedItems: [{ productId: "p1", receivedQty: 4 }] });
    expect(get().inventory.find((i: { shopId: string }) => i.shopId === "shop-b")?.qtyBaseUnits).toBe(4);
    expect(get().stockTransferItems[0].transferredQty).toBe(4);
  });

  it("replaces the provisional movements with the server's on sync", async () => {
    const { get } = makeStore({
      stockTransfers: [{ id: "tr-1", transferNo: "TR-1", fromShopId: "shop-a", toShopId: "shop-b", status: "IN_TRANSIT" }],
    });
    await get().receiveTransfer({ transferId: "tr-1", actorId: "user-2" });
    const provisionalIds = get().movements.map((m: { id: string }) => m.id);

    vi.stubGlobal("navigator", { onLine: true });
    rpc.mockResolvedValue({
      data: {
        stockTransfer: { id: "tr-1", status: "COMPLETED" },
        stockTransferItems: [{ id: "tri-1", transferredQty: 10 }],
        inventory: [{ shopId: "shop-a", productId: "p1", qtyBaseUnits: 40 }, { shopId: "shop-b", productId: "p1", qtyBaseUnits: 10 }],
        movements: [{ id: "mv-server-out" }, { id: "mv-server-in" }],
        auditLogs: [],
      },
      error: null,
    });
    await drainOutbox();

    expect(get().movements.map((m: { id: string }) => m.id).sort()).toEqual(["mv-server-in", "mv-server-out"]);
    for (const id of provisionalIds) {
      expect(await localDb.movements.get(id)).toBeUndefined();
    }
  });
});
