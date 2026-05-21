import type { Shift } from "../../types";
import { formatDateTime, formatMmk } from "../../lib/utils";

interface ShiftDetailProps {
  shift: Shift;
  cashierName?: string;
  saleCount: number;
}

export const ShiftDetail = ({ shift, cashierName, saleCount }: ShiftDetailProps) => (
  <div className="space-y-2 text-sm">
    <div>Cashier: {cashierName}</div>
    <div>Started: {formatDateTime(shift.startedAt)}</div>
    {shift.endedAt && <div>Ended: {formatDateTime(shift.endedAt)}</div>}
    <div>Opening cash: {formatMmk(shift.openingCashMmk)}</div>
    <div>Expected cash: {formatMmk(shift.expectedCashMmk ?? 0)}</div>
    <div>Closing cash: {formatMmk(shift.closingCashMmk ?? 0)}</div>
    <div>Variance: {formatMmk(shift.varianceMmk ?? 0)}</div>
    {shift.varianceReason && <div>Variance reason: {shift.varianceReason}</div>}
    <div>Sales count: {saleCount}</div>
  </div>
);
