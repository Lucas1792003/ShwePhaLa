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
import { buildRefundItems } from "../features/sales/service";
import { formatDateTime, formatMmk } from "../lib/utils";

export const ReceiptPage = () => {
  const { saleId } = useParams();
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const sale = useDataStore((state) => state.sales.find((item) => item.id === saleId));
  const saleItems = useDataStore((state) => state.saleItems.filter((item) => item.saleId === saleId));
  const products = useDataStore((state) => state.products);
  const shops = useDataStore((state) => state.shops);
  const users = useDataStore((state) => state.users);
  const reprintLogs = useDataStore((state) => state.reprintLogs.filter((item) => item.saleId === saleId));
  const addReprintLog = useDataStore((state) => state.addReprintLog);
  const requestVoid = useDataStore((state) => state.requestVoid);
  const requestRefund = useDataStore((state) => state.requestRefund);

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundSelection, setRefundSelection] = useState<Record<string, number>>({});

  if (!sale) return <div className="p-8 text-slate-500">Receipt not found.</div>;
  const shop = shops.find((item) => item.id === sale.shopId);
  if (!shop) return <div className="p-8 text-slate-500">Shop data not found.</div>;
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

  const handleRequestVoid = () => {
    if (!currentUserId) return;
    requestVoid({ saleId: sale.id, reason: voidReason || "No reason", actorId: currentUserId });
    setVoidOpen(false);
  };

  const handleRequestRefund = () => {
    if (!currentUserId) return;
    const items = buildRefundItems(saleItems, refundSelection);
    if (items.length === 0) return;
    requestRefund({ saleId: sale.id, items, reason: refundReason || "No reason", actorId: currentUserId });
    setRefundOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Receipt Preview" subtitle="Ready for 80mm print layout." actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
          <Button
            onClick={() => {
              if (currentUserId) addReprintLog({ saleId: sale.id, actorId: currentUserId });
              window.print();
            }}
          >
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
        onConfirm={handleRequestVoid}
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
        onSubmit={handleRequestRefund}
      />
    </div>
  );
};
