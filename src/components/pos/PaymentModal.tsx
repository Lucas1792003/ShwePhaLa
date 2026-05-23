import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { formatMmk, normalizeAmountInput, toNumber } from "../../lib/utils";

interface PaymentModalProps {
  open: boolean;
  totalMmk: number;
  loading?: boolean;
  validationError?: string;
  onClose: () => void;
  onConfirm: (method: "CASH" | "OTHER", paid: number) => void | Promise<void>;
}

export const PaymentModal = ({
  open,
  totalMmk,
  loading = false,
  validationError,
  onClose,
  onConfirm,
}: PaymentModalProps) => {
  const [method, setMethod] = useState<"CASH" | "OTHER">("CASH");
  // String-backed input so we can keep the field empty while editing and
  // never sit on a padded "02900". toNumber("") -> 0 for calculations.
  const [paidInput, setPaidInput] = useState("0");
  const paid = toNumber(paidInput);
  const change = Math.max(0, paid - totalMmk);
  const isUnderpaid = paid < totalMmk;
  const canConfirm = !loading && paid >= totalMmk && !validationError;

  const handleClose = () => {
    if (!loading) onClose();
  };

  useEffect(() => {
    if (open) setPaidInput("0");
  }, [open, totalMmk]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Payment"
      description="Confirm payment details before completing the sale."
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(method, paid)} disabled={!canConfirm}>
            {loading ? "Processing..." : "Confirm payment"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Total due
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-950">
                {formatMmk(totalMmk)}
              </div>
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
              {method === "CASH" ? "Cash payment" : "Other payment"}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <div className="text-xs text-slate-500">Amount received</div>
              <div className="mt-1 text-base font-semibold text-slate-900">
                {formatMmk(paid)}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <div className="text-xs text-slate-500">Change</div>
              <div className="mt-1 text-base font-semibold text-emerald-700">
                {formatMmk(change)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Payment method</span>
            <Select value={method} onChange={(event) => setMethod(event.target.value as "CASH" | "OTHER")}>
              <option value="CASH">Cash</option>
              <option value="OTHER">Other</option>
            </Select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Amount received</span>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={paidInput}
              onChange={(event) => setPaidInput(normalizeAmountInput(event.target.value))}
              onBlur={() => {
                if (paidInput === "") setPaidInput("0");
              }}
              className="text-base font-semibold"
            />
          </label>
        </div>

        {validationError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {validationError}
          </div>
        ) : isUnderpaid ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Amount received is less than total.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-600">Change to return</span>
              <span className="text-lg font-bold text-emerald-700">{formatMmk(change)}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
