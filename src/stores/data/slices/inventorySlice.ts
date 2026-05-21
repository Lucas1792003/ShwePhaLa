import type { StateCreator } from "zustand";
import type { DataState, InventoryState, AdjustStockInput } from "../types";
import type { AuditLog, InventoryMovement } from "../../../types";
import { makeId, requirePermission } from "../utils";

export const createInventorySlice: StateCreator<DataState, [], [], InventoryState> = (set, get) => ({
  inventory: [],
  movements: [],

  adjustStock: ({ shopId, productId, type, qtyChange, reason, actorId, referenceType, referenceId }: AdjustStockInput) =>
    set((state) => {
      // Permission check based on movement type
      if (type === "DAMAGE") {
        requirePermission(state.users, actorId, "inventory:damage");
      } else if (type === "ADJUSTMENT") {
        requirePermission(state.users, actorId, "inventory:adjust");
      }
      // Note: SALE_OUT, TRANSFER_IN/OUT, PURCHASE_IN are handled by their respective slices

      const inventory = [...state.inventory];
      const existing = inventory.find((item) => item.shopId === shopId && item.productId === productId);
      const qtyBefore = existing?.qtyBaseUnits ?? 0;
      let qtyAfter = qtyBefore;

      // Calculate new quantity based on movement type (allow negative for accurate ledger)
      if (type === "PURCHASE_IN" || type === "TRANSFER_IN" || type === "RETURN_IN") {
        qtyAfter = qtyBefore + Math.abs(qtyChange);
      } else if (type === "SALE_OUT" || type === "TRANSFER_OUT" || type === "DAMAGE" || type === "RETURN_OUT") {
        qtyAfter = qtyBefore - Math.abs(qtyChange);
      } else if (type === "ADJUSTMENT") {
        qtyAfter = qtyBefore + qtyChange; // ADJUSTMENT can set absolute value, allow negative
      }

      // Update or create inventory record
      if (existing) {
        existing.qtyBaseUnits = qtyAfter;
      } else {
        inventory.push({ shopId, productId, qtyBaseUnits: qtyAfter });
      }

      const movement: InventoryMovement = {
        id: makeId("move"),
        shopId,
        productId,
        type,
        qtyChange: type === "SALE_OUT" || type === "TRANSFER_OUT" || type === "DAMAGE" || type === "RETURN_OUT"
          ? -Math.abs(qtyChange)
          : Math.abs(qtyChange),
        qtyBefore,
        qtyAfter,
        reason,
        referenceType,
        referenceId,
        createdBy: actorId,
        createdAt: new Date().toISOString(),
      };

      const audit: AuditLog = {
        id: makeId("audit"),
        shopId,
        actorId,
        actionType: `STOCK_${type}`,
        message: `Stock ${type}: ${Math.abs(qtyChange)} units. Before: ${qtyBefore}, After: ${qtyAfter}. ${reason}`,
        entityType: "Inventory",
        entityId: productId,
        createdAt: movement.createdAt,
      };

      return {
        inventory,
        movements: [movement, ...state.movements],
        auditLogs: [audit, ...state.auditLogs],
      };
    }),

  recordDamage: ({ shopId, productId, qty, reason, actorId }) => {
    get().adjustStock({
      shopId,
      productId,
      type: "DAMAGE",
      qtyChange: qty,
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
