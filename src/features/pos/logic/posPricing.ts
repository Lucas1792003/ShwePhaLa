export const applyDiscount = (amount: number, discountPct: number) =>
  Math.max(0, Math.round(amount * (1 - discountPct / 100)));
