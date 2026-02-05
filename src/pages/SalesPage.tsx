import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { SearchInput } from "../components/forms/SearchInput";
import { DateRangePicker } from "../components/forms/DateRangePicker";
import { SalesTable } from "../components/sales/SalesTable";
import { SaleDetailDrawer } from "../components/sales/SaleDetailDrawer";
import { RefundModal } from "../components/sales/RefundModal";
import { VoidModal } from "../components/sales/VoidModal";
import { ReprintButton } from "../components/sales/ReprintButton";
import { Button } from "../components/ui/Button";
import { buildRefundItems } from "../features/sales/service";
import { downloadCsv } from "../lib/csv";
import { getEffectiveShopId } from "../lib/utils";

export const SalesPage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");
  const [cashier, setCashier] = useState("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState({ start: "", end: "" });
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundSelection, setRefundSelection] = useState<Record<string, number>>({});

  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const users = useDataStore((state) => state.users);
  const products = useDataStore((state) => state.products);
  const sales = useDataStore((state) => state.sales);
  const saleItems = useDataStore((state) => state.saleItems);
  const refunds = useDataStore((state) => state.refunds);
  const reprintLogs = useDataStore((state) => state.reprintLogs);
  const voidSale = useDataStore((state) => state.voidSale);
  const requestRefund = useDataStore((state) => state.requestRefund);
  const approveRefund = useDataStore((state) => state.approveRefund);
  const addReprintLog = useDataStore((state) => state.addReprintLog);

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const matchesShop = sale.shopId === shopId;
      const matchesStatus = status === "all" || sale.status === status;
      const matchesCashier = cashier === "all" || sale.cashierId === cashier;
      const matchesSearch = sale.receiptNo.toLowerCase().includes(search.toLowerCase());
      const saleDate = sale.createdAt.slice(0, 10);
      const afterStart = !range.start || saleDate >= range.start;
      const beforeEnd = !range.end || saleDate <= range.end;
      return matchesShop && matchesStatus && matchesCashier && matchesSearch && afterStart && beforeEnd;
    });
  }, [sales, shopId, status, cashier, search, range]);

  const exportSales = () => {
    const rows = filteredSales.map((sale) => ({
      receiptNo: sale.receiptNo,
      createdAt: sale.createdAt,
      cashier: users.find((user) => user.id === sale.cashierId)?.name ?? "",
      totalMmk: sale.totalMmk,
      status: sale.status,
    }));
    downloadCsv("sales.csv", rows);
  };

  const selectedSale = sales.find((sale) => sale.id === selectedSaleId) ?? null;
  const selectedItems = saleItems.filter((item) => item.saleId === selectedSaleId);
  const selectedRefunds = refunds.filter((refund) => refund.saleId === selectedSaleId);
  const selectedReprints = reprintLogs.filter((log) => log.saleId === selectedSaleId);
  const productNames = useMemo(() => Object.fromEntries(products.map((product) => [product.id, product.name])), [products]);

  useEffect(() => {
    setRefundSelection({});
    setRefundReason("");
    setVoidReason("");
  }, [selectedSaleId]);

  const handleVoid = () => {
    if (!selectedSale || !currentUserId) return;
    voidSale({ saleId: selectedSale.id, reason: voidReason || "No reason", actorId: currentUserId });
    setVoidOpen(false);
  };

  const handleRefund = () => {
    if (!selectedSale || !currentUserId) return;
    const items = buildRefundItems(selectedItems, refundSelection);
    if (items.length === 0) return;
    requestRefund({ saleId: selectedSale.id, items, reason: refundReason || "No reason", actorId: currentUserId });
    setRefundOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        subtitle="Track sales, voids, refunds, and reprints."
        actions={<Button variant="secondary" onClick={exportSales}>Export CSV</Button>}
      />

      <Card>
        <div className="flex flex-wrap gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search receipt" />
          <DateRangePicker start={range.start} end={range.end} onChange={setRange} />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="NORMAL">Normal</option>
            <option value="VOID">Void</option>
            <option value="REFUNDED">Refunded</option>
          </Select>
          <Select value={cashier} onChange={(event) => setCashier(event.target.value)}>
            <option value="all">All cashiers</option>
            {users.filter((user) => user.role === "CASHIER").map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </Select>
        </div>
        <div className="mt-6">
          {filteredSales.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
              No sales found.
            </div>
          ) : (
            <SalesTable sales={filteredSales} users={users} onSelect={setSelectedSaleId} />
          )}
        </div>
      </Card>

      <SaleDetailDrawer
        open={!!selectedSale}
        sale={selectedSale}
        items={selectedItems}
        refunds={selectedRefunds}
        reprintCount={selectedReprints.length}
        productNames={productNames}
        onClose={() => setSelectedSaleId(null)}
        actions={
          <>
            <ReprintButton
              onReprint={() => {
                if (!selectedSale || !currentUserId) return;
                addReprintLog({ saleId: selectedSale.id, actorId: currentUserId });
                navigate(`/app/sales/${selectedSale.id}`);
              }}
            />
            <Button variant="danger" onClick={() => setVoidOpen(true)} disabled={selectedSale?.status !== "NORMAL"}>
              Void sale
            </Button>
            <Button variant="secondary" onClick={() => setRefundOpen(true)}>
              Request refund
            </Button>
            {currentUser && (currentUser.role === "ADMIN" || currentUser.role === "MANAGER") &&
              selectedRefunds
                .filter((refund) => refund.status === "REQUESTED")
                .map((refund) => (
                  <Button key={refund.id} onClick={() => currentUserId && approveRefund({ refundId: refund.id, approverId: currentUserId })}>
                    Approve {refund.type}
                  </Button>
                ))}
          </>
        }
      />

      <VoidModal
        open={voidOpen}
        reason={voidReason}
        onChangeReason={setVoidReason}
        onClose={() => setVoidOpen(false)}
        onConfirm={handleVoid}
      />

      <RefundModal
        open={refundOpen}
        items={selectedItems}
        selection={refundSelection}
        reason={refundReason}
        productNames={productNames}
        onChangeSelection={(productId, qty) => setRefundSelection((prev) => ({ ...prev, [productId]: qty }))}
        onChangeReason={setRefundReason}
        onClose={() => setRefundOpen(false)}
        onSubmit={handleRefund}
      />
    </div>
  );
};
