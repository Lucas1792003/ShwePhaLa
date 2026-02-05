import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { formatMmk, toNumber } from "../../lib/utils";

interface PaymentModalProps {
  open: boolean;
  totalMmk: number;
  onClose: () => void;
  onConfirm: (method: "CASH" | "OTHER", paid: number) => void;
}

export const PaymentModal = ({ open, totalMmk, onClose, onConfirm }: PaymentModalProps) => {
  const [method, setMethod] = useState<"CASH" | "OTHER">("CASH");
  const [paid, setPaid] = useState(totalMmk);
  const change = Math.max(0, paid - totalMmk);

  useEffect(() => {
    setPaid(totalMmk);
  }, [totalMmk]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Payment"
      description="Confirm payment details before completing the sale."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(method, paid)} disabled={paid < totalMmk}>
            Confirm payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select value={method} onChange={(event) => setMethod(event.target.value as "CASH" | "OTHER")}> 
          <option value="CASH">Cash</option>
          <option value="OTHER">Other</option>
        </Select>
        <Input type="number" value={paid} onChange={(event) => setPaid(toNumber(event.target.value))} />
        <div className="text-sm text-slate-600">Change: {formatMmk(change)}</div>
      </div>
    </Modal>
  );
};
