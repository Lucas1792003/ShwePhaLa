import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { useToast } from "../ui/Toast";
import { MoneyInput } from "../forms/MoneyInput";
import { formatMmk } from "../../lib/utils";
import { getErrorMessage } from "../../lib/errors";
import { useDataStore } from "../../stores/dataStore";
import { getPurchaseOrderBalanceMmk } from "../../features/suppliers/debt";
import { supplierPaymentMethods } from "../../features/suppliers/uiConstants";
import type { PurchaseOrder, SupplierPaymentMethod } from "../../types";

interface SupplierPaymentModalProps {
  // PO to record a payment against. When null, the modal is closed.
  purchaseOrder: PurchaseOrder | null;
  onClose: () => void;
}

interface FormState {
  amountMmk: number;
  paymentMethod: SupplierPaymentMethod;
  referenceNo: string;
  notes: string;
}

export const SupplierPaymentModal = ({ purchaseOrder, onClose }: SupplierPaymentModalProps) => {
  const recordSupplierPayment = useDataStore((state) => state.recordSupplierPayment);
  const toast = useToast();

  const balance = purchaseOrder ? getPurchaseOrderBalanceMmk(purchaseOrder) : 0;

  const [form, setForm] = useState<FormState>({
    amountMmk: 0,
    paymentMethod: "CASH",
    referenceNo: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Re-seed every time a new PO is selected. Default to outstanding balance
  // because paying a PO in full is the common case; the user can adjust down.
  useEffect(() => {
    if (!purchaseOrder) return;
    setForm({
      amountMmk: balance,
      paymentMethod: "CASH",
      referenceNo: "",
      notes: "",
    });
    setError(null);
    setSubmitting(false);
    // We re-seed only when the *target* PO changes — balance recalculates from
    // it. Including `balance` in deps would re-seed after each successful
    // payment update, which is what we want anyway since the modal closes.
  }, [purchaseOrder, balance]);

  const requestClose = () => {
    if (submitting) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!purchaseOrder) return;
    if (submitting) return;
    if (purchaseOrder.status !== "RECEIVED") {
      setError("Only received purchase orders can be paid.");
      return;
    }
    if (form.amountMmk <= 0 || form.amountMmk > balance) {
      setError(`Amount must be between MMK 1 and ${formatMmk(balance)}.`);
      return;
    }
    setSubmitting(true);
    try {
      await recordSupplierPayment({
        purchaseOrderId: purchaseOrder.id,
        amountMmk: form.amountMmk,
        paymentMethod: form.paymentMethod,
        referenceNo: form.referenceNo || undefined,
        notes: form.notes || undefined,
      });
      toast({
        variant: "success",
        title: "Supplier payment recorded",
        description: `${purchaseOrder.orderNo} updated.`,
      });
      onClose();
    } catch (err) {
      const message = getErrorMessage(err, "Could not record supplier payment.");
      setError(message);
      toast({ variant: "error", title: "Payment failed", description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={Boolean(purchaseOrder)}
      onClose={requestClose}
      title="Record supplier payment"
      description={purchaseOrder?.orderNo}
    >
      {purchaseOrder && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Total</div>
                <div className="mt-0.5 font-semibold">{formatMmk(purchaseOrder.totalMmk)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Outstanding</div>
                <div className="mt-0.5 font-semibold text-rose-700">{formatMmk(balance)}</div>
              </div>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Amount</span>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <MoneyInput
                  value={form.amountMmk}
                  onChange={(value) => setForm((prev) => ({ ...prev, amountMmk: value ?? 0 }))}
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setForm((prev) => ({ ...prev, amountMmk: balance }))}
                disabled={balance <= 0}
              >
                Pay outstanding
              </Button>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Outstanding balance: {formatMmk(balance)}
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Payment method</span>
            <Select
              value={form.paymentMethod}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, paymentMethod: event.target.value as SupplierPaymentMethod }))
              }
            >
              {supplierPaymentMethods.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Reference no</span>
            <input
              type="text"
              value={form.referenceNo}
              onChange={(event) => setForm((prev) => ({ ...prev, referenceNo: event.target.value }))}
                className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Bank slip, mobile transaction, voucher..."
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              className="min-h-24 w-full rounded-lg border px-3 py-2 text-sm"
              rows={2}
              placeholder="Optional notes"
            />
          </label>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="secondary" disabled={submitting} onClick={requestClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || form.amountMmk <= 0 || form.amountMmk > balance}
            >
              {submitting ? "Recording…" : "Record payment"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
