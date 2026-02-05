import type { CartItem } from "../../types";

export const calculateCartTotals = (items: CartItem[], cartDiscountPct: number) => {
  const subtotal = items.reduce((sum, item) => sum + item.unitPriceMmk * item.qty * item.unitsPerItem, 0);
  const itemDiscount = items.reduce((sum, item) => {
    const pct = item.itemDiscountPct || 0;
    return sum + item.unitPriceMmk * item.qty * item.unitsPerItem * (pct / 100);
  }, 0);
  const afterItemDiscount = subtotal - itemDiscount;
  const cartDiscount = Math.round(afterItemDiscount * (cartDiscountPct / 100));
  const total = Math.max(0, afterItemDiscount - cartDiscount);
  return { subtotal, itemDiscount, cartDiscount, total };
};
