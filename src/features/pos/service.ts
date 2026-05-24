import type { CartItem } from "../../types";

export const calculateCartTotals = (items: CartItem[], cartDiscountPct: number) => {
  // Calculate subtotal (before any discounts)
  const subtotal = items.reduce((sum, item) => sum + item.unitPriceMmk * item.qty, 0);

  // Calculate line totals with per-line rounding (matches saleSlice.ts logic)
  const lineTotals = items.map((item) => {
    const itemDiscountPct = item.itemDiscountPct || 0;
    // Per-line rounding - matches store calculation exactly
    return Math.round(item.qty * item.unitPriceMmk * (1 - itemDiscountPct / 100));
  });

  // Sum of rounded line totals = afterItemDiscount
  const afterItemDiscount = lineTotals.reduce((sum, lineTotal) => sum + lineTotal, 0);

  // Item discount is the difference
  const itemDiscount = subtotal - afterItemDiscount;

  // Cart discount applied to afterItemDiscount total
  const cartDiscount = Math.round(afterItemDiscount * (cartDiscountPct / 100));

  // Final total
  const total = Math.max(0, afterItemDiscount - cartDiscount);

  return { subtotal, itemDiscount, cartDiscount, total };
};
