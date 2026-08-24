import { supabase } from "../../lib/supabase";
import { localDb } from "../../lib/localDb";
import type { LocalSnapshot } from "./localSync";
import {
  mapBrand, mapCategory, mapPriceLevel, mapProduct, mapProductUnit, mapProductUnitPrice,
  mapPurchaseOrder, mapShift, mapStockTransfer, mapSupplier, mapUnitType,
} from "./mappers";

// ----------------------------------------------------------------------
// Delta pull-sync: for tables that reliably bump `updated_at` on every
// UPDATE (see migration 044 and the earlier per-table migrations it
// followed the pattern of), pull only rows changed since the last cursor
// instead of re-fetching the whole table. Every other table (shops, users,
// inventory, movements, sales, sale_items, purchase_order_items,
// stock_transfer_items, supplier_payments, supplier_products, price_tiers,
// product_barcodes, refund_void_requests, reprint_logs, audit_logs,
// business_profile) has no reliable change-tracking column and keeps being
// fully reloaded by loadData() — see docs/10-offline-desktop-known-issues.md
// for why (mostly: no updated_at, or genuinely append-only + small enough
// that a full reload is cheap anyway).
//
// IMPORTANT LIMITATION: `updated_at > cursor` can only ever tell you about
// rows that still exist. `products` supports a real hard DELETE
// (`delete_product` RPC) — a product deleted on another device will never
// be removed from a delta-only client; it's only caught by the next FULL
// loadData() (cold boot, or the reconnect-after-offline path in
// AppLayout.tsx, both of which stay on the full reload). Soft-deletes
// (is_active flips) ARE just an UPDATE and delta-sync catches those fine.
interface DeltaTable<T extends { id: string; updatedAt?: string }> {
  table: string;
  stateKey: keyof LocalSnapshot;
  localTable: { bulkPut: (rows: T[]) => Promise<unknown> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapper: (row: any) => T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DELTA_TABLES: DeltaTable<any>[] = [
  { table: "categories", stateKey: "categories", localTable: localDb.categories, mapper: mapCategory },
  { table: "brands", stateKey: "brands", localTable: localDb.brands, mapper: mapBrand },
  { table: "unit_types", stateKey: "unitTypes", localTable: localDb.unitTypes, mapper: mapUnitType },
  { table: "products", stateKey: "products", localTable: localDb.products, mapper: mapProduct },
  { table: "product_units", stateKey: "productUnits", localTable: localDb.productUnits, mapper: mapProductUnit },
  { table: "price_levels", stateKey: "priceLevels", localTable: localDb.priceLevels, mapper: mapPriceLevel },
  { table: "product_unit_prices", stateKey: "productUnitPrices", localTable: localDb.productUnitPrices, mapper: mapProductUnitPrice },
  { table: "suppliers", stateKey: "suppliers", localTable: localDb.suppliers, mapper: mapSupplier },
  { table: "purchase_orders", stateKey: "purchaseOrders", localTable: localDb.purchaseOrders, mapper: mapPurchaseOrder },
  { table: "stock_transfers", stateKey: "stockTransfers", localTable: localDb.stockTransfers, mapper: mapStockTransfer },
  { table: "shifts", stateKey: "shifts", localTable: localDb.shifts, mapper: mapShift },
];

/** Replace-or-append by id — a delta pull only ever returns rows that
 *  changed, not the full table, so (unlike loadData()'s full replace) this
 *  must merge into what's already loaded rather than overwrite it. */
function mergeById<T extends { id: string }>(current: T[], updates: T[]): T[] {
  if (updates.length === 0) return current;
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of updates) byId.set(row.id, row);
  return Array.from(byId.values());
}

/** Seed every delta table's cursor from a just-completed full load, so the
 *  next background refresh can pull deltas instead of everything again. */
export async function bootstrapDeltaCursors(snapshot: LocalSnapshot): Promise<void> {
  await Promise.all(
    DELTA_TABLES.map(async ({ table, stateKey }) => {
      const rows = snapshot[stateKey] as unknown as { updatedAt?: string }[];
      const latest = rows.reduce<string | undefined>(
        (max, row) => (row.updatedAt && (!max || row.updatedAt > max) ? row.updatedAt : max),
        undefined,
      );
      if (latest) await localDb.syncMeta.put({ table, lastPulledAt: latest });
    }),
  );
}

export interface DeltaPullResult {
  changes: Partial<LocalSnapshot>;
  hadErrors: boolean;
}

/**
 * Pull just what changed since the last cursor for every delta-capable
 * table. Returns the changed rows per table (already merged with what's
 * currently loaded is the CALLER's job — see AppLayout.tsx / index.ts — this
 * only fetches + upserts the local mirror). A table with no cursor yet
 * (never been through a full load) is skipped, not treated as an error.
 */
export async function pullDeltaChanges(
  currentState: Pick<LocalSnapshot, (typeof DELTA_TABLES)[number]["stateKey"]>,
): Promise<DeltaPullResult> {
  const changes: Partial<LocalSnapshot> = {};
  let hadErrors = false;

  await Promise.all(
    DELTA_TABLES.map(async ({ table, stateKey, localTable, mapper }) => {
      const cursor = await localDb.syncMeta.get(table);
      if (!cursor) return; // never bootstrapped — wait for a full load first

      const res = await supabase
        .from(table)
        .select("*")
        .gt("updated_at", cursor.lastPulledAt)
        .order("updated_at", { ascending: true });

      if (res.error) {
        console.error(`[DB] Delta pull failed for ${table}:`, res.error.message);
        hadErrors = true;
        return;
      }
      const rows = (res.data ?? []).map(mapper);
      if (rows.length === 0) return;

      const current = (currentState[stateKey] as { id: string }[] | undefined) ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (changes as any)[stateKey] = mergeById(current, rows);

      const latest = rows[rows.length - 1].updatedAt as string; // ascending order → last is newest
      await localDb.syncMeta.put({ table, lastPulledAt: latest });
      await localTable.bulkPut(rows);
    }),
  );

  return { changes, hadErrors };
}
