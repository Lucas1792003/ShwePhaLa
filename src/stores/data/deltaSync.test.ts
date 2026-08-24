import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("../../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { bootstrapDeltaCursors, pullDeltaChanges } from "./deltaSync";
import { localDb } from "../../lib/localDb";
import type { LocalSnapshot } from "./localSync";

const emptySnapshot: LocalSnapshot = {
  shops: [], users: [], categories: [], brands: [], unitTypes: [], products: [], productUnits: [],
  barcodes: [], priceTiers: [], priceLevels: [], productUnitPrices: [], inventory: [], movements: [],
  suppliers: [], purchaseOrders: [], purchaseOrderItems: [], supplierPayments: [], supplierProducts: [],
  stockTransfers: [], stockTransferItems: [], shifts: [], sales: [], saleItems: [], reprintLogs: [],
  refunds: [], auditLogs: [], businessProfile: null,
};

// Chainable query mock: .select().gt().order() resolves to `result`.
function queryReturning(result: { data?: unknown[]; error?: { message: string } | null }) {
  const chain = {
    select: () => chain,
    gt: () => chain,
    order: () => Promise.resolve({ data: result.data ?? [], error: result.error ?? null }),
  };
  return chain;
}

beforeEach(async () => {
  fromMock.mockReset();
  await Promise.all(localDb.tables.map((t) => t.clear()));
});

describe("bootstrapDeltaCursors", () => {
  it("seeds a cursor from the max updatedAt per delta-capable table", async () => {
    await bootstrapDeltaCursors({
      ...emptySnapshot,
      categories: [
        { id: "c1", name: "A", color: "blue", isActive: true, createdAt: "t0", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "c2", name: "B", color: "red", isActive: true, createdAt: "t0", updatedAt: "2026-01-03T00:00:00Z" },
        { id: "c3", name: "C", color: "red", isActive: true, createdAt: "t0", updatedAt: "2026-01-02T00:00:00Z" },
      ],
    });

    const cursor = await localDb.syncMeta.get("categories");
    expect(cursor?.lastPulledAt).toBe("2026-01-03T00:00:00Z");
  });

  it("does not set a cursor for a table with no rows (nothing to bootstrap from)", async () => {
    await bootstrapDeltaCursors(emptySnapshot);
    expect(await localDb.syncMeta.get("categories")).toBeUndefined();
  });
});

describe("pullDeltaChanges", () => {
  it("skips a table that was never bootstrapped (no cursor yet)", async () => {
    const { changes } = await pullDeltaChanges(emptySnapshot);
    expect(changes.categories).toBeUndefined();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("fetches rows newer than the cursor, merges by id, and advances the cursor", async () => {
    await localDb.syncMeta.put({ table: "categories", lastPulledAt: "2026-01-01T00:00:00Z" });
    fromMock.mockImplementation((table: string) =>
      table === "categories"
        ? queryReturning({
            data: [{ id: "c2", name: "Beverages (renamed)", color: "blue", is_active: true, created_at: "t0", updated_at: "2026-01-05T00:00:00Z" }],
          })
        : queryReturning({ data: [] }),
    );

    const current = {
      ...emptySnapshot,
      categories: [
        { id: "c1", name: "A", color: "blue", isActive: true, createdAt: "t0" },
        { id: "c2", name: "Beverages", color: "blue", isActive: true, createdAt: "t0" },
      ],
    };
    const { changes, hadErrors } = await pullDeltaChanges(current);

    expect(hadErrors).toBe(false);
    expect(changes.categories).toHaveLength(2); // c1 untouched + c2 replaced, not duplicated
    expect(changes.categories?.find((c) => c.id === "c2")?.name).toBe("Beverages (renamed)");
    expect((await localDb.syncMeta.get("categories"))?.lastPulledAt).toBe("2026-01-05T00:00:00Z");
    expect((await localDb.categories.get("c2"))?.name).toBe("Beverages (renamed)");
  });

  it("appends a genuinely new row rather than requiring it to already exist locally", async () => {
    await localDb.syncMeta.put({ table: "categories", lastPulledAt: "2026-01-01T00:00:00Z" });
    fromMock.mockImplementation((table: string) =>
      table === "categories"
        ? queryReturning({ data: [{ id: "c-new", name: "New Category", color: "green", is_active: true, created_at: "t0", updated_at: "2026-01-02T00:00:00Z" }] })
        : queryReturning({ data: [] }),
    );

    const { changes } = await pullDeltaChanges(emptySnapshot);
    expect(changes.categories).toEqual([
      expect.objectContaining({ id: "c-new", name: "New Category" }),
    ]);
  });

  it("leaves the cursor untouched and reports no error when nothing changed", async () => {
    await localDb.syncMeta.put({ table: "categories", lastPulledAt: "2026-01-01T00:00:00Z" });
    fromMock.mockReturnValue(queryReturning({ data: [] }));

    const { changes, hadErrors } = await pullDeltaChanges(emptySnapshot);

    expect(changes.categories).toBeUndefined();
    expect(hadErrors).toBe(false);
    expect((await localDb.syncMeta.get("categories"))?.lastPulledAt).toBe("2026-01-01T00:00:00Z");
  });

  it("reports an error for one failed table without throwing or blocking the others", async () => {
    await localDb.syncMeta.put({ table: "categories", lastPulledAt: "2026-01-01T00:00:00Z" });
    await localDb.syncMeta.put({ table: "brands", lastPulledAt: "2026-01-01T00:00:00Z" });
    fromMock.mockImplementation((table: string) =>
      table === "categories"
        ? queryReturning({ error: { message: "permission denied" } })
        : queryReturning({ data: [{ id: "b1", category_id: "c1", name: "Grand Royal", is_active: true, sort_order: 0, created_at: "t0", updated_at: "2026-01-02T00:00:00Z" }] }),
    );

    const { changes, hadErrors } = await pullDeltaChanges(emptySnapshot);

    expect(hadErrors).toBe(true);
    expect(changes.categories).toBeUndefined();
    expect(changes.brands).toHaveLength(1);
  });
});
