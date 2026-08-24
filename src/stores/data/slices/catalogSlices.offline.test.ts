import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Representative offline coverage for the Phase 4 admin/catalog slices —
// all of them are thin wrappers around tableWrite.ts's writeTableRow (see
// tableWrite.test.ts for the shared primitive's own coverage). This file
// checks each slice's specific row-shape/field-naming is actually correct
// end-to-end, across the three different persist patterns that existed
// before this offline work (optimistic+rollback, fire-and-forget,
// persist-first) — one representative per pattern, not exhaustive per slice.

// Full mock (not vi.importActual) — the real lib/supabase.ts module calls
// createClient() at import time, which throws with no VITE_SUPABASE_URL in
// this test environment. dbWrite/dbExec are reimplemented inline, matching
// their real (simple) behavior, so this file still exercises the real
// success/rollback branches in each slice.
const fromMock = vi.fn();
vi.mock("../../../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbWrite: (query: PromiseLike<{ error: any }>) => { void query; },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbExec: async (query: PromiseLike<{ error: any }>, label: string) => {
    const { error } = await query;
    if (error) throw new Error(error.message ?? `${label} failed.`);
  },
}));

import { createBrandSlice } from "./brandSlice";
import { createCategorySlice } from "./categorySlice";
import { createShopSlice } from "./shopSlice";
import { localDb } from "../../../lib/localDb";

// categorySlice's writes are deliberately fire-and-forget (matching the
// original dbWrite-based behavior — see categorySlice.ts) and the mock
// dbWrite above doesn't chain onto the query, so there's no promise to
// await from the test's side. Poll instead of guessing a tick count.
async function waitFor(check: () => Promise<boolean>, timeoutMs = 500): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: condition never became true");
    await new Promise((r) => setTimeout(r, 5));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStore(createSlice: (set: any, get: any, api: any) => any, seed: Record<string, any> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let state: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (updater: any) => {
    const patch = typeof updater === "function" ? updater(state) : updater;
    state = { ...state, ...patch };
  };
  const get = () => state;
  const slice = createSlice(set, get, {});
  state = { ...slice, products: [], ...seed };
  return { get };
}

beforeEach(async () => {
  fromMock.mockReset();
  await Promise.all(localDb.tables.map((t) => t.clear()));
  vi.stubGlobal("navigator", { onLine: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("brandSlice offline (optimistic + rollback pattern)", () => {
  it("keeps the optimistic add and mirrors it locally when offline", async () => {
    const { get } = makeStore(createBrandSlice);
    await get().addBrand({ id: "b1", categoryId: "c1", name: "Grand Royal", isActive: true, sortOrder: 0, createdAt: "t0", updatedAt: "t0" });

    expect(fromMock).not.toHaveBeenCalled();
    expect(get().brands).toHaveLength(1);
    expect((await localDb.brands.get("b1"))?.name).toBe("Grand Royal");
    expect((await localDb.syncOutbox.toArray())[0]).toMatchObject({ table: "brands", op: "insert", id: "b1" });
  });
});

describe("categorySlice offline (fire-and-forget pattern)", () => {
  it("stages the update locally and queues it", async () => {
    const { get } = makeStore(createCategorySlice, {
      categories: [{ id: "cat-1", name: "Drinks", color: "blue", isActive: true, createdAt: "t0" }],
    });
    get().updateCategory({ id: "cat-1", name: "Beverages", color: "blue", isActive: true, createdAt: "t0" });

    expect(get().categories[0].name).toBe("Beverages"); // Zustand set() is synchronous
    await waitFor(async () => (await localDb.categories.get("cat-1"))?.name === "Beverages");
    expect((await localDb.syncOutbox.toArray())[0]).toMatchObject({ table: "categories", op: "update", id: "cat-1" });
  });
});

describe("shopSlice offline (persist-first pattern)", () => {
  it("queues a new shop and applies it locally", async () => {
    const { get } = makeStore(createShopSlice, { shops: [], users: [], inventory: [], shifts: [], sales: [], purchaseOrders: [], supplierPayments: [], stockTransfers: [], priceTiers: [], refundVoidRequests: [], auditLogs: [] });
    await get().addShop({ id: "shop-2", code: "S2", name: "Branch 2", address: "1 Rd", isActive: true, createdAt: "t0" });

    expect(fromMock).not.toHaveBeenCalled();
    expect(get().shops).toHaveLength(1);
    expect((await localDb.shops.get("shop-2"))?.name).toBe("Branch 2");
  });

  it("still blocks deleting a referenced shop locally, without ever touching the network", async () => {
    const { get } = makeStore(createShopSlice, {
      shops: [{ id: "shop-1" }], users: [{ id: "u1", shopId: "shop-1" }],
      inventory: [], shifts: [], sales: [], purchaseOrders: [], supplierPayments: [],
      stockTransfers: [], priceTiers: [], refundVoidRequests: [], auditLogs: [],
    });
    await expect(get().deleteShop("shop-1")).rejects.toThrow(/operational data/i);
    expect(fromMock).not.toHaveBeenCalled();
    expect(await localDb.syncOutbox.count()).toBe(0);
  });
});
