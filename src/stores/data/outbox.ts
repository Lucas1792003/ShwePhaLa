import { supabase } from "../../lib/supabase";
import { localDb, type SyncOutboxEntry } from "../../lib/localDb";
import { newId } from "../../lib/id";
import { replayTableWrite } from "./tableWrite";
import { useAuthStore } from "../authStore";

type EnqueueInput = Pick<SyncOutboxEntry, "kind" | "name" | "args" | "shopId" | "provisional" | "refs" | "table" | "op" | "row" | "id">;

// RPCs that accept p_expected_actor_id (see migration 055) — the queuing
// user's app id is stamped on at enqueue time and checked again at replay,
// so a queued action can't silently execute under whoever happens to be
// logged in when the device reconnects (a shared till, another cashier).
// complete_sale is deliberately excluded — it already checks shift
// ownership independently, and doesn't declare this param.
const ACTOR_STAMPED_RPCS = new Set([
  "adjust_stock",
  "receive_purchase_order",
  "record_supplier_payment",
  "open_shift",
  "close_shift",
  "create_refund_void_request",
  "dispatch_stock_transfer",
  "receive_stock_transfer",
]);

export async function enqueueOutbox(entry: EnqueueInput): Promise<void> {
  const args =
    entry.kind === "rpc" && entry.args && ACTOR_STAMPED_RPCS.has(entry.name)
      ? { ...entry.args, p_expected_actor_id: useAuthStore.getState().currentUserId ?? null }
      : entry.args;
  await localDb.syncOutbox.put({
    ...entry,
    args,
    localId: newId("outbox"),
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  });
}

/** Record that a provisional (offline-minted) id turned out to be `realId`
 *  once its outbox entry synced — called by reconcilers for anything a
 *  later-queued entry might reference (e.g. reconcileOpenShift). */
export async function recordIdMapping(provisionalId: string, realId: string): Promise<void> {
  if (provisionalId === realId) return;
  await localDb.provisionalIdMap.put({ provisionalId, realId, createdAt: new Date().toISOString() });
}

const PROVISIONAL_MAP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Low volume (one row per offline-created shift/sale/etc. that something
 *  else referenced), but otherwise unbounded — sweep out anything old
 *  enough that nothing still queued could plausibly need it. */
async function pruneProvisionalIdMap(): Promise<void> {
  const cutoff = Date.now() - PROVISIONAL_MAP_MAX_AGE_MS;
  const stale = await localDb.provisionalIdMap.filter((m) => Date.parse(m.createdAt) < cutoff).primaryKeys();
  if (stale.length) await localDb.provisionalIdMap.bulkDelete(stale);
}

// Resolves an entry's `refs` against provisionalIdMap and returns the args
// to actually send — or null if a reference hasn't synced yet (e.g. a sale
// queued against a shift that was also opened offline and is still waiting
// its own turn). A null result means "not ready", not "failed" — the entry
// stays pending and is retried on the next drain once its dependency lands.
async function resolveArgs(entry: SyncOutboxEntry): Promise<Record<string, unknown> | null> {
  const args: Record<string, unknown> = { ...(entry.args ?? {}) };
  for (const ref of entry.refs ?? []) {
    const mapping = await localDb.provisionalIdMap.get(ref.provisionalId);
    if (!mapping) return null;
    args[ref.field] = mapping.realId;
  }
  return args;
}

// Reconciles one RPC's result into Zustand + the local mirror. Each RPC this
// outbox supports needs a matching reconciler, registered by ./index.ts once
// the data store exists (see reconcileCompleteSale / reconcileAdjustStock).
// Deliberately NOT a static import of useDataStore here — every slice
// imports enqueueOutbox from this file, and index.ts imports every slice, so
// importing the store back from here would create a circular import that
// breaks module init (index.ts calling createSaleSlice before its module
// finishes evaluating).
type Reconciler = (data: unknown, provisional: SyncOutboxEntry["provisional"]) => void;
const reconcilers: Record<string, Reconciler> = {};

export function registerOutboxReconciler(rpcName: string, reconciler: Reconciler): void {
  reconcilers[rpcName] = reconciler;
}

let draining = false;

// How long an entry can sit blocked on an unresolved `refs` dependency
// before it's treated as stuck rather than "just hasn't had a turn yet" —
// e.g. its parent entry (the shift it references) was dismissed from the
// Sync Conflicts page instead of retried, so the dependency will never
// resolve on its own.
const STUCK_ENTRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Replay queued mutations against Supabase, oldest first. Safe to call
 * repeatedly (on reconnect, on every background refresh) — a no-op while
 * already draining or when the queue is empty.
 *
 * A network failure stops the whole pass (nothing else was going to reach
 * the server either) and leaves the entry `pending` for the next attempt. A
 * response the server actually returned an error for (e.g. "insufficient
 * stock" because another till sold the last unit first) is a real conflict,
 * not a retry candidate — it's flagged for manual review and draining
 * continues, since a rejected sale on one till shouldn't block another.
 */
export async function drainOutbox(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    await pruneProvisionalIdMap();
    for (;;) {
      const pending = await localDb.syncOutbox.where("status").anyOf("pending", "failed").sortBy("createdAt");

      // Skip past entries still waiting on a dependency (e.g. a sale queued
      // against a shift opened in the same offline session) rather than
      // stalling the whole queue behind them.
      let entry: SyncOutboxEntry | null = null;
      let resolvedArgs: Record<string, unknown> | null = null;
      for (const candidate of pending) {
        const args = await resolveArgs(candidate);
        if (args) {
          entry = candidate;
          resolvedArgs = args;
          break;
        }
      }
      if (!entry) {
        // Nothing ready to send. Flag anything that's been blocked on a
        // dependency for too long — otherwise it sits `pending` forever,
        // indistinguishable from "hasn't had a chance yet".
        const now = Date.now();
        for (const candidate of pending) {
          if (!candidate.refs?.length) continue;
          if (now - Date.parse(candidate.createdAt) < STUCK_ENTRY_MAX_AGE_MS) continue;
          await localDb.syncOutbox.update(candidate.localId, {
            status: "conflict",
            lastError: "Stuck waiting on a dependency that never synced — its parent entry may need to be retried or this one dismissed.",
          });
        }
        return;
      }

      await localDb.syncOutbox.update(entry.localId, { status: "syncing" });

      let response: { data?: unknown; error: { message: string } | null };
      try {
        response = entry.kind === "table_write"
          ? await replayTableWrite(entry.table!, entry.op!, entry.row, entry.id!)
          : await supabase.rpc(entry.name, resolvedArgs ?? {});
      } catch (networkErr) {
        await localDb.syncOutbox.update(entry.localId, {
          status: "pending",
          attempts: entry.attempts + 1,
          lastError: networkErr instanceof Error ? networkErr.message : String(networkErr),
        });
        return;
      }

      if (response.error) {
        await localDb.syncOutbox.update(entry.localId, {
          status: "conflict",
          attempts: entry.attempts + 1,
          lastError: response.error.message,
        });
        continue;
      }

      // table_write entries need no reconciliation: the row content was
      // already client-chosen and applied optimistically (last-write-wins),
      // so a successful replay just confirms it — nothing new to merge in.
      const reconcile = reconcilers[entry.name];
      if (reconcile) reconcile(response.data, entry.provisional);
      await localDb.syncOutbox.delete(entry.localId);
    }
  } finally {
    draining = false;
  }
}

export async function listOutboxConflicts(): Promise<SyncOutboxEntry[]> {
  return localDb.syncOutbox.where("status").equals("conflict").sortBy("createdAt");
}

/** Give a conflicted entry another chance — e.g. after a manager corrects
 *  the shop's stock so a re-run of the same sale might succeed. */
export async function retryOutboxEntry(localId: string): Promise<void> {
  await localDb.syncOutbox.update(localId, { status: "pending", lastError: undefined });
}

/** Stop retrying a conflicted entry. The provisional record it created
 *  (e.g. a sale flagged pendingSync) is deliberately left in place — the
 *  local write already happened and is real till activity; only the queued
 *  server replay is abandoned. A manager reconciles the record itself
 *  (refund, stock correction, etc.) separately. */
export async function dismissOutboxEntry(localId: string): Promise<void> {
  await localDb.syncOutbox.delete(localId);
}

export async function countPendingOutbox(): Promise<number> {
  return localDb.syncOutbox.where("status").anyOf("pending", "syncing", "failed").count();
}
