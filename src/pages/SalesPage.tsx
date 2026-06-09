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
import { useToast } from "../components/ui/Toast";
import { downloadCsv } from "../lib/csv";
import { getErrorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { formatMmk, getEffectiveShopId } from "../lib/utils";
import { hasPermission } from "../lib/permissions";
import {
  buildDailySalesReportsByShop,
  getLocalDateValue,
  getOpenShiftReportNotice,
} from "../features/sales/dailySalesReport";

export const SalesPage = () => {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [cashier, setCashier] = useState("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState({ start: "", end: "" });
  const [sendingDailyReport, setSendingDailyReport] = useState(false);
  const toast = useToast();

  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const users = useDataStore((state) => state.users);
  const sales = useDataStore((state) => state.sales);
  const saleItems = useDataStore((state) => state.saleItems);
  const products = useDataStore((state) => state.products);
  const shifts = useDataStore((state) => state.shifts);

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  // A cashier without the broad `sale:view` permission only sees their own
  // sales — this matches the sales_sel RLS in migration 015 (defense in depth).
  const canViewShopSales = hasPermission(currentUser, "sale:view");
  const ownSalesOnly = !canViewShopSales;
  const isAdmin = currentUser?.role === "ADMIN";

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const saleItemsBySaleId = useMemo(() => {
    const itemsBySale = new Map<string, typeof saleItems>();
    saleItems.forEach((item) => {
      const existingItems = itemsBySale.get(item.saleId);
      if (existingItems) {
        existingItems.push(item);
      } else {
        itemsBySale.set(item.saleId, [item]);
      }
    });
    return itemsBySale;
  }, [saleItems]);

  const filteredSales = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return sales.filter((sale) => {
      const matchesShop = sale.shopId === shopId;
      const matchesOwner = !ownSalesOnly || sale.cashierId === currentUserId;
      const matchesStatus = status === "all" || sale.status === status;
      const matchesCashier = ownSalesOnly || cashier === "all" || sale.cashierId === cashier;
      const cashierName = usersById.get(sale.cashierId)?.name ?? "";
      const saleLineItems = saleItemsBySaleId.get(sale.id) ?? [];
      const searchableText = [
        sale.receiptNo,
        cashierName,
        sale.paymentMethod,
        sale.status,
        sale.totalMmk.toString(),
        sale.totalMmk.toLocaleString("en-US"),
        formatMmk(sale.totalMmk),
        ...saleLineItems.flatMap((item) => {
          const product = productsById.get(item.productId);
          return [
            product?.name,
            product?.shortName,
            product?.sku,
            product?.aliasCode,
            item.unitLabel,
            item.unitNameSnapshot,
            item.unitPriceMmk.toString(),
            item.unitPriceMmk.toLocaleString("en-US"),
            item.lineTotalMmk.toString(),
            item.lineTotalMmk.toLocaleString("en-US"),
          ];
        }),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
      const saleDate = sale.createdAt.slice(0, 10);
      const afterStart = !range.start || saleDate >= range.start;
      const beforeEnd = !range.end || saleDate <= range.end;
      return matchesShop && matchesOwner && matchesStatus && matchesCashier && matchesSearch && afterStart && beforeEnd;
    }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.receiptNo.localeCompare(a.receiptNo));
  }, [
    sales,
    shopId,
    ownSalesOnly,
    currentUserId,
    status,
    cashier,
    search,
    range,
    usersById,
    saleItemsBySaleId,
    productsById,
  ]);

  const exportSales = () => {
    const rows = filteredSales.map((sale) => ({
      receiptNo: sale.receiptNo,
      createdAt: sale.createdAt,
      cashier: usersById.get(sale.cashierId)?.name ?? "",
      paymentMethod: sale.paymentMethod,
      totalMmk: sale.totalMmk,
      status: sale.status,
    }));
    downloadCsv("sales.csv", rows);
  };

  const emailDailySalesReport = async () => {
    if (!currentUser || currentUser.role !== "ADMIN") {
      toast({
        title: "Admin only",
        description: "Only an admin account can email the all-branch daily sales report.",
        variant: "error",
      });
      return;
    }

    const adminEmail = currentUser.email?.trim();
    if (!adminEmail) {
      toast({
        title: "Admin email missing",
        description: "Add an email address to the admin account before sending reports.",
        variant: "error",
      });
      return;
    }

    // Open shifts no longer block the send — the admin asked to be
    // notified inside the email instead. Pass the structured notice
    // through to the edge function, which renders it as a banner in
    // the email body so the data-may-be-incomplete warning still lands
    // in front of the admin without aborting the send.
    const openShiftNotice = getOpenShiftReportNotice(shifts, users, shops);

    // Per-shop bundles — one CSV attachment per shop with sales on the
    // report date. Empty shops are skipped so the admin doesn't get a
    // wall of zero-row files.
    const bundle = buildDailySalesReportsByShop({
      reportDate: getLocalDateValue(),
      sales,
      saleItems,
      products,
      users,
      shops,
    });

    setSendingDailyReport(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        sent?: boolean;
        recipient?: string;
        error?: string;
      }>("email-sales-report", {
        body: {
          subject: bundle.subject,
          reportDateLabel: bundle.reportDateLabel,
          totalSaleCount: bundle.totalSaleCount,
          totalRowCount: bundle.totalRowCount,
          attachments: bundle.shopReports.map((report) => ({
            filename: report.filename,
            csv: report.csv,
          })),
          shopSummaries: bundle.shopReports.map((report) => ({
            shopName: report.shopName,
            shopCode: report.shopCode,
            filename: report.filename,
            saleCount: report.saleCount,
            rowCount: report.rowCount,
          })),
          openShiftNotice,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const shopCount = bundle.shopReports.length;
      toast({
        title: openShiftNotice
          ? "Daily sales report emailed (partial)"
          : "Daily sales report emailed",
        description: openShiftNotice
          ? `Sent ${bundle.totalSaleCount} sales across ${shopCount} shop${shopCount === 1 ? "" : "s"} to ${data?.recipient ?? adminEmail}. ${openShiftNotice.openShiftCount} shift${openShiftNotice.openShiftCount === 1 ? "" : "s"} still open — flagged in the email.`
          : `Sent ${bundle.totalSaleCount} sales across ${shopCount} shop${shopCount === 1 ? "" : "s"} to ${data?.recipient ?? adminEmail}.`,
        variant: "success",
      });
    } catch (error) {
      console.error("[SalesPage] email daily sales report failed", error);
      toast({
        title: "Email report failed",
        description: getErrorMessage(error, "Could not email the daily sales report. Check the email function configuration."),
        variant: "error",
      });
    } finally {
      setSendingDailyReport(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        subtitle="Track sales, voids, refunds, and reprints."
        actions={
          <>
            <Button variant="secondary" onClick={exportSales}>Export CSV</Button>
            {isAdmin && (
              <Button onClick={emailDailySalesReport} disabled={sendingDailyReport}>
                {sendingDailyReport ? "Sending..." : "Email today's CSV"}
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search receipt, product, cashier, amount" className="min-w-64 flex-1 md:w-72 md:flex-none" />
          <DateRangePicker start={range.start} end={range.end} onChange={setRange} />
          <Select value={status} onChange={(event) => setStatus(event.target.value)} className="min-w-44 flex-1 md:w-auto md:flex-none">
            <option value="all">All statuses</option>
            <option value="NORMAL">Normal</option>
            <option value="VOID">Void</option>
            <option value="REFUNDED">Refunded</option>
          </Select>
          {!ownSalesOnly && (
            <Select value={cashier} onChange={(event) => setCashier(event.target.value)} className="min-w-48 flex-1 md:w-auto md:flex-none">
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
