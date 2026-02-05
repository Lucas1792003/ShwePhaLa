import type { ReactNode } from "react";
import type { Refund, Sale, SaleItem } from "../../types";
import { Drawer } from "../ui/Drawer";
import { Badge } from "../ui/Badge";
import { formatDateTime, formatMmk } from "../../lib/utils";

interface SaleDetailDrawerProps {
  open: boolean;
  sale: Sale | null;
  items: SaleItem[];
  refunds: Refund[];
  actions?: ReactNode;
  reprintCount?: number;
  productNames?: Record<string, string>;
  onClose: () => void;
}

export const SaleDetailDrawer = ({ open, sale, items, refunds, actions, reprintCount, productNames, onClose }: SaleDetailDrawerProps) => {
  if (!sale) return null;
  return (
    <Drawer open={open} title={`Sale ${sale.receiptNo}`} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span>Status</span>
          <Badge tone={sale.status === "NORMAL" ? "green" : sale.status === "VOID" ? "red" : "amber"}>{sale.status}</Badge>
        </div>
        <div className="text-xs text-slate-500">{formatDateTime(sale.createdAt)}</div>
        <div className="flex items-center justify-between text-xs">
          <span>Payment</span>
          <span>{sale.paymentMethod}</span>
        </div>
        <div>Items</div>
        {items.map((item) => (
          <div key={`${item.saleId}-${item.productId}`} className="text-xs">
            <div className="flex justify-between">
              <span>{productNames?.[item.productId] ?? item.productId}</span>
              <span>{formatMmk(item.lineTotalMmk)}</span>
            </div>
            {(item.itemDiscountPct || item.priceOverriddenBy) && (
              <div className="text-[10px] text-slate-400">
                {item.itemDiscountPct ? `Discount ${item.itemDiscountPct}%` : ""} {item.priceOverriddenBy ? "Override" : ""}
              </div>
            )}
          </div>
        ))}
        <div className="mt-4 text-xs text-slate-500">Refunds: {refunds.length}</div>
        <div className="text-xs text-slate-500">Reprints: {reprintCount ?? 0}</div>
        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </Drawer>
  );
};
