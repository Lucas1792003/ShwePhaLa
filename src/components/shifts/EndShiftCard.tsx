import { Button } from "../ui/Button";
import { MoneyInput } from "../forms/MoneyInput";
import { formatMmk } from "../../lib/utils";
import { calculateClosingVariance } from "../../features/shifts/shiftRecords";

interface EndShiftCardProps {
  closingCash: number | undefined;
  expectedCash?: number;
  varianceReason?: string;
  onVarianceReasonChange?: (value: string) => void;
  onClosingCashChange: (value: number | undefined) => void;
  onEnd: () => void | Promise<void>;
  disabled?: boolean;
  error?: string | null;
  submitLabel?: string;
  idPrefix?: string;
}

export const EndShiftCard = ({
  closingCash,
  expectedCash,
  varianceReason,
  onVarianceReasonChange,
  onClosingCashChange,
  onEnd,
  disabled,
  error,
  submitLabel = "End shift",
  idPrefix = "close-shift",
}: EndShiftCardProps) => {
  const variance =
    expectedCash === undefined ? null : calculateClosingVariance(closingCash, expectedCash);
  const hasVariance = variance !== null && variance !== 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-closing-cash`} className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Closing cash
        </label>
        <MoneyInput
          id={`${idPrefix}-closing-cash`}
          value={closingCash}
          allowEmpty
          onChange={onClosingCashChange}
          placeholder="e.g. 150000"
        />
        <p className="text-xs text-slate-500">
          MMK amount counted in the drawer. Digits only; commas and symbols are removed.
        </p>
      </div>

      {expectedCash !== undefined && (
        <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 text-sm">
          <div className="grid grid-cols-[1fr_max-content] gap-x-4 gap-y-1">
            <div className="text-slate-500">Expected cash</div>
            <div className="tabular-nums font-medium text-slate-800">{formatMmk(expectedCash)}</div>
            <div className="text-slate-500">Variance preview</div>
            <div
              className={
                hasVariance
                  ? "tabular-nums font-semibold text-amber-700"
                  : "tabular-nums font-semibold text-emerald-700"
              }
            >
              {variance === null ? "Enter closing cash" : formatMmk(variance)}
            </div>
          </div>
        </div>
      )}

      {hasVariance && (
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-variance-reason`} className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Variance reason
          </label>
          <textarea
            id={`${idPrefix}-variance-reason`}
            value={varianceReason ?? ""}
            onChange={(event) => onVarianceReasonChange?.(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            placeholder="Explain the cash difference before closing"
          />
        </div>
      )}

      {error && <div className="text-sm font-medium text-rose-700">{error}</div>}

      <Button onClick={onEnd} disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  );
};
