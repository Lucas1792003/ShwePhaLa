import type { StateCreator } from "zustand";
import type { DataState, InventoryState, AdjustStockInput } from "../types";
import type { AuditLog, Inventory, InventoryMovement } from "../../../types";
import { supabase } from "../../../lib/supabase";

// Shape returned by the adjust_stock RPC (camelCase keys).
interface AdjustStockResult {
  inventory: Inventory;
  movement: InventoryMovement;
  auditLog: AuditLog;
}

export const createInventorySlice: StateCreator<DataState, [], [], InventoryState> = (set, get) => ({
  inventory: [],
  movements: [],

  // Manual inventory adjustment / damage write-off — a single atomic Supabase
  // RPC. The database validates permission, shop scope, the reason, the type
  // and the resulting stock level, then writes inventory, the movement and the
  // audit row in one transaction.
  adjustStock: async ({ shopId, productId, type, qtyChange, reason }: AdjustStockInput) => {
    const { data, error } = await supabase.rpc("adjust_stock", {
      p_shop_id: shopId,
      p_product_id: productId,
      p_adjustment_type: type,
      p_quantity_delta: qtyChange,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Stock adjustment returned no data.");

    const result = data as AdjustStockResult;

    // Reconcile local state from the authoritative RPC result.
    set((s) => {
      const idx = s.inventory.findIndex(
        (i) => i.shopId === result.inventory.shopId && i.productId === result.inventory.productId
      );
      const inventory =
        idx >= 0
          ? s.inventory.map((i, n) => (n === idx ? result.inventory : i))
          : [...s.inventory, result.inventory];
      return {
        inventory,
        movements: [result.movement, ...s.movements],
        auditLogs: [result.auditLog, ...s.auditLogs],
      };
    });
  },

  recordDamage: async ({ shopId, productId, qty, reason, actorId }) => {
    // Damage write-off is a negative adjustment of type DAMAGE.
    await get().adjustStock({
      shopId,
      productId,
      type: "DAMAGE",
      qtyChange: -Math.abs(qty),
      reason: `Damage/Expiry: ${reason}`,
      actorId,
      referenceType: "damage",
    });
  },

  getInventoryQty: (shopId: string, productId: string) => {
    const record = get().inventory.find((item) => item.shopId === shopId && item.productId === productId);
    return record?.qtyBaseUnits ?? 0;
  },
});
