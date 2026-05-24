import type { SaleItem } from "../../types";

export const buildRefundItems = (items: SaleItem[], selection: Record<string, number>) =>
  items
    .filter((item) => selection[item.productId])
    .map((item) => ({
      productId: item.productId,
      qtyUnits: selection[item.productId],
      amountMmk: Math.round((selection[item.productId] / item.qtyUnits) * item.lineTotalMmk),
    }));
