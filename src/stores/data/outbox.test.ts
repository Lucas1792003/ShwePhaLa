import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("../../lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { localDb } from "../../lib/localDb";
import {
  enqueueOutbox, drainOutbox, listOutboxConflicts, retryOutboxEntry, dismissOutboxEntry, recordIdMapping,
} from "./outbox";

beforeEach(async () => {
  rpc.mockReset();
  await localDb.syncOutbox.clear();
  await localDb.provisionalIdMap.clear();
});

describe("drainOutbox", () => {
  it("is a no-op when the queue is empty", async () => {
    await expect(drainOutbox()).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("leaves the entry pending and stops the pass on a network failure", async () => {
    await enqueueOutbox({ kind: "rpc", name: "complete_sale", args: {}, shopId: "shop-1" });
    rpc.mockRejectedValue(new TypeError("Failed to fetch"));

    await drainOutbox();

    const entries = await localDb.syncOutbox.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("pending");
    expect(entries[0].attempts).toBe(1);
    expect(entries[0].lastError).toContain("fetch");
  });

  it("flags a server-rejected entry as a conflict and keeps draining the rest", async () => {
    await enqueueOutbox({ kind: "rpc", name: "complete_sale", args: { n: 1 }, shopId: "shop-1" });
    await enqueueOutbox({ kind: "rpc", name: "adjust_stock", args: { n: 2 }, shopId: "shop-1" });
    rpc.mockResolvedValue({ data: null, error: { message: "Insufficient stock" } });

    await drainOutbox();

    expect(rpc).toHaveBeenCalledTimes(2);
    const entries = await localDb.syncOutbox.toArray();
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.status === "conflict")).toBe(true);
    expect(entries.every((e) => e.lastError === "Insufficient stock")).toBe(true);
  });

  it("removes the entry once the server accepts it", async () => {
    await enqueueOutbox({ kind: "rpc", name: "some_untracked_rpc", args: {}, shopId: "shop-1" });
    rpc.mockResolvedValue({ data: { ok: true }, error: null });

    await drainOutbox();

    expect(await localDb.syncOutbox.count()).toBe(0);
  });

  it("only ever runs one drain pass at a time", async () => {
    await enqueueOutbox({ kind: "rpc", name: "complete_sale", args: {}, shopId: "shop-1" });
    let resolveRpc!: (v: unknown) => void;
    rpc.mockReturnValue(new Promise((resolve) => { resolveRpc = resolve; }));

    const first = drainOutbox();
    const second = drainOutbox(); // should return immediately, not double-process
    resolveRpc({ data: { ok: true }, error: null });
    await Promise.all([first, second]);

    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("dependent entries (refs)", () => {
  it("skips a blocked entry but still processes an unrelated ready one", async () => {
    // e.g. a sale queued against a shift opened in the same offline session
    // (still provisional) alongside an unrelated, independent adjustment.
    await enqueueOutbox({
      kind: "rpc", name: "complete_sale", args: { p_shift_id: "shift-local-1" }, shopId: "shop-1",
      refs: [{ field: "p_shift_id", provisionalId: "shift-local-1" }],
    });
    await enqueueOutbox({ kind: "rpc", name: "adjust_stock", args: { n: 1 }, shopId: "shop-1" });
    rpc.mockResolvedValue({ data: { ok: true }, error: null });

    await drainOutbox();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("adjust_stock", { n: 1, p_expected_actor_id: null });
    const remaining = await localDb.syncOutbox.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("complete_sale");
    expect(remaining[0].status).toBe("pending"); // untouched, not a failed attempt
  });

  it("resolves and sends a dependent entry once its parent's real id is recorded", async () => {
    await enqueueOutbox({
      kind: "rpc", name: "complete_sale", args: { p_shift_id: "shift-local-1", p_paid_mmk: 5000 }, shopId: "shop-1",
      refs: [{ field: "p_shift_id", provisionalId: "shift-local-1" }],
    });
    rpc.mockResolvedValue({ data: { ok: true }, error: null });

    await drainOutbox();
    expect(rpc).not.toHaveBeenCalled(); // still blocked

    await recordIdMapping("shift-local-1", "shift-server-9");
    await drainOutbox();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("complete_sale", { p_shift_id: "shift-server-9", p_paid_mmk: 5000 });
    expect(await localDb.syncOutbox.count()).toBe(0);
  });
});

describe("stuck (permanently-blocked) entries", () => {
  it("leaves a recently-blocked entry pending, not flagged", async () => {
    await enqueueOutbox({
      kind: "rpc", name: "complete_sale", args: { p_shift_id: "shift-local-1" }, shopId: "shop-1",
      refs: [{ field: "p_shift_id", provisionalId: "shift-local-1" }],
    });

    await drainOutbox();

    const entries = await localDb.syncOutbox.toArray();
    expect(entries[0].status).toBe("pending");
  });

  it("flags an entry blocked for over 24h as a conflict instead of leaving it pending forever", async () => {
    await enqueueOutbox({
      kind: "rpc", name: "complete_sale", args: { p_shift_id: "shift-local-1" }, shopId: "shop-1",
      refs: [{ field: "p_shift_id", provisionalId: "shift-local-1" }],
    });
    const [entry] = await localDb.syncOutbox.toArray();
    await localDb.syncOutbox.update(entry.localId, {
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });

    await drainOutbox();

    const [updated] = await localDb.syncOutbox.toArray();
    expect(updated.status).toBe("conflict");
    expect(updated.lastError).toMatch(/stuck/i);
    expect(rpc).not.toHaveBeenCalled(); // never actually attempted — it was never resolvable
  });

  it("does not flag a pending entry with no refs, however old", async () => {
    await enqueueOutbox({ kind: "rpc", name: "adjust_stock", args: {}, shopId: "shop-1" });
    const [entry] = await localDb.syncOutbox.toArray();
    await localDb.syncOutbox.update(entry.localId, {
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });
    rpc.mockResolvedValue({ data: { ok: true }, error: null });

    await drainOutbox();

    // No refs → it's just a normal ready entry, drained normally (not "stuck").
    expect(await localDb.syncOutbox.count()).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("provisionalIdMap pruning", () => {
  it("prunes a mapping older than 7 days on the next drain", async () => {
    await recordIdMapping("shift-local-1", "shift-server-1");
    const stale = await localDb.provisionalIdMap.get("shift-local-1");
    await localDb.provisionalIdMap.update("shift-local-1", {
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(stale).toBeDefined();

    await drainOutbox(); // empty queue, but still runs the prune sweep

    expect(await localDb.provisionalIdMap.get("shift-local-1")).toBeUndefined();
  });

  it("keeps a recent mapping", async () => {
    await recordIdMapping("shift-local-2", "shift-server-2");

    await drainOutbox();

    expect(await localDb.provisionalIdMap.get("shift-local-2")).toBeDefined();
  });
});

describe("conflict management", () => {
  it("lists conflicts, retries them back to pending, and dismisses them", async () => {
    await enqueueOutbox({ kind: "rpc", name: "complete_sale", args: {}, shopId: "shop-1" });
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await drainOutbox();

    const conflicts = await listOutboxConflicts();
    expect(conflicts).toHaveLength(1);

    await retryOutboxEntry(conflicts[0].localId);
    expect((await localDb.syncOutbox.get(conflicts[0].localId))?.status).toBe("pending");

    await dismissOutboxEntry(conflicts[0].localId);
    expect(await localDb.syncOutbox.get(conflicts[0].localId)).toBeUndefined();
  });
});
