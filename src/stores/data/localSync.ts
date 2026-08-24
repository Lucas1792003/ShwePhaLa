import { localDb, type StoredBusinessProfile } from "../../lib/localDb";
import type { DataState } from "./types";
import type { BusinessProfile } from "../../types";

const SNAPSHOT_MARKER = "__snapshot__";

// The subset of DataState fields that mirror a Dexie table 1:1 by name.
// `refundVoidRequests` is deliberately excluded — loadData sets it to the
// same array as `refunds` (see stores/data/index.ts), so it isn't stored
// twice locally; callers derive it back out on hydrate.
export type LocalSnapshot = Pick<DataState,
  | "shops" | "users" | "categories" | "brands" | "unitTypes" | "products" | "productUnits"
  | "barcodes" | "priceTiers" | "priceLevels" | "productUnitPrices" | "inventory" | "movements"
  | "suppliers" | "purchaseOrders" | "purchaseOrderItems" | "supplierPayments" | "supplierProducts"
  | "stockTransfers" | "stockTransferItems" | "shifts" | "sales" | "saleItems" | "reprintLogs"
  | "refunds" | "auditLogs" | "businessProfile"
>;

/**
 * Replace the entire local mirror with a fresh full snapshot from
 * `loadData()`. Phase 1 only ever does a full replace (matching today's
 * full-reload semantics) — cursor-based delta merge is a later phase, once
 * `updated_at` exists broadly enough to support it.
 */
export async function persistSnapshotToLocal(snapshot: LocalSnapshot): Promise<void> {
  await localDb.transaction("rw", localDb.tables, async () => {
    await Promise.all(localDb.tables.map((table) => table.clear()));
    await Promise.all([
      localDb.shops.bulkPut(snapshot.shops),
      localDb.users.bulkPut(snapshot.users),
      localDb.categories.bulkPut(snapshot.categories),
      localDb.brands.bulkPut(snapshot.brands),
      localDb.unitTypes.bulkPut(snapshot.unitTypes),
      localDb.products.bulkPut(snapshot.products),
      localDb.productUnits.bulkPut(snapshot.productUnits),
      localDb.barcodes.bulkPut(snapshot.barcodes),
      localDb.priceTiers.bulkPut(snapshot.priceTiers),
      localDb.priceLevels.bulkPut(snapshot.priceLevels),
      localDb.productUnitPrices.bulkPut(snapshot.productUnitPrices),
      localDb.inventory.bulkPut(snapshot.inventory),
      localDb.movements.bulkPut(snapshot.movements),
      localDb.suppliers.bulkPut(snapshot.suppliers),
      localDb.purchaseOrders.bulkPut(snapshot.purchaseOrders),
      localDb.purchaseOrderItems.bulkPut(snapshot.purchaseOrderItems),
      localDb.supplierPayments.bulkPut(snapshot.supplierPayments),
      localDb.supplierProducts.bulkPut(snapshot.supplierProducts),
      localDb.stockTransfers.bulkPut(snapshot.stockTransfers),
      localDb.stockTransferItems.bulkPut(snapshot.stockTransferItems),
      localDb.shifts.bulkPut(snapshot.shifts),
      localDb.sales.bulkPut(snapshot.sales),
      localDb.saleItems.bulkPut(snapshot.saleItems),
      localDb.reprintLogs.bulkPut(snapshot.reprintLogs),
      localDb.refunds.bulkPut(snapshot.refunds),
      localDb.auditLogs.bulkPut(snapshot.auditLogs),
      snapshot.businessProfile
        ? localDb.businessProfile.put({ key: "default", ...snapshot.businessProfile })
        : Promise.resolve(),
    ]);
    await localDb.syncMeta.put({ table: SNAPSHOT_MARKER, lastPulledAt: new Date().toISOString() });
  });
}

/** Read the full local mirror back out, or null if nothing was ever synced. */
export async function readLocalSnapshot(): Promise<LocalSnapshot | null> {
  const marker = await localDb.syncMeta.get(SNAPSHOT_MARKER);
  if (!marker) return null;

  const [
    shops, users, categories, brands, unitTypes, products, productUnits, barcodes, priceTiers,
    priceLevels, productUnitPrices, inventory, movements, suppliers, purchaseOrders, purchaseOrderItems,
    supplierPayments, supplierProducts, stockTransfers, stockTransferItems, shifts, sales, saleItems,
    reprintLogs, refunds, auditLogs, businessProfileRow,
  ] = await Promise.all([
    localDb.shops.toArray(), localDb.users.toArray(), localDb.categories.toArray(), localDb.brands.toArray(),
    localDb.unitTypes.toArray(), localDb.products.toArray(), localDb.productUnits.toArray(), localDb.barcodes.toArray(),
    localDb.priceTiers.toArray(), localDb.priceLevels.toArray(), localDb.productUnitPrices.toArray(),
    localDb.inventory.toArray(), localDb.movements.toArray(), localDb.suppliers.toArray(),
    localDb.purchaseOrders.toArray(), localDb.purchaseOrderItems.toArray(), localDb.supplierPayments.toArray(),
    localDb.supplierProducts.toArray(), localDb.stockTransfers.toArray(), localDb.stockTransferItems.toArray(),
    localDb.shifts.toArray(), localDb.sales.toArray(), localDb.saleItems.toArray(), localDb.reprintLogs.toArray(),
    localDb.refunds.toArray(), localDb.auditLogs.toArray(), localDb.businessProfile.get("default"),
  ]);

  return {
    shops, users, categories, brands, unitTypes, products, productUnits, barcodes, priceTiers,
    priceLevels, productUnitPrices, inventory, movements, suppliers, purchaseOrders, purchaseOrderItems,
    supplierPayments, supplierProducts, stockTransfers, stockTransferItems, shifts, sales, saleItems,
    reprintLogs, refunds, auditLogs,
    businessProfile: businessProfileRow ? stripKey(businessProfileRow) : null,
  };
}

// Strip the Dexie-only `key` wrapper — callers expect a plain BusinessProfile.
function stripKey(row: StoredBusinessProfile): BusinessProfile {
  return {
    businessName: row.businessName,
    logoUrl: row.logoUrl,
    address: row.address,
    phone: row.phone,
    email: row.email,
    tagline: row.tagline,
  };
}
