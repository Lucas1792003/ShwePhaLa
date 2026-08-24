import Dexie, { type Table } from "dexie";
import type {
  AuditLog, Brand, BusinessProfile, Category, Inventory, InventoryMovement, PriceLevel, PriceTier,
  Product, ProductBarcode, ProductUnit, ProductUnitPrice, PurchaseOrder, PurchaseOrderItem,
  Refund, Sale, SaleItem, Shift, Shop, StockTransfer, StockTransferItem,
  Supplier, SupplierPayment, SupplierProduct, UnitType, User,
} from "../types";

// Singleton business_profile row wrapped with a fixed key so Dexie has a
// primary key to store it under (the DB row itself has no id column).
export interface StoredBusinessProfile extends BusinessProfile {
  key: "default";
}

export type ReprintLog = { id: string; saleId: string; printedBy: string; printedAt: string };

/** One queued local mutation, replayed against Supabase when back online. */
export interface SyncOutboxEntry {
  localId: string;
  // "rpc": replay via supabase.rpc(name, args). "table_write": replay via
  // supabase.from(table)[op](row).
  kind: "rpc" | "table_write";
  name: string; // RPC name, or a label for table_write (e.g. "products.insert")
  args?: Record<string, unknown>;
  table?: string;
  op?: "insert" | "update" | "delete";
  row?: Record<string, unknown>;
  // Primary key of the row a "table_write" entry targets — needed at replay
  // time for .eq("id", ...) on update/delete, since an update's `row` is
  // often a partial column set that may not include it.
  id?: string;
  shopId: string | null;
  createdAt: string;
  status: "pending" | "syncing" | "failed" | "conflict";
  attempts: number;
  lastError?: string;
  // Provisional local rows (by table + id) this entry created. RPCs mint
  // their own ids server-side, so on success these get removed and replaced
  // with the server's authoritative rows rather than updated in place.
  provisional?: { table: string; ids: string[] }[];
  // Fields in `args` that reference another entity created offline (e.g.
  // complete_sale's p_shift_id, when the shift itself was also opened
  // offline and hasn't synced yet). Resolved against provisionalIdMap
  // immediately before sending — an entry with an unresolved ref is left
  // pending until the entry that created that id syncs. See outbox.ts.
  refs?: { field: string; provisionalId: string }[];
}

/** provisionalId -> the real id the server assigned once that entry synced.
 *  Lets a later-queued entry (e.g. a sale referencing a shift opened in the
 *  same offline session) resolve the reference before replaying. Pruned
 *  after a week (see outbox.ts's pruneProvisionalIdMap) — low volume, but
 *  unbounded otherwise. */
export interface ProvisionalIdMapping {
  provisionalId: string;
  realId: string;
  createdAt: string;
}

export interface SyncMetaEntry {
  table: string;
  lastPulledAt: string;
}

/** Last-known resolved app user for a Supabase auth identity, cached so
 *  restoreSession() can keep a device logged in for a bounded window
 *  (see authStore.ts) when it can't reach the network at boot — without
 *  this, reopening the app offline bounces straight to /login even with a
 *  perfectly valid cached Supabase session. */
export interface CachedAuthUser {
  authId: string;
  userId: string;
  role: string;
  shopId: string | null;
  isActive: boolean;
  hasTotp: boolean;
  cachedAt: string;
}

// Mirrors DataState's arrays one-for-one so hydrate/persist can stay a
// straight loop over TABLE_NAMES instead of hand-written per-entity glue.
export class LocalDb extends Dexie {
  shops!: Table<Shop, string>;
  users!: Table<User, string>;
  categories!: Table<Category, string>;
  brands!: Table<Brand, string>;
  unitTypes!: Table<UnitType, string>;
  products!: Table<Product, string>;
  productUnits!: Table<ProductUnit, string>;
  barcodes!: Table<ProductBarcode, string>;
  priceTiers!: Table<PriceTier, string>;
  priceLevels!: Table<PriceLevel, string>;
  productUnitPrices!: Table<ProductUnitPrice, string>;
  inventory!: Table<Inventory, [string, string]>;
  movements!: Table<InventoryMovement, string>;
  suppliers!: Table<Supplier, string>;
  purchaseOrders!: Table<PurchaseOrder, string>;
  purchaseOrderItems!: Table<PurchaseOrderItem, string>;
  supplierPayments!: Table<SupplierPayment, string>;
  supplierProducts!: Table<SupplierProduct, [string, string]>;
  stockTransfers!: Table<StockTransfer, string>;
  stockTransferItems!: Table<StockTransferItem, string>;
  shifts!: Table<Shift, string>;
  sales!: Table<Sale, string>;
  saleItems!: Table<SaleItem, string>;
  reprintLogs!: Table<ReprintLog, string>;
  refunds!: Table<Refund, string>;
  auditLogs!: Table<AuditLog, string>;
  businessProfile!: Table<StoredBusinessProfile, string>;

  syncOutbox!: Table<SyncOutboxEntry, string>;
  syncMeta!: Table<SyncMetaEntry, string>;
  provisionalIdMap!: Table<ProvisionalIdMapping, string>;
  authCache!: Table<CachedAuthUser, string>;

  constructor() {
    super("shwe-phala-local");
    this.version(1).stores({
      shops: "id",
      users: "id",
      categories: "id",
      brands: "id, categoryId",
      unitTypes: "id",
      products: "id, category, brandId",
      productUnits: "id, productId",
      barcodes: "id, productId",
      priceTiers: "id, productId",
      priceLevels: "id",
      productUnitPrices: "id, productUnitId",
      inventory: "[shopId+productId], shopId, productId",
      movements: "id, shopId, productId, createdAt",
      suppliers: "id",
      purchaseOrders: "id, shopId, supplierId",
      purchaseOrderItems: "id, purchaseOrderId",
      supplierPayments: "id, supplierId, purchaseOrderId",
      supplierProducts: "[supplierId+productId], supplierId, productId",
      stockTransfers: "id, fromShopId, toShopId",
      stockTransferItems: "id, transferId",
      shifts: "id, shopId, cashierId",
      sales: "id, shopId, shiftId, createdAt",
      saleItems: "id, saleId",
      reprintLogs: "id, saleId",
      refunds: "id, saleId",
      auditLogs: "id, shopId, createdAt",
      businessProfile: "key",
      syncOutbox: "localId, status, shopId, createdAt",
      syncMeta: "table",
      provisionalIdMap: "provisionalId",
      authCache: "authId",
    });
  }
}

export const localDb = new LocalDb();
