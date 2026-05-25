import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { toNumber } from "../../lib/utils";
import type { Product, ProductUnit, StockMovementType } from "../../types";
import { getActiveProductUnits, getDefaultProductUnit } from "../../features/catalog/productUnits";
import { convertToBaseQuantity } from "../../features/inventory/stockDisplay";

type AdjustmentType = "ADJUSTMENT" | "DAMAGE" | "PURCHASE_IN" | "RETURN_IN";

interface AdjustStockModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Save handler. When the admin picks a non-base sellable unit, the
   * modal sends `productUnitId` + `unitQty`; the server uses those to
   * compute the base delta. `qtyChange` is the **direction-only** sign
   * (±1) in that case — the legacy base-units path still sends a real
   * signed magnitude.
   */
  onSave: (payload: {
    type: StockMovementType;
    qtyChange: number;
    reason: string;
    productUnitId?: string;
    unitQty?: number;
  }) => void;
  /** Optional — when provided, the modal renders a Unit picker per migration 028. */
  product?: Product | null;
  productUnits?: ProductUnit[];
}

export const AdjustStockModal = ({
  open,
  onClose,
  onSave,
  product = null,
  productUnits = [],
}: AdjustStockModalProps) => {
  const [type, setType] = useState<AdjustmentType>("ADJUSTMENT");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState(0);
  const [unitId, setUnitId] = useState("");
  const [reason, setReason] = useState("");

  const activeUnits = useMemo(() => {
    if (!product) return [];
    const active = getActiveProductUnits(product.id, productUnits);
    if (active.length > 0) return active;
    // Fall back to the synthesized default unit so the picker still shows
    // something usable for legacy products that have no `product_units` rows.
    return [getDefaultProductUnit(product, productUnits)];
  }, [product, productUnits]);

  // Initial unit selection: default unit (base_quantity=1) so the modal
  // opens in the same behaviour as the legacy version.
  useEffect(() => {
    if (!open) return;
    const next = activeUnits.find((u) => u.isDefault) ?? activeUnits[0];
    setUnitId(next?.id ?? "");
  }, [open, activeUnits]);

  const selectedUnit = activeUnits.find((u) => u.id === unitId);
  const baseUnitName = product?.unitType ?? "unit";
  const previewBase = selectedUnit
    ? convertToBaseQuantity(qty, selectedUnit)
    : qty;

  const handleSave = () => {
    // Direction → sign. For DAMAGE always negative; for stock-in always
    // positive; for ADJUSTMENT use the picker.
    let sign = 1;
    if (type === "ADJUSTMENT") {
      sign = direction === "remove" ? -1 : 1;
    } else if (type === "DAMAGE") {
      sign = -1;
    }
    // Legacy mode (no unit picker) sends a signed base-unit magnitude
    // directly. Unit-aware mode just sends ±1 as a direction hint and
    // lets the server compute the magnitude from unitQty × base_quantity.
    const legacy = !selectedUnit || selectedUnit.baseQuantity === 1;
    const qtyChange = legacy ? sign * qty : sign * 1;

    onSave({
      type,
      qtyChange,
      reason,
      productUnitId: legacy ? undefined : selectedUnit.id,
      unitQty: legacy ? undefined : qty,
    });
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

        {activeUnits.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
            <Select
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
            >
              {activeUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}{unit.baseQuantity > 1 ? ` (×${unit.baseQuantity})` : ""}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={qty || ""}
            onChange={(event) => setQty(toNumber(event.target.value))}
          />
          {selectedUnit && selectedUnit.baseQuantity > 1 && qty > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {/* Pre-flight conversion preview — final base delta is computed
                  server-side by `adjust_stock` (migration 028). */}
              {qty} {selectedUnit.name} = {previewBase} {baseUnitName}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Enter reason for adjustment" />
        </div>
      </div>
    </Modal>
  );
};
