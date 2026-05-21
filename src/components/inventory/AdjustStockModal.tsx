import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { toNumber } from "../../lib/utils";
import type { StockMovementType } from "../../types";

type AdjustmentType = "ADJUSTMENT" | "DAMAGE" | "PURCHASE_IN" | "RETURN_IN";

interface AdjustStockModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: { type: StockMovementType; qtyChange: number; reason: string }) => void;
}

export const AdjustStockModal = ({ open, onClose, onSave }: AdjustStockModalProps) => {
  const [type, setType] = useState<AdjustmentType>("ADJUSTMENT");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("");

  const handleSave = () => {
    // For ADJUSTMENT type, direction determines sign
    // For DAMAGE, it's always negative (removal)
    // For PURCHASE_IN and RETURN_IN, it's always positive (addition)
    let qtyChange = qty;
    if (type === "ADJUSTMENT") {
      qtyChange = direction === "remove" ? -qty : qty;
    } else if (type === "DAMAGE") {
      qtyChange = -qty; // Always removes stock
    }
    // PURCHASE_IN and RETURN_IN are always positive

    onSave({ type, qtyChange, reason });
    // Reset form
    setType("ADJUSTMENT");
    setDirection("add");
    setQty(0);
    setReason("");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust Stock"
      description="Record an inventory movement."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save adjustment</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Movement Type</label>
          <Select value={type} onChange={(event) => setType(event.target.value as AdjustmentType)}>
            <option value="ADJUSTMENT">Manual Adjustment</option>
            <option value="DAMAGE">Damage / Expired Write-off</option>
            <option value="PURCHASE_IN">Stock In (Purchase)</option>
            <option value="RETURN_IN">Customer Return</option>
          </Select>
        </div>

        {type === "ADJUSTMENT" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Direction</label>
            <Select value={direction} onChange={(event) => setDirection(event.target.value as "add" | "remove")}>
              <option value="add">Add to Stock</option>
              <option value="remove">Remove from Stock</option>
            </Select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
          <Input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={qty || ""} onChange={(event) => setQty(toNumber(event.target.value))} />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Enter reason for adjustment" />
        </div>
      </div>
    </Modal>
  );
};
