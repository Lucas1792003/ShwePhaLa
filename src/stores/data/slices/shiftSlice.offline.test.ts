import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rpc = vi.fn();
vi.mock("../../../lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { createShiftSlice } from "./shiftSlice";
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
  const slice = createShiftSlice(set as any, get as any, {} as any);
  state = {
    ...slice,
    sales: [],
    refunds: [],
    auditLogs: [],
    ...seed,
  };
  registerOutboxReconciler("open_shift", (data, provisional) => get().reconcileOpenShift(data, provisional ?? []));
  registerOutboxReconciler("close_shift", (data, provisional) => get().reconcileCloseShift(data, provisional ?? []));
  return { get, set };
}

beforeEach(async () => {
  rpc.mockReset();
  await Promise.all(localDb.tables.map((t) => t.clear()));
  vi.stubGlobal("navigator", { onLine: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("startShift offline", () => {
  it("stages a provisional shift and queues open_shift", async () => {
    const { get } = makeStore();

    const shiftId = await get().startShift({ shopId: "shop-1", cashierId: "user-1", openingCashMmk: 50000 });

    expect(rpc).not.toHaveBeenCalled();
    expect(get().shifts[0]).toMatchObject({ id: shiftId, pendingSync: true, openingCashMmk: 50000 });

    const queued = await localDb.syncOutbox.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0].name).toBe("open_shift");
    expect(queued[0].refs ?? []).toHaveLength(0);
  });

  it("returns the existing open shift instead of opening a duplicate", async () => {
    const { get } = makeStore({ shifts: [{ id: "shift-existing", cashierId: "user-1", shopId: "shop-1" }] });
    const shiftId = await get().startShift({ shopId: "shop-1", cashierId: "user-1", openingCashMmk: 50000 });
    expect(shiftId).toBe("shift-existing");
    expect(await localDb.syncOutbox.count()).toBe(0);
  });
});

describe("endShift offline", () => {
  it("computes expected cash/variance from local sales and queues close_shift with no refs for an already-synced shift", async () => {
    const { get } = makeStore({
      shifts: [{ id: "shift-1", shopId: "shop-1", cashierId: "user-1", startedAt: "t0", openingCashMmk: 10000 }],
      sales: [
        { id: "s1", shiftId: "shift-1", paymentMethod: "CASH", status: "NORMAL", totalMmk: 5000 },
        { id: "s2", shiftId: "shift-1", paymentMethod: "OTHER", status: "NORMAL", totalMmk: 9999 }, // not cash, excluded
        { id: "s3", shiftId: "shift-1", paymentMethod: "CASH", status: "VOID", totalMmk: 9999 }, // voided, excluded
      ],
    });

    await get().endShift({ shiftId: "shift-1", closingCashMmk: 15000 });

    const closed = get().shifts.find((s: { id: string }) => s.id === "shift-1");
    expect(closed).toMatchObject({ expectedCashMmk: 15000, varianceMmk: 0, pendingSync: true });
    expect(closed.endedAt).toBeDefined();

    const queued = await localDb.syncOutbox.toArray();
    expect(queued[0].name).toBe("close_shift");
    expect(queued[0].refs ?? []).toHaveLength(0);
  });

  it("requires a variance reason when closing cash doesn't match expected", async () => {
    const { get } = makeStore({
      shifts: [{ id: "shift-1", shopId: "shop-1", cashierId: "user-1", startedAt: "t0", openingCashMmk: 10000 }],
    });
    await expect(get().endShift({ shiftId: "shift-1", closingCashMmk: 12000 }))
      .rejects.toThrow("Variance reason is required");
  });

  it("carries a ref to the shift's provisional id when the shift itself hasn't synced yet", async () => {
    const { get } = makeStore({
      shifts: [{ id: "shift-local-1", shopId: "shop-1", cashierId: "user-1", startedAt: "t0", openingCashMmk: 10000, pendingSync: true }],
    });

    await get().endShift({ shiftId: "shift-local-1", closingCashMmk: 10000 });

    const queued = await localDb.syncOutbox.toArray();
    expect(queued[0].refs).toEqual([{ field: "p_shift_id", provisionalId: "shift-local-1" }]);
  });
});

describe("shift opened offline, sale rung up against it, then both sync", () => {
  it("drains open_shift first, then resolves the sale's shift reference and drains it too", async () => {
    const { get: getShiftStore } = makeStore();
    const shiftId = await getShiftStore().startShift({ shopId: "shop-1", cashierId: "user-1", openingCashMmk: 10000 });

    // A separate outbox entry standing in for a sale rung up against this
    // still-provisional shift (saleSlice.ts's own offline path is covered
    // in saleSlice.offline.test.ts — this test is about ordering/resolution).
    const { enqueueOutbox } = await import("../outbox");
    await enqueueOutbox({
      kind: "rpc", name: "complete_sale",
      args: { p_shift_id: shiftId, p_paid_mmk: 1000 },
      shopId: "shop-1",
      refs: [{ field: "p_shift_id", provisionalId: shiftId }],
    });

    rpc.mockImplementation(async (name: string) => {
      if (name === "open_shift") {
        return { data: { shift: { id: "shift-server-1", shopId: "shop-1", cashierId: "user-1", startedAt: "t0", openingCashMmk: 10000 }, auditLogs: [] }, error: null };
      }
      return { data: { ok: true }, error: null };
    });

    await drainOutbox();

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "open_shift", expect.anything());
    expect(rpc).toHaveBeenNthCalledWith(2, "complete_sale", { p_shift_id: "shift-server-1", p_paid_mmk: 1000 });
    expect(await localDb.syncOutbox.count()).toBe(0);
    expect(getShiftStore().shifts[0].id).toBe("shift-server-1");
    expect(getShiftStore().shifts[0].pendingSync).toBeUndefined();
  });
});
