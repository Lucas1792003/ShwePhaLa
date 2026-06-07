import type { Sale, Shop, User } from "../../types";
import { formatDateTime, formatMmk } from "../../lib/utils";

interface ReceiptLine {
  /** Product name only — unit, price level, etc. live in their own columns. */
  name: string;
  qty: number;
  unitLabel: string;
  unitPriceMmk: number;
  lineTotalMmk: number;
  /** Snapshot of the price level (Retail / Wholesale / Special) when set. */
  priceLevelName?: string;
}

interface ReceiptPreviewProps {
  sale: Sale;
  lines: ReceiptLine[];
  shop: Shop;
  cashier?: User;
  statusNote?: string;
}

// Plain grouped integer — used inside the items table where the "MMK"
// label would just add noise to every row. The totals block still uses
// `formatMmk` so the currency is shown once, clearly.
const fmtAmount = (value: number) => value.toLocaleString("en-US");

export const ReceiptPreview = ({ sale, lines, shop, cashier, statusNote }: ReceiptPreviewProps) => {
  const itemCount = lines.reduce((sum, line) => sum + line.qty, 0);

  return (
    <div className="receipt rounded-2xl border border-slate-200/70 p-4 shadow-card">
      {/* Brand header */}
      <div className="text-center">
        <img
          src="/logo1.png"
          alt="Shwe Pha La"
          className="receipt-logo mx-auto mb-2"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
        <div className="text-lg font-semibold">{shop.name}</div>
        <div className="text-xs text-slate-500">{shop.address}</div>
        <div className="mt-2 text-xs mono">Receipt {sale.receiptNo}</div>
      </div>

      {/* Meta — stacked rows with a fixed-width label column so the
          colons align cleanly and long values (datetime, cashier name)
          can't push the value off the row. Two columns at this width
          forced the long datetime and cashier strings to wrap awkwardly. */}
      <div className="receipt-meta mt-4 text-xs">
        <div className="receipt-meta-row">
          <span className="receipt-meta-label">Date</span>
          <span className="receipt-meta-sep">:</span>
          <span className="receipt-meta-value">{formatDateTime(sale.createdAt)}</span>
        </div>
        <div className="receipt-meta-row">
          <span className="receipt-meta-label">Cashier</span>
          <span className="receipt-meta-sep">:</span>
          <span className="receipt-meta-value">{cashier?.name ?? "-"}</span>
        </div>
        <div className="receipt-meta-row">
          <span className="receipt-meta-label">Payment</span>
          <span className="receipt-meta-sep">:</span>
          <span className="receipt-meta-value">{sale.paymentMethod}</span>
        </div>
        <div className="receipt-meta-row">
          <span className="receipt-meta-label">Items</span>
          <span className="receipt-meta-sep">:</span>
          <span className="receipt-meta-value">{itemCount}</span>
        </div>
      </div>

      {/* Items — proper 4-column table. Description wraps; Qty / Price /
          Amount stay right-aligned and tabular so the eye can scan down
          the column on paper. */}
      <table className="receipt-items mt-4 w-full text-xs">
        <thead>
          <tr>
            <th className="text-left">Description</th>
            <th className="text-left">Qty</th>
            <th className="text-right">Price</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.name}-${index}`}>
              <td>
                <div>{line.name}</div>
                {line.priceLevelName && (
                  <div className="text-[10px] text-slate-500">
                    {line.priceLevelName}
                  </div>
                )}
              </td>
              <td>{line.qty} {line.unitLabel}</td>
              <td className="text-right">{fmtAmount(line.unitPriceMmk)}</td>
              <td className="text-right">{fmtAmount(line.lineTotalMmk)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals — Subtotal/Discount grouped above; Total bumped in size;
          Paid/Change separated from Total by a thin dashed rule so the
          customer's eye stops on the amount due. */}
      <div className="receipt-totals mt-4 space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatMmk(sale.subtotalMmk)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span>- {formatMmk(sale.discountMmk)}</span>
        </div>
        <div className="my-1 border-t border-dashed border-slate-300" />
        <div className="flex justify-between text-sm font-semibold">
          <span>Total</span>
          <span>{formatMmk(sale.totalMmk)}</span>
        </div>
        <div className="my-1 border-t border-dashed border-slate-300" />
        <div className="flex justify-between">
          <span>Paid</span>
          <span>{formatMmk(sale.paidMmk)}</span>
        </div>
        <div className="flex justify-between">
          <span>Change</span>
          <span>{formatMmk(sale.changeMmk)}</span>
        </div>
      </div>

      {/* Burmese policy + thank-you footer. Lives below all numeric
          totals so the customer's eye lands on the change line first,
          then this. Centered + slightly larger leading for legibility
          on thermal paper. */}
      <div className="receipt-footer mt-4 border-t border-dashed border-slate-300 pt-3 text-center text-xs leading-relaxed">
        <div>ဝယ်ပြီးပစ္စည်းပြန်မလဲပါ။</div>
        <div>ဝယ်ယူအားပေးမှုကိုအထူးကျေးဇူးတင်ပါသည်။</div>
      </div>

      {statusNote && (
        <div className="mt-3 text-center text-[10px] text-slate-500">
          {statusNote}
        </div>
      )}
    </div>
  );
};
