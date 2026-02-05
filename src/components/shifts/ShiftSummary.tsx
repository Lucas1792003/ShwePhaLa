import { formatMmk } from "../../lib/utils";

interface ShiftSummaryProps {
  saleCount: number;
  cashTotal: number;
  otherTotal: number;
}

export const ShiftSummary = ({ saleCount, cashTotal, otherTotal }: ShiftSummaryProps) => (
  <div className="grid gap-3 md:grid-cols-3">
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4">
      <div className="text-xs text-slate-500">Sales count</div>
      <div className="text-lg font-semibold">{saleCount}</div>
    </div>
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4">
      <div className="text-xs text-slate-500">Cash total</div>
      <div className="text-lg font-semibold">{formatMmk(cashTotal)}</div>
    </div>
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4">
      <div className="text-xs text-slate-500">Other total</div>
      <div className="text-lg font-semibold">{formatMmk(otherTotal)}</div>
    </div>
  </div>
);
