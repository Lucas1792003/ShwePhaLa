import { useMemo, useState } from "react";
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
import { Button } from "../components/ui/Button";
import { downloadCsv } from "../lib/csv";
import { getEffectiveShopId } from "../lib/utils";
import { hasPermission } from "../lib/permissions";

export const SalesPage = () => {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [cashier, setCashier] = useState("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState({ start: "", end: "" });

  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const users = useDataStore((state) => state.users);
  const sales = useDataStore((state) => state.sales);

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  // A cashier without the broad `sale:view` permission only sees their own
  // sales — this matches the sales_sel RLS in migration 015 (defense in depth).
  const canViewShopSales = hasPermission(currentUser, "sale:view");
  const ownSalesOnly = !canViewShopSales;

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const matchesShop = sale.shopId === shopId;
      const matchesOwner = !ownSalesOnly || sale.cashierId === currentUserId;
      const matchesStatus = status === "all" || sale.status === status;
      const matchesCashier = ownSalesOnly || cashier === "all" || sale.cashierId === cashier;
      const matchesSearch = sale.receiptNo.toLowerCase().includes(search.toLowerCase());
      const saleDate = sale.createdAt.slice(0, 10);
      const afterStart = !range.start || saleDate >= range.start;
      const beforeEnd = !range.end || saleDate <= range.end;
      return matchesShop && matchesOwner && matchesStatus && matchesCashier && matchesSearch && afterStart && beforeEnd;
    });
  }, [sales, shopId, ownSalesOnly, currentUserId, status, cashier, search, range]);

  const exportSales = () => {
    const rows = filteredSales.map((sale) => ({
      receiptNo: sale.receiptNo,
      createdAt: sale.createdAt,
      cashier: users.find((user) => user.id === sale.cashierId)?.name ?? "",
      paymentMethod: sale.paymentMethod,
      totalMmk: sale.totalMmk,
      status: sale.status,
    }));
    downloadCsv("sales.csv", rows);
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
          {!ownSalesOnly && (
            <Select value={cashier} onChange={(event) => setCashier(event.target.value)}>
              <option value="all">All cashiers</option>
              {users.filter((user) => user.role === "CASHIER").map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </Select>
          )}
        </div>
        <div className="mt-6">
          {filteredSales.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
              No sales found.
            </div>
          ) : (
            <SalesTable
              sales={filteredSales}
              users={users}
              onView={(saleId) => setSelectedSaleId(saleId)}
            />
          )}
        </div>
      </Card>

      <SaleDetailDrawer
        open={!!selectedSaleId}
        saleId={selectedSaleId}
        onClose={() => setSelectedSaleId(null)}
      />
    </div>
  );
};
