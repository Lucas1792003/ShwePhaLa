import type { StateCreator } from "zustand";
import type { DataState, TransferState, CreateTransferInput } from "../types";
import type {
  AuditLog, Inventory, InventoryMovement, StockTransfer, StockTransferItem,
} from "../../../types";
import { supabase } from "../../../lib/supabase";

// ---- RPC result shapes (camelCase, ready for the store) ----
interface CreateTransferResult {
  stockTransfer: StockTransfer;
  stockTransferItems: StockTransferItem[];
  auditLogs: AuditLog[];
}
interface ApproveTransferResult {
  stockTransfer: StockTransfer;
  stockTransferItems: StockTransferItem[];
  auditLogs: AuditLog[];
}
interface TransferStatusResult {
  stockTransfer: StockTransfer;
  auditLogs: AuditLog[];
}
interface CompleteTransferResult {
  stockTransfer: StockTransfer;
  stockTransferItems: StockTransferItem[];
  inventory: Inventory[];
  movements: InventoryMovement[];
  auditLogs: AuditLog[];
}

// Merge RPC-returned inventory rows into the current store array.
const mergeInventory = (current: Inventory[], updates: Inventory[]): Inventory[] => {
  const result = [...current];
  for (const u of updates) {
    const idx = result.findIndex((i) => i.shopId === u.shopId && i.productId === u.productId);
    if (idx >= 0) result[idx] = { ...result[idx], qtyBaseUnits: u.qtyBaseUnits };
    else result.push(u);
  }
  return result;
};

export const createTransferSlice: StateCreator<DataState, [], [], TransferState> = (set, get) => ({
  stockTransfers: [],
  stockTransferItems: [],

  // Transfer creation: atomic RPC (validates permission, shop scope, stock).
  createTransfer: async ({ fromShopId, toShopId, items, notes }: CreateTransferInput) => {
    const { data, error } = await supabase.rpc("create_stock_transfer", {
      p_from_shop_id: fromShopId,
      p_to_shop_id: toShopId,
      p_notes: notes ?? null,
      p_items: items.map((i) => ({
        product_id: i.productId,
        requested_qty: i.requestedQty ?? null,
        product_unit_id: i.productUnitId ?? null,
        selected_unit_quantity: i.selectedUnitQuantity ?? null,
      })),
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Create transfer returned no data.");
    const result = data as CreateTransferResult;

    set((s) => ({
      stockTransfers: [result.stockTransfer, ...s.stockTransfers],
      stockTransferItems: [...result.stockTransferItems, ...s.stockTransferItems],
      auditLogs: [...result.auditLogs, ...s.auditLogs],
    }));
    return result.stockTransfer.id;
  },

  approveTransfer: async ({ transferId }) => {
    const { data, error } = await supabase.rpc("approve_stock_transfer", { p_transfer_id: transferId });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Approve transfer returned no data.");
    const result = data as ApproveTransferResult;

    set((s) => ({
      stockTransfers: s.stockTransfers.map((t) =>
        t.id === result.stockTransfer.id ? result.stockTransfer : t
      ),
      stockTransferItems: s.stockTransferItems.map(
        (i) => result.stockTransferItems.find((u) => u.id === i.id) ?? i
      ),
      auditLogs: [...result.auditLogs, ...s.auditLogs],
    }));
  },

  rejectTransfer: async ({ transferId, reason }) => {
    const { data, error } = await supabase.rpc("reject_stock_transfer", {
      p_transfer_id: transferId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Reject transfer returned no data.");
    const result = data as TransferStatusResult;

    set((s) => ({
      stockTransfers: s.stockTransfers.map((t) =>
        t.id === result.stockTransfer.id ? result.stockTransfer : t
      ),
      auditLogs: [...result.auditLogs, ...s.auditLogs],
    }));
  },

  // Transfer completion: atomic RPC; moves stock + writes paired movements.
  completeTransfer: async ({ transferId }) => {
    const { data, error } = await supabase.rpc("complete_stock_transfer", {
      p_transfer_id: transferId,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Transfer completion returned no data.");
    const result = data as CompleteTransferResult;

    set((s) => ({
      stockTransfers: s.stockTransfers.map((t) =>
        t.id === result.stockTransfer.id ? result.stockTransfer : t
      ),
      stockTransferItems: s.stockTransferItems.map(
        (i) => result.stockTransferItems.find((u) => u.id === i.id) ?? i
      ),
      inventory: mergeInventory(s.inventory, result.inventory),
      movements: [...result.movements, ...s.movements],
      auditLogs: [...result.auditLogs, ...s.auditLogs],
    }));
  },

  cancelTransfer: async ({ transferId, reason }) => {
    const { data, error } = await supabase.rpc("cancel_stock_transfer", {
      p_transfer_id: transferId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Cancel transfer returned no data.");
    const result = data as TransferStatusResult;

    set((s) => ({
      stockTransfers: s.stockTransfers.map((t) =>
        t.id === result.stockTransfer.id ? result.stockTransfer : t
      ),
      auditLogs: [...result.auditLogs, ...s.auditLogs],
    }));
  },

  getTransfersByShop: (shopId: string) =>
    get().stockTransfers.filter((t) => t.fromShopId === shopId || t.toShopId === shopId),

  getPendingTransfersForApproval: (shopId: string) =>
    get().stockTransfers.filter((t) => t.fromShopId === shopId && t.status === "PENDING"),
});
