import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";
import { getErrorMessage } from "../../lib/errors";
import { useDataStore } from "../../stores/dataStore";

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
  receivedQty: number;
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

  // Default each line's receivedQty to the ordered qty (cashier-friendly common
  // case) every time the modal is opened or the PO changes.
  useEffect(() => {
    if (!purchaseOrderId) return;
    setLines(orderedItems.map((item) => ({ productId: item.productId, receivedQty: item.orderedQty })));
    setSubmitting(false);
  }, [purchaseOrderId, orderedItems]);

  const handleSubmit = async () => {
    if (!purchaseOrderId || !currentUserId || submitting) return;
    setSubmitting(true);
    try {
      await receivePurchaseOrder({
        purchaseOrderId,
        receiverId: currentUserId,
        receivedItems: lines,
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
    >
      {purchaseOrderId && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Confirm the quantities received for each item. This will add stock to your inventory and
            start supplier debt for any unpaid balance.
          </p>

          <table className="w-full overflow-hidden rounded-lg border text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Ordered</th>
                <th className="px-3 py-2 text-right">Received</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const product = products.find((p) => p.id === line.productId);
                const orderedItem = orderedItems.find((item) => item.productId === line.productId);
                const maxQty = orderedItem?.orderedQty ?? line.receivedQty;
                return (
                  <tr key={line.productId} className="border-t">
                    <td className="px-3 py-2">{product?.name ?? line.productId}</td>
                    <td className="px-3 py-2 text-right">{orderedItem?.orderedQty ?? "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={maxQty}
                        value={line.receivedQty}
                        onChange={(event) => {
                          const qty = parseInt(event.target.value, 10) || 0;
                          setLines((prev) =>
                            prev.map((existing, existingIdx) =>
                              existingIdx === idx
                                ? { ...existing, receivedQty: Math.min(Math.max(qty, 0), maxQty) }
                                : existing
                            )
                          );
                        }}
                        className="w-24 rounded border px-2 py-1 text-right"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end gap-2 pt-2">
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
