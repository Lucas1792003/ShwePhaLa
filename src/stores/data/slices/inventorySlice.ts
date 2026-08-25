import type { StateCreator } from "zustand";
import type { DataState, InventoryState, AdjustStockInput } from "../types";
import type { AuditLog, Inventory, InventoryMovement } from "../../../types";
import { supabase } from "../../../lib/supabase";
import { isNetworkError } from "../../../lib/errors";
import { newId } from "../../../lib/id";
import { enqueueOutbox } from "../outbox";
import { deleteLocalRows, putLocalRows } from "../localWrites";
import { assertOfflineWriteEligible } from "../../authStore";

// Shape returned by the adjust_stock RPC (camelCase keys).
interface AdjustStockResult {
  inventory: Inventory;
  movement: InventoryMovement;
  auditLog: AuditLog;
}

// Shared by the online call and the offline path (which stores this exact
// payload in the outbox to replay verbatim once back online).
const buildAdjustStockArgs = (
  { shopId, productId, type, qtyChange, reason, productUnitId, unitQty }: AdjustStockInput,
  createdAt: string,
) => ({
  p_shop_id: shopId,
  p_product_id: productId,
  p_adjustment_type: type,
  // When a sellable unit is selected, the server overrides the magnitude
  // (`unitQty * base_quantity`) but keeps the sign of `qtyChange`. Pass
  // ±1 from the form as a direction hint in that path.
  p_quantity_delta: qtyChange,
  p_reason: reason,
  p_product_unit_id: productUnitId ?? null,
  p_unit_qty: unitQty ?? null,
  // Preserved through an offline queue-and-replay — see migration 045.
  p_created_at: createdAt,
});

export const createInventorySlice: StateCreator<DataState, [], [], InventoryState> = (set, get) => {
  // Manual inventory adjustment / damage write-off — a single atomic Supabase
  // RPC. The database validates permission, shop scope, the reason, the type
  // and the resulting stock level, then writes inventory, the movement and the
  // audit row in one transaction.
  const adjustStockOnline = async (input: AdjustStockInput): Promise<void> => {
    const { data, error } = await supabase.rpc(
      "adjust_stock",
      buildAdjustStockArgs(input, new Date().toISOString()),
    );
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
    void putLocalRows({ inventory: [result.inventory], movements: [result.movement], auditLogs: [result.auditLog] });
  };

  // No network: stage the adjustment locally against the current cached
  // stock level and queue the exact RPC call for replay once back online.
  // The server is still the final say: reconcileAdjustStock() below replaces
  // this provisional movement with whatever the server actually accepts.
  const adjustStockOffline = async (input: AdjustStockInput): Promise<void> => {
    await assertOfflineWriteEligible();
    const { shopId, productId, type, qtyChange, reason, actorId, referenceType, referenceId, productUnitId, unitQty } = input;
    const now = new Date().toISOString();
    const qtyBefore = get().getInventoryQty(shopId, productId);

    // Mirror the server: a sellable unit overrides the magnitude but keeps
    // qtyChange's sign as the direction.
    let delta = qtyChange;
    if (productUnitId && unitQty != null) {
      const unit = get().productUnits.find((u) => u.id === productUnitId);
      const magnitude = unit ? unitQty * unit.baseQuantity : Math.abs(qtyChange);
      delta = qtyChange < 0 ? -magnitude : magnitude;
    }
    const qtyAfter = qtyBefore + delta;
    if (qtyAfter < 0) {
      throw new Error(`Adjustment would leave negative stock (${qtyAfter}).`);
    }

    const inventoryUpdate: Inventory = { shopId, productId, qtyBaseUnits: qtyAfter };
    const movement: InventoryMovement = {
      id: newId("move"), shopId, productId, type,
      qtyChange: delta, qtyBefore, qtyAfter, reason,
      referenceType, referenceId, createdBy: actorId, createdAt: now,
      productUnitId, pendingSync: true,
    };

    set((s) => {
      const idx = s.inventory.findIndex((i) => i.shopId === shopId && i.productId === productId);
      const inventory = idx >= 0
        ? s.inventory.map((i, n) => (n === idx ? inventoryUpdate : i))
        : [...s.inventory, inventoryUpdate];
      return { inventory, movements: [movement, ...s.movements] };
    });
    void putLocalRows({ inventory: [inventoryUpdate], movements: [movement] });

    await enqueueOutbox({
      kind: "rpc",
      name: "adjust_stock",
      args: buildAdjustStockArgs(input, now),
      shopId,
      provisional: [{ table: "movements", ids: [movement.id] }],
    });
  };

  return {
    inventory: [],
    movements: [],

    adjustStock: async (input: AdjustStockInput) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return adjustStockOffline(input);
      }
      try {
        return await adjustStockOnline(input);
      } catch (err) {
        if (isNetworkError(err)) return adjustStockOffline(input);
        throw err;
      }
    },

    // Called by the outbox once a queued adjust_stock actually runs — swaps
    // the provisional movement for the server's authoritative one.
    reconcileAdjustStock: (data, provisional) => {
      const result = data as AdjustStockResult;
      const provisionalMovementIds = new Set(provisional.find((p) => p.table === "movements")?.ids ?? []);

      set((s) => {
        const idx = s.inventory.findIndex(
          (i) => i.shopId === result.inventory.shopId && i.productId === result.inventory.productId
        );
        const inventory = idx >= 0
          ? s.inventory.map((i, n) => (n === idx ? result.inventory : i))
          : [...s.inventory, result.inventory];
        return {
          inventory,
          movements: [result.movement, ...s.movements.filter((m) => !provisionalMovementIds.has(m.id))],
          auditLogs: [result.auditLog, ...s.auditLogs],
        };
      });
      void deleteLocalRows(provisional);
      void putLocalRows({ inventory: [result.inventory], movements: [result.movement], auditLogs: [result.auditLog] });
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
  };
};
