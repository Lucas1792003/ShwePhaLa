import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rpc = vi.fn();
const TEST_AUTH_ID = "auth-test-user";
vi.mock("../../../lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: TEST_AUTH_ID } } } }) },
  },
}));

import { createInventorySlice } from "./inventorySlice";
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
  const slice = createInventorySlice(set as any, get as any, {} as any);
  state = {
    ...slice,
    productUnits: [{ id: "u1", isDefault: true, baseQuantity: 1 }],
    inventory: [{ shopId: "shop-1", productId: "p1", qtyBaseUnits: 10 }],
    movements: [],
    auditLogs: [],
    ...seed,
  };
  registerOutboxReconciler("adjust_stock", (data, provisional) =>
    get().reconcileAdjustStock(data, provisional ?? []));
  return { get, set };
}

beforeEach(async () => {
  rpc.mockReset();
  await Promise.all(localDb.tables.map((t) => t.clear()));
  await localDb.authCache.put({
    authId: TEST_AUTH_ID, userId: "user-1", role: "CASHIER", shopId: "shop-1",
    isActive: true, hasTotp: false, cachedAt: new Date().toISOString(),
  });
  vi.stubGlobal("navigator", { onLine: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("adjustStock offline", () => {
  it("stages a provisional movement locally without touching the network", async () => {
    const { get } = makeStore();

    await get().adjustStock({
      shopId: "shop-1", productId: "p1", type: "ADJUSTMENT",
      qtyChange: -3, reason: "Recount", actorId: "user-1",
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(get().inventory.find((i: { productId: string }) => i.productId === "p1")?.qtyBaseUnits).toBe(7);
    expect(get().movements[0]).toMatchObject({ pendingSync: true, qtyChange: -3, qtyBefore: 10, qtyAfter: 7 });

    const queued = await localDb.syncOutbox.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0].name).toBe("adjust_stock");
  });

  it("resolves the unit-aware magnitude the same way the server does", async () => {
    const { get } = makeStore({
      inventory: [{ shopId: "shop-1", productId: "p1", qtyBaseUnits: 100 }],
      productUnits: [{ id: "case-1", isDefault: false, baseQuantity: 24 }],
    });

    await get().adjustStock({
      shopId: "shop-1", productId: "p1", type: "DAMAGE",
      qtyChange: -1, reason: "Broken case", actorId: "user-1",
      productUnitId: "case-1", unitQty: 2,
    });

    // 2 cases * 24/case = 48 base units, sign taken from qtyChange (-1 => negative)
    expect(get().inventory.find((i: { productId: string }) => i.productId === "p1")?.qtyBaseUnits).toBe(52);
    expect(get().movements[0].qtyChange).toBe(-48);
  });

  it("refuses an adjustment that would leave stock negative", async () => {
    const { get } = makeStore({ inventory: [{ shopId: "shop-1", productId: "p1", qtyBaseUnits: 2 }] });

    await expect(
      get().adjustStock({ shopId: "shop-1", productId: "p1", type: "DAMAGE", qtyChange: -5, reason: "x", actorId: "user-1" }),
    ).rejects.toThrow("Adjustment would leave negative stock (-3).");
    expect(await localDb.syncOutbox.count()).toBe(0);
  });

  it("replaces the provisional movement with the server's authoritative one once the outbox drains", async () => {
    const { get } = makeStore();
    await get().adjustStock({
      shopId: "shop-1", productId: "p1", type: "ADJUSTMENT",
      qtyChange: -3, reason: "Recount", actorId: "user-1",
    });
    const provisionalMovementId = get().movements[0].id;

    vi.stubGlobal("navigator", { onLine: true });
    rpc.mockResolvedValue({
      data: {
        inventory: { shopId: "shop-1", productId: "p1", qtyBaseUnits: 7 },
        movement: { id: "mv-server-1", shopId: "shop-1", productId: "p1" },
        auditLog: { id: "au-server-1" },
      },
      error: null,
    });

    await drainOutbox();

    expect(get().movements.map((m: { id: string }) => m.id)).toEqual(["mv-server-1"]);
    expect(get().inventory.find((i: { productId: string }) => i.productId === "p1")?.qtyBaseUnits).toBe(7);
    expect(await localDb.movements.get(provisionalMovementId)).toBeUndefined();
    expect((await localDb.movements.get("mv-server-1"))?.id).toBe("mv-server-1");
  });
});
