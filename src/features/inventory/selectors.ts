import type { Inventory } from "../../types";

export const getInventoryRecord = (inventory: Inventory[], shopId: string, productId: string) =>
  inventory.find((item) => item.shopId === shopId && item.productId === productId);
