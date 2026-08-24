import { localDb } from "../../lib/localDb";
import type {
  AuditLog, Inventory, InventoryMovement, PurchaseOrder, PurchaseOrderItem, Refund, Sale, SaleItem,
  Shift, StockTransfer, StockTransferItem, SupplierPayment,
} from "../../types";

// Provisional (offline-authored) or server-authoritative rows to mirror into
// IndexedDB alongside the Zustand `set()` call that already applies them —
// keeps the local cache consistent with in-memory state so a reload while
// offline (or before the next full loadData()) doesn't lose them. Extend
// this shape as later phases add more offline-capable writes.
export interface LocalRowBatch {
  sales?: Sale[];
  saleItems?: SaleItem[];
  inventory?: Inventory[];
  movements?: InventoryMovement[];
  auditLogs?: AuditLog[];
  shifts?: Shift[];
  refunds?: Refund[];
  purchaseOrders?: PurchaseOrder[];
  purchaseOrderItems?: PurchaseOrderItem[];
  supplierPayments?: SupplierPayment[];
  stockTransfers?: StockTransfer[];
  stockTransferItems?: StockTransferItem[];
}

// Callers fire these without awaiting (the Zustand `set()` already applied
// the change; this is just mirroring it to the cache). A failure here — no
// IndexedDB in this context, quota exceeded, private-browsing restrictions —
// must never surface as an unhandled rejection or block the write that
// already succeeded; log and move on, same as lib/supabase.ts's dbAudit.
export async function putLocalRows(rows: LocalRowBatch): Promise<void> {
  try {
    await Promise.all([
      rows.sales?.length ? localDb.sales.bulkPut(rows.sales) : undefined,
      rows.saleItems?.length ? localDb.saleItems.bulkPut(rows.saleItems) : undefined,
      rows.inventory?.length ? localDb.inventory.bulkPut(rows.inventory) : undefined,
      rows.movements?.length ? localDb.movements.bulkPut(rows.movements) : undefined,
      rows.auditLogs?.length ? localDb.auditLogs.bulkPut(rows.auditLogs) : undefined,
      rows.shifts?.length ? localDb.shifts.bulkPut(rows.shifts) : undefined,
      rows.refunds?.length ? localDb.refunds.bulkPut(rows.refunds) : undefined,
      rows.purchaseOrders?.length ? localDb.purchaseOrders.bulkPut(rows.purchaseOrders) : undefined,
      rows.purchaseOrderItems?.length ? localDb.purchaseOrderItems.bulkPut(rows.purchaseOrderItems) : undefined,
      rows.supplierPayments?.length ? localDb.supplierPayments.bulkPut(rows.supplierPayments) : undefined,
      rows.stockTransfers?.length ? localDb.stockTransfers.bulkPut(rows.stockTransfers) : undefined,
      rows.stockTransferItems?.length ? localDb.stockTransferItems.bulkPut(rows.stockTransferItems) : undefined,
    ]);
  } catch (err) {
    console.error("[DB] Failed to mirror rows to the local cache:", err);
  }
}

const TABLES = {
  sales: localDb.sales,
  saleItems: localDb.saleItems,
  movements: localDb.movements,
  auditLogs: localDb.auditLogs,
  shifts: localDb.shifts,
  refunds: localDb.refunds,
  purchaseOrders: localDb.purchaseOrders,
  purchaseOrderItems: localDb.purchaseOrderItems,
  supplierPayments: localDb.supplierPayments,
  stockTransfers: localDb.stockTransfers,
  stockTransferItems: localDb.stockTransferItems,
} as const;

/** Delete provisional rows (by table + id) once they've been superseded by
 *  the server's authoritative rows on sync. Composite-key tables like
 *  `inventory` aren't included here — they're never provisionally created,
 *  just upserted in place, so there's nothing to delete. */
export async function deleteLocalRows(provisional: { table: string; ids: string[] }[] | undefined): Promise<void> {
  if (!provisional?.length) return;
  try {
    await Promise.all(
      provisional.map(({ table, ids }) => {
        const t = TABLES[table as keyof typeof TABLES];
        return t && ids.length ? t.bulkDelete(ids) : undefined;
      }),
    );
  } catch (err) {
    console.error("[DB] Failed to remove provisional rows from the local cache:", err);
  }
}
