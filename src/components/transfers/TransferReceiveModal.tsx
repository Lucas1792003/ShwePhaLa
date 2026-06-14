import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";
import { getErrorMessage } from "../../lib/errors";
import { useDataStore } from "../../stores/dataStore";
import { useTranslation } from "../../hooks/useTranslation";

interface TransferReceiveModalProps {
  // The transfer being received. When null the modal is closed.
  transferId: string | null;
  onClose: () => void;
  currentUserId: string | null | undefined;
  onReceived?: (transferId: string) => void;
}

interface ReceiveLine {
  productId: string;
  approvedQty: number;
  receivedQty: number;
}

export const TransferReceiveModal = ({
  transferId,
  onClose,
  currentUserId,
  onReceived,
}: TransferReceiveModalProps) => {
  const stockTransfers = useDataStore((state) => state.stockTransfers);
  const stockTransferItems = useDataStore((state) => state.stockTransferItems);
  const products = useDataStore((state) => state.products);
  const receiveTransfer = useDataStore((state) => state.receiveTransfer);
  const toast = useToast();
  const { t } = useTranslation();

  const transfer = useMemo(
    () => (transferId ? stockTransfers.find((t) => t.id === transferId) ?? null : null),
    [transferId, stockTransfers],
  );
  const items = useMemo(
    () => (transferId ? stockTransferItems.filter((i) => i.transferId === transferId) : []),
    [transferId, stockTransferItems],
  );

  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Default each line to the approved quantity (full receipt). The destination
  // can lower a line to record a short / damaged shipment; the shortfall stays
  // at the source.
  useEffect(() => {
    if (!transferId) return;
    setLines(
      items.map((item) => {
        const approvedQty = item.approvedQty ?? item.requestedQty;
        return { productId: item.productId, approvedQty, receivedQty: approvedQty };
      }),
    );
    setSubmitting(false);
  }, [transferId, items]);

  const handleSubmit = async () => {
    if (!transferId || !currentUserId || submitting) return;
    setSubmitting(true);
    try {
      await receiveTransfer({
        transferId,
        actorId: currentUserId,
        receivedItems: lines.map((line) => ({
          productId: line.productId,
          receivedQty: line.receivedQty,
        })),
      });
      toast({ title: t("transfers", "receivedToast"), variant: "success" });
      onReceived?.(transferId);
      onClose();
    } catch (error) {
      toast({
        title: t("transfers", "receiveFailed"),
        description: getErrorMessage(error, t("transfers", "receiveFailedDesc")),
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={Boolean(transferId)}
      onClose={() => (submitting ? undefined : onClose())}
      title={t("transfers", "receiveTitle")}
      description={transfer?.transferNo}
      size="lg"
    >
      {transferId && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t("transfers", "receiveHint")}
          </p>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">{t("transfers", "product")}</th>
                  <th className="px-3 py-2 text-right">{t("transfers", "sent")}</th>
                  <th className="px-3 py-2 text-right">{t("transfers", "received")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const product = products.find((p) => p.id === line.productId);
                  const item = items.find((i) => i.productId === line.productId);
                  const baseUnitName = product?.unitType || "unit";
                  const unitHint =
                    item?.unitNameSnapshot && item.selectedUnitQuantity
                      ? `${item.selectedUnitQuantity} ${item.unitNameSnapshot}`
                      : null;
                  return (
                    <tr key={line.productId} className="border-t">
                      <td className="px-3 py-2">
                        {product?.name ?? line.productId}
                        {unitHint && (
                          <div className="text-[11px] text-slate-500">{t("transfers", "sentAs")} {unitHint}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {line.approvedQty} {baseUnitName}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={line.approvedQty}
                          value={line.receivedQty}
                          onChange={(event) => {
                            const next = parseInt(event.target.value, 10) || 0;
                            setLines((prev) =>
                              prev.map((existing, existingIdx) =>
                                existingIdx === idx
                                  ? {
                                      ...existing,
                                      receivedQty: Math.min(Math.max(next, 0), existing.approvedQty),
                                    }
                                  : existing,
                              ),
                            );
                          }}
                          className="min-h-10 w-24 rounded border px-2 py-1 text-right"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              {t("common", "cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || lines.length === 0}>
              {submitting ? t("transfers", "receiving") : t("transfers", "confirmReceipt")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
