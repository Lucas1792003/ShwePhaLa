import type { SaleItem } from "../../types";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { toNumber } from "../../lib/utils";

interface RefundModalProps {
  open: boolean;
  items: SaleItem[];
  selection: Record<string, number>;
  reason: string;
  productNames?: Record<string, string>;
  onChangeSelection: (productId: string, qty: number) => void;
  onChangeReason: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const RefundModal = ({ open, items, selection, reason, productNames, onChangeSelection, onChangeReason, onClose, onSubmit }: RefundModalProps) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Partial refund"
    description="Select items to refund."
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onSubmit}>Submit</Button>
      </>
    }
  >
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.productId} className="flex items-center justify-between gap-3">
          <div className="text-sm">{productNames?.[item.productId] ?? item.productId}</div>
          <Input
            type="number"
            min={0}
            max={item.qtyUnits}
            value={selection[item.productId] ?? 0}
            onChange={(event) => onChangeSelection(item.productId, Math.min(item.qtyUnits, toNumber(event.target.value)))}
            className="w-24"
          />
        </div>
      ))}
    </div>
    <Input value={reason} onChange={(event) => onChangeReason(event.target.value)} placeholder="Reason" />
  </Modal>
);
