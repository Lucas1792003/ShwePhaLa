import type { InventoryMovement, StockMovementType } from "../../types";
import { readDb, writeDb } from "../db";

export const listInventory = () => readDb().inventory;

export const listMovements = () => readDb().movements;

export const adjustStock = (input: {
  shopId: string;
  productId: string;
  type: StockMovementType;
  qtyChange: number;
  reason: string;
  actorId: string;
  referenceType?: "sale" | "transfer" | "purchase" | "adjustment" | "damage";
  referenceId?: string;
}) => {
  const db = readDb();
  const inventory = [...db.inventory];
  const existing = inventory.find((item) => item.shopId === input.shopId && item.productId === input.productId);
  const qtyBefore = existing?.qtyBaseUnits ?? 0;
  let qtyAfter = qtyBefore;

  // Calculate new quantity based on movement type
  if (input.type === "PURCHASE_IN" || input.type === "TRANSFER_IN" || input.type === "RETURN_IN") {
    qtyAfter = qtyBefore + Math.abs(input.qtyChange);
  } else if (input.type === "SALE_OUT" || input.type === "TRANSFER_OUT" || input.type === "DAMAGE" || input.type === "RETURN_OUT") {
    qtyAfter = Math.max(0, qtyBefore - Math.abs(input.qtyChange));
  } else if (input.type === "ADJUSTMENT") {
    qtyAfter = Math.max(0, qtyBefore + input.qtyChange);
  }

  if (existing) {
    existing.qtyBaseUnits = qtyAfter;
  } else {
    inventory.push({
      shopId: input.shopId,
      productId: input.productId,
      qtyBaseUnits: qtyAfter,
    });
  }

  const movement: InventoryMovement = {
    id: `move-${Date.now()}`,
    shopId: input.shopId,
    productId: input.productId,
    type: input.type,
    qtyChange: input.type === "SALE_OUT" || input.type === "TRANSFER_OUT" || input.type === "DAMAGE" || input.type === "RETURN_OUT"
      ? -Math.abs(input.qtyChange)
      : Math.abs(input.qtyChange),
    qtyBefore,
    qtyAfter,
    reason: input.reason,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    createdBy: input.actorId,
    createdAt: new Date().toISOString(),
  };

  writeDb({ ...db, inventory, movements: [movement, ...db.movements] });
};
