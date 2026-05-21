import { useParams } from "react-router-dom";
import { useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ReceiptPreview } from "../components/pos/ReceiptPreview";
import { RefundModal } from "../components/sales/RefundModal";
import { VoidModal } from "../components/sales/VoidModal";
import { useToast } from "../components/ui/Toast";
import { buildRefundItems } from "../features/sales/service";
import { formatDateTime, formatMmk } from "../lib/utils";

export const ReceiptPage = () => {
  const { saleId } = useParams();
  const toast = useToast();
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const sale = useDataStore((state) => state.sales.find((item) => item.id === saleId));
  const allSaleItems = useDataStore((state) => state.saleItems);
  const products = useDataStore((state) => state.products);
  const shops = useDataStore((state) => state.shops);
  const users = useDataStore((state) => state.users);
  const allReprintLogs = useDataStore((state) => state.reprintLogs);
  const addReprintLog = useDataStore((state) => state.addReprintLog);
  const requestVoid = useDataStore((state) => state.requestVoid);
  const requestRefund = useDataStore((state) => state.requestRefund);

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundSelection, setRefundSelection] = useState<Record<string, number>>({});

  // Filter in the render body — never inside a Zustand selector (a selector
  // that returns a fresh array on every call causes an infinite render loop).
  const saleItems = allSaleItems.filter((item) => item.saleId === saleId);
  const reprintLogs = allReprintLogs.filter((item) => item.saleId === saleId);

  if (!sale) return <div className="p-8 text-center text-slate-500">Receipt not found.</div>;
  const shop = shops.find((item) => item.id === sale.shopId) ?? {
    id: sale.shopId, code: "SHOP", name: "Store", address: "",
    isActive: true, createdAt: sale.createdAt,
  };
  const cashier = users.find((item) => item.id === sale.cashierId);

  const lines = saleItems.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return {
      name: product?.name ?? item.productId,
      qtyLabel: `${item.qtyUnits} x ${formatMmk(item.unitPriceMmk)}`,
      total: formatMmk(item.lineTotalMmk),
    };
  });
  const productNames = Object.fromEntries(products.map((product) => [product.id, product.name]));

  const handleRequestVoid = async () => {
    if (!currentUserId) return;
    try {
      await requestVoid({ saleId: sale.id, reason: voidReason || "No reason", actorId: currentUserId });
      setVoidOpen(false);
      toast({ title: "Void request submitted", variant: "success" });
    } catch (error) {
      toast({
        title: "Void request failed",
        description: error instanceof Error ? error.message : "Could not submit the void request.",
        variant: "error",
      });
    }
  };

  const handleRequestRefund = async () => {
    if (!currentUserId) return;
    const items = buildRefundItems(saleItems, refundSelection);
    if (items.length === 0) return;
    try {
      await requestRefund({ saleId: sale.id, items, reason: refundReason || "No reason", actorId: currentUserId });
      setRefundOpen(false);
      toast({ title: "Refund request submitted", variant: "success" });
    } catch (error) {
      toast({
        title: "Refund request failed",
        description: error instanceof Error ? error.message : "Could not submit the refund request.",
        variant: "error",
      });
    }
  };

  const handleReprint = async () => {
    try {
      if (currentUserId) await addReprintLog({ saleId: sale.id, actorId: currentUserId });
      window.print();
    } catch (error) {
      toast({
        title: "Reprint log failed",
        description: error instanceof Error ? error.message : "Could not record the reprint.",
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Receipt Preview" subtitle="Ready for 80mm print layout." actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
          <Button onClick={() => void handleReprint()}>
            Reprint
          </Button>
        </div>
      } />

      <ReceiptPreview sale={sale} lines={lines} shop={shop} cashier={cashier} statusNote={sale.status !== "NORMAL" ? sale.status : undefined} />

      <Card>
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">Reprint log</div>
          <div className="text-xs text-slate-400">{reprintLogs.length} total</div>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {reprintLogs.length === 0 && <div className="text-slate-400">No reprints yet.</div>}
          {reprintLogs.map((log) => (
            <div key={log.id} className="flex items-center justify-between">
              <span>{users.find((user) => user.id === log.printedBy)?.name ?? log.printedBy}</span>
              <span className="text-xs text-slate-400">{formatDateTime(log.printedAt)}</span>
            </div>
          ))}
        </div>
      </Card>

      {currentUser?.role === "CASHIER" && (
        <Card>
          <div className="text-sm font-semibold">Request actions</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => setVoidOpen(true)}>Request void</Button>
            <Button variant="secondary" onClick={() => setRefundOpen(true)}>Request refund</Button>
          </div>
        </Card>
      )}

      <VoidModal
        open={voidOpen}
        reason={voidReason}
        onChangeReason={setVoidReason}
        onClose={() => setVoidOpen(false)}
        onConfirm={() => void handleRequestVoid()}
      />

      <RefundModal
        open={refundOpen}
        items={saleItems}
        selection={refundSelection}
        reason={refundReason}
        productNames={productNames}
        onChangeSelection={(productId, qty) => setRefundSelection((prev) => ({ ...prev, [productId]: qty }))}
        onChangeReason={setRefundReason}
        onClose={() => setRefundOpen(false)}
        onSubmit={() => void handleRequestRefund()}
      />
    </div>
  );
};
