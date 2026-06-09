import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { useToast } from "../ui/Toast";
import { getErrorMessage } from "../../lib/errors";
import { useDataStore } from "../../stores/dataStore";
import { getActiveProductUnits, getDefaultProductUnit } from "../../features/catalog/productUnits";
import { convertToBaseQuantity } from "../../features/inventory/stockDisplay";

interface PurchaseOrderReceiveModalProps {
  // The PO being received. When null the modal is closed.
  purchaseOrderId: string | null;
  onClose: () => void;
  // Required by the RPC. Falsy disables submit.
  currentUserId: string | null | undefined;
  // Optional callback fired after the RPC succeeds — supplier workspace uses
  // this to refresh its selection / show the new receiving confirmation.
  onReceived?: (purchaseOrderId: string) => void;
}

interface ReceiveLine {
  productId: string;
  // The unit-aware path. When unitId is set the server uses
  // unitQty × unit.base_quantity for the inventory write.
  unitId: string;
  unitQty: number;
}

export const PurchaseOrderReceiveModal = ({
  purchaseOrderId,
  onClose,
  currentUserId,
  onReceived,
}: PurchaseOrderReceiveModalProps) => {
  const purchaseOrders = useDataStore((state) => state.purchaseOrders);
  const purchaseOrderItems = useDataStore((state) => state.purchaseOrderItems);
  const products = useDataStore((state) => state.products);
  const productUnits = useDataStore((state) => state.productUnits);
  const receivePurchaseOrder = useDataStore((state) => state.receivePurchaseOrder);
  const toast = useToast();

  const po = useMemo(
    () => (purchaseOrderId ? purchaseOrders.find((order) => order.id === purchaseOrderId) ?? null : null),
    [purchaseOrderId, purchaseOrders]
  );
  const orderedItems = useMemo(
    () => (purchaseOrderId ? purchaseOrderItems.filter((item) => item.purchaseOrderId === purchaseOrderId) : []),
    [purchaseOrderId, purchaseOrderItems]
  );

  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Default each line to: pick the product's default sellable unit (almost
  // always base, baseQuantity=1) and pre-fill the unit qty so the resulting
  // base total equals the ordered qty. That keeps the common "receive what
  // we ordered" flow a one-click confirm, and the admin can switch the
  // dropdown to Package/Case before submitting to use the new conversion.
  useEffect(() => {
    if (!purchaseOrderId) return;
    setLines(
      orderedItems.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        const defaultUnit = product ? getDefaultProductUnit(product, productUnits) : null;
        const unitId = defaultUnit?.id ?? "";
        const base = Math.max(1, defaultUnit?.baseQuantity ?? 1);
        const unitQty = Math.max(0, Math.floor(item.orderedQty / base));
        return { productId: item.productId, unitId, unitQty };
      })
    );
    setSubmitting(false);
  }, [purchaseOrderId, orderedItems, products, productUnits]);

  const handleSubmit = async () => {
    if (!purchaseOrderId || !currentUserId || submitting) return;
    setSubmitting(true);
    try {
      await receivePurchaseOrder({
        purchaseOrderId,
        receiverId: currentUserId,
        // The server is the source of truth for base-qty conversion; we just
        // forward the picked unit + the unit qty. Empty unitId falls back to
        // the legacy base-qty path inside the RPC.
        receivedItems: lines.map((line) => ({
          productId: line.productId,
          productUnitId: line.unitId || undefined,
          receivedUnitQty: line.unitId ? line.unitQty : undefined,
        })),
      });
      toast({ title: "Purchase order received", variant: "success" });
      onReceived?.(purchaseOrderId);
      onClose();
    } catch (error) {
      toast({
        title: "Receiving failed",
        description: getErrorMessage(error, "Could not receive this purchase order."),
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={Boolean(purchaseOrderId)}
      onClose={() => (submitting ? undefined : onClose())}
      title="Receive purchase order"
      description={po?.orderNo}
      size="lg"
    >
      {purchaseOrderId && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Confirm the quantities received for each item. This will add stock to your inventory and
            start supplier debt for any unpaid balance.
          </p>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Ordered (base)</th>
                  <th className="px-3 py-2 text-left">Unit</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Adds (base)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                const product = products.find((p) => p.id === line.productId);
                const orderedItem = orderedItems.find((item) => item.productId === line.productId);
                const orderedBase = orderedItem?.orderedQty ?? 0;
                const activeUnits = product
                  ? getActiveProductUnits(product.id, productUnits)
                  : [];
                const visibleUnits = activeUnits.length > 0
                  ? activeUnits
                  : product
                    ? [getDefaultProductUnit(product, productUnits)]
                    : [];
                const selectedUnit = visibleUnits.find((u) => u.id === line.unitId)
                  ?? visibleUnits[0];
                const baseQuantity = Math.max(1, selectedUnit?.baseQuantity ?? 1);
                // Cap unit qty so the resulting base total never exceeds the ordered qty —
                // mirrors the RPC's own guard so the user gets feedback before submit.
                const maxUnitQty = Math.floor(orderedBase / baseQuantity);
                const previewBase = line.unitQty * baseQuantity;
                const baseUnitName = product?.unitType || "unit";
                return (
                  <tr key={line.productId} className="border-t">
                    <td className="px-3 py-2">{product?.name ?? line.productId}</td>
                    <td className="px-3 py-2 text-right">
                      {orderedBase} {baseUnitName}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={line.unitId}
                        onChange={(event) => {
                          const nextUnitId = event.target.value;
                          const nextUnit = visibleUnits.find((u) => u.id === nextUnitId);
                          const nextBase = Math.max(1, nextUnit?.baseQuantity ?? 1);
                          setLines((prev) =>
                            prev.map((existing, existingIdx) =>
                              existingIdx === idx
                                ? {
                                    ...existing,
                                    unitId: nextUnitId,
                                    // Recompute unit qty so the base total still
                                    // matches whatever the user was receiving.
                                    unitQty: Math.max(0, Math.floor((existing.unitQty * baseQuantity) / nextBase)),
                                  }
                                : existing
                            )
                          );
                        }}
                      >
                        {visibleUnits.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name}{unit.baseQuantity > 1 ? ` (×${unit.baseQuantity})` : ""}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={maxUnitQty}
                        value={line.unitQty}
                        onChange={(event) => {
                          const next = parseInt(event.target.value, 10) || 0;
                          setLines((prev) =>
                            prev.map((existing, existingIdx) =>
                              existingIdx === idx
                                ? { ...existing, unitQty: Math.min(Math.max(next, 0), maxUnitQty) }
                                : existing
                            )
                          );
                        }}
                        className="min-h-10 w-20 rounded border px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-slate-600">
                      {/* Pre-flight conversion preview — server still recomputes
                          this from product_units.base_quantity at write time. */}
                      {convertToBaseQuantity(line.unitQty, selectedUnit)} {baseUnitName}
                      {previewBase !== orderedBase && (
                        <div className="text-[10px] text-amber-600">of {orderedBase} ordered</div>
                      )}
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || lines.length === 0}>
              {submitting ? "Receiving…" : "Confirm receipt"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
