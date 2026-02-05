import type { Sale, Shop, User } from "../../types";
import { formatDateTime, formatMmk } from "../../lib/utils";

interface ReceiptPreviewProps {
  sale: Sale;
  lines: { name: string; qtyLabel: string; total: string }[];
  shop: Shop;
  cashier?: User;
  statusNote?: string;
}

export const ReceiptPreview = ({ sale, lines, shop, cashier, statusNote }: ReceiptPreviewProps) => (
  <div className="receipt rounded-2xl border border-slate-200/70 p-4 shadow-card">
    <div className="text-center">
      <div className="text-lg font-semibold">{shop.name}</div>
      <div className="text-xs text-slate-500">{shop.address}</div>
      <div className="mt-2 text-xs mono">Receipt {sale.receiptNo}</div>
    </div>
    <div className="mt-4 space-y-1 text-xs">
      <div className="flex justify-between"><span>Date</span><span>{formatDateTime(sale.createdAt)}</span></div>
      <div className="flex justify-between"><span>Cashier</span><span>{cashier?.name}</span></div>
      <div className="flex justify-between"><span>Status</span><span>{sale.status}</span></div>
    </div>
    <div className="my-3 border-t border-dashed border-slate-300" />
    <div className="space-y-2 text-xs">
      {lines.map((line, index) => (
        <div key={`${line.name}-${index}`} className="flex justify-between">
          <div>
            <div>{line.name}</div>
            <div className="text-[10px] text-slate-500">{line.qtyLabel}</div>
          </div>
          <div>{line.total}</div>
        </div>
      ))}
    </div>
    <div className="my-3 border-t border-dashed border-slate-300" />
    <div className="space-y-1 text-xs">
      <div className="flex justify-between"><span>Subtotal</span><span>{formatMmk(sale.subtotalMmk)}</span></div>
      <div className="flex justify-between"><span>Discount</span><span>- {formatMmk(sale.discountMmk)}</span></div>
      <div className="flex justify-between font-semibold"><span>Total</span><span>{formatMmk(sale.totalMmk)}</span></div>
      <div className="flex justify-between"><span>Paid</span><span>{formatMmk(sale.paidMmk)}</span></div>
      <div className="flex justify-between"><span>Change</span><span>{formatMmk(sale.changeMmk)}</span></div>
    </div>
    {statusNote && <div className="mt-3 text-center text-[10px] text-slate-500">{statusNote}</div>}
  </div>
);
