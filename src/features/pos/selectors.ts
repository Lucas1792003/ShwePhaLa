import type { CartItem } from "../../types";

export const getCartSubtotal = (items: CartItem[]) =>
  items.reduce((sum, item) => sum + item.unitPriceMmk * item.qty, 0);
