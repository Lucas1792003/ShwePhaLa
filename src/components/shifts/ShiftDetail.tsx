import type { ReactNode } from "react";
import type { Shift } from "../../types";
import { formatDateTime, formatMmk } from "../../lib/utils";
import type { ShiftBreakdown } from "../../features/shifts/service";

interface ShiftDetailProps {
  shift: Shift;
  cashierName?: string;
  breakdown: ShiftBreakdown;
}

const Row = ({ label, value }: { label: string; value: ReactNode }) => (
  <>
    <div className="text-slate-500">{label}</div>
    <div className="text-right tabular-nums text-slate-800">{value}</div>
  </>
);

export const ShiftDetail = ({ shift, cashierName, breakdown }: ShiftDetailProps) => {
  const { isOpen, cashSaleCount, otherSaleCount, cashTotal, otherTotal, voidedCount, approvedCashRefunds, expectedCash, salesCount } = breakdown;

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
        <Row label="Cashier" value={cashierName ?? "—"} />
        <Row label="Status" value={isOpen ? "Open" : "Closed"} />
        <Row label="Started" value={formatDateTime(shift.startedAt)} />
        {shift.endedAt && <Row label="Ended" value={formatDateTime(shift.endedAt)} />}
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Payment breakdown</div>
        <div className="mt-2 grid grid-cols-[1fr_max-content] gap-x-6 gap-y-1">
          <div>Cash sales ({cashSaleCount})</div>
          <div className="text-right tabular-nums">{formatMmk(cashTotal)}</div>
          <div>Other sales ({otherSaleCount})</div>
          <div className="text-right tabular-nums">{formatMmk(otherTotal)}</div>
          {approvedCashRefunds > 0 && (
            <>
              <div>Approved cash refunds</div>
              <div className="text-right tabular-nums">- {formatMmk(approvedCashRefunds)}</div>
            </>
          )}
          {voidedCount > 0 && (
            <>
              <div>Voided sales</div>
              <div className="text-right tabular-nums">{voidedCount}</div>
            </>
          )}
          <div className="font-medium">Sales count</div>
          <div className="text-right tabular-nums font-medium">{salesCount}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Cash reconciliation</div>
        <div className="mt-2 grid grid-cols-[1fr_max-content] gap-x-6 gap-y-1">
          <div>Opening cash</div>
          <div className="text-right tabular-nums">{formatMmk(shift.openingCashMmk)}</div>
          <div>{isOpen ? "Expected cash (live)" : "Expected cash"}</div>
          <div className="text-right tabular-nums">{formatMmk(expectedCash)}</div>
          <div>Closing cash</div>
          <div className="text-right tabular-nums">{isOpen ? "—" : formatMmk(shift.closingCashMmk ?? 0)}</div>
          <div>Variance</div>
          <div className="text-right tabular-nums">{isOpen ? "—" : formatMmk(shift.varianceMmk ?? 0)}</div>
        </div>
      </div>

      {shift.varianceReason && (
        <div className="text-slate-600">Variance reason: {shift.varianceReason}</div>
      )}
    </div>
  );
};
