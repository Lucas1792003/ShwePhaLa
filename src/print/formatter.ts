import type { Sale, SaleItem } from "../types";
import { formatMmk } from "../lib/utils";

export const buildReceiptLines = (_sale: Sale, items: SaleItem[]) => {
  return items.map((item) => {
    const qtyLabel = `${item.qtyUnits} x ${formatMmk(item.unitPriceMmk)}`;
    return {
      title: item.productId,
      qtyLabel,
      total: formatMmk(item.lineTotalMmk),
    };
  });
};
