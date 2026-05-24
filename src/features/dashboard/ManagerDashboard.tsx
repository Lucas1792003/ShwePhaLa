import { useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Badge } from "../../components/ui/Badge";
import { hasPermission } from "../../lib/permissions";
import { formatDateTime, formatMmk } from "../../lib/utils";
import { useDataStore } from "../../stores/dataStore";
import type { Shop, User } from "../../types";
import {
  calculateActionNeeded,
  calculateAvgOrderValue,
  calculateCashVsOther,
  calculateCategoryRevenue,
  calculateExpectedCashForActiveShifts,
  calculateLowStock,
  calculateNetRevenue,
  calculateSalesCount,
  calculateSupplierDebt,
  calculateTopProducts,
  decorateLowStockWithShopName,
  filterActiveShifts,
  filterPendingApprovals,
  filterPendingReceipts,
  filterPendingTransfers,
  filterSalesByRange,
  getDashboardVisibility,
  scopeSales,
  type DateRange,
} from "./dashboardMetrics";
import {
  DateRangeSelector,
  EmptyState,
  KpiCard,
  MiniMoney,
  RANGE_LABELS,
  SectionCard,
} from "./DashboardCommon";

const COLORS = ["#047857", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

interface ManagerDashboardProps {
  currentUser: User;
  shopId: string;
  shops: Shop[];
}

const findShopName = (shops: Shop[], shopId: string | undefined) =>
  shops.find((shop) => shop.id === shopId)?.name ?? "Shop";

const paymentPercent = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 100) : 0;

export const ManagerDashboard = ({ currentUser, shopId, shops }: ManagerDashboardProps) => {
  const [range, setRange] = useState<DateRange>("today");
  const sales = useDataStore((state) => state.sales);
  const saleItems = useDataStore((state) => state.saleItems);
  const products = useDataStore((state) => state.products);
  const inventory = useDataStore((state) => state.inventory);
  const refunds = useDataStore((state) => state.refundVoidRequests);
  const purchaseOrders = useDataStore((state) => state.purchaseOrders);
  const stockTransfers = useDataStore((state) => state.stockTransfers);
  const shifts = useDataStore((state) => state.shifts);
  const suppliers = useDataStore((state) => state.suppliers);

  const visibility = useMemo(() => getDashboardVisibility(currentUser), [currentUser]);
  const canViewShiftCash =
    visibility.canViewAllShifts || hasPermission(currentUser, "shift:manage_own");
  const shopName = findShopName(shops, shopId);

  const scopedSales = useMemo(() => scopeSales(sales, shopId), [sales, shopId]);
  const rangedSales = useMemo(
    () => filterSalesByRange(scopedSales, range),
    [scopedSales, range]
  );

  const revenue = useMemo(() => calculateNetRevenue(rangedSales, refunds), [rangedSales, refunds]);
  const orders = calculateSalesCount(rangedSales);
  const avgOrder = calculateAvgOrderValue(revenue, orders);
  const activeShifts = useMemo(() => filterActiveShifts(shifts, shopId), [shifts, shopId]);
  const expectedCash = useMemo(
    () => calculateExpectedCashForActiveShifts(shifts, sales, refunds, shopId),
    [shifts, sales, refunds, shopId]
  );
  const actionNeeded = useMemo(
    () => calculateActionNeeded(shopId, inventory, products, refunds, purchaseOrders, stockTransfers),
    [shopId, inventory, products, refunds, purchaseOrders, stockTransfers]
  );

  const visibleActionCount =
    (visibility.canViewInventory ? actionNeeded.lowStockCount + actionNeeded.outOfStockCount : 0) +
    (visibility.canViewApprovals ? actionNeeded.pendingApprovals : 0) +
    (visibility.canViewPurchases ? actionNeeded.pendingReceipts : 0) +
    (visibility.canViewTransfers ? actionNeeded.pendingTransfers : 0);

  const recentSales = useMemo(
    () =>
      [...rangedSales]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 6),
    [rangedSales]
  );

  const topProducts = useMemo(
    () => calculateTopProducts(rangedSales, saleItems, products, 5),
    [rangedSales, saleItems, products]
  );

  const lowStockRows = useMemo(
    () =>
      decorateLowStockWithShopName(calculateLowStock(products, inventory, shopId), shops).slice(0, 5),
    [products, inventory, shopId, shops]
  );

  const pendingApprovals = useMemo(
    () => filterPendingApprovals(refunds, shopId).slice(0, 4),
    [refunds, shopId]
  );
  const pendingReceipts = useMemo(
    () => filterPendingReceipts(purchaseOrders, shopId).slice(0, 4),
    [purchaseOrders, shopId]
  );
  const pendingTransfers = useMemo(
    () => filterPendingTransfers(stockTransfers, shopId).slice(0, 4),
    [stockTransfers, shopId]
  );
  const supplierDebt = useMemo(
    () => calculateSupplierDebt(purchaseOrders, shopId),
    [purchaseOrders, shopId]
  );
  const categoryData = useMemo(
    () => calculateCategoryRevenue(rangedSales, saleItems, products),
    [rangedSales, saleItems, products]
  );
  const paymentSplit = useMemo(() => calculateCashVsOther(rangedSales), [rangedSales]);
  const paymentTotal = paymentSplit.cashRevenue + paymentSplit.otherRevenue;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">{shopName} operations</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={shopId}
            disabled
            className="h-10 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-medium text-slate-600"
          >
            <option value={shopId}>{shopName}</option>
          </select>
          <DateRangeSelector value={range} onChange={setRange} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label={`${RANGE_LABELS[range]} Revenue`}
          value={formatMmk(revenue)}
          detail={shopName}
          icon="payments"
          tone="emerald"
        />
        <KpiCard
          label={`${RANGE_LABELS[range]} Orders`}
          value={orders}
          detail="Valid sales"
          icon="receipt_long"
          tone="blue"
        />
        <KpiCard
          label="Avg Order Value"
          value={formatMmk(avgOrder)}
          detail={`${RANGE_LABELS[range]} average`}
          icon="analytics"
          tone="slate"
        />
        <KpiCard
          label="Active Shift / Cash"
          value={canViewShiftCash ? activeShifts.length : "Locked"}
          detail={canViewShiftCash ? `Expected ${formatMmk(expectedCash)}` : "Shift permission required"}
          icon="point_of_sale"
          tone="amber"
        />
        <KpiCard
          label="Action Needed"
          value={visibleActionCount}
          detail="Current open items"
          icon="priority_high"
          tone={visibleActionCount > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <SectionCard title="Recent Sales" icon="receipt_long">
          {recentSales.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">
                        #{sale.receiptNo}
                      </span>
                      <Badge tone={sale.paymentMethod === "CASH" ? "green" : "blue"}>
                        {sale.paymentMethod}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {formatDateTime(sale.createdAt)}
                    </p>
                  </div>
                  <MiniMoney value={sale.totalMmk} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No sales in this range." icon="receipt" />
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Top Selling Products" icon="leaderboard">
            {topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map((row, index) => (
                  <div key={row.product.id} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{row.product.name}</p>
                        <p className="text-xs text-slate-500">{row.qty} sold</p>
                      </div>
                    </div>
                    <MiniMoney value={row.revenue} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No product sales in this range." icon="inventory_2" />
            )}
          </SectionCard>

          {visibility.canViewSupplierDebt && (
            <SectionCard title="Supplier Debt" icon="account_balance_wallet">
              {supplierDebt.debt > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-2xl font-bold text-rose-700">
                      {formatMmk(supplierDebt.debt)}
                    </div>
                    <p className="text-sm text-slate-500">
                      {supplierDebt.openPoCount} received PO(s) unpaid or partial
                    </p>
                  </div>
                  <Badge tone="red">Needs payment</Badge>
                </div>
              ) : (
                <EmptyState message="No outstanding received supplier debt." icon="task_alt" />
              )}
            </SectionCard>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {visibility.canViewApprovals && (
          <SectionCard title="Pending Refund/Void Approvals" icon="approval">
            {pendingApprovals.length > 0 ? (
              <div className="space-y-2">
                {pendingApprovals.map((request) => (
                  <div key={request.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-800">{request.type}</span>
                      <Badge tone="amber">Requested</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{request.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No pending approvals." icon="task_alt" />
            )}
          </SectionCard>
        )}

        {visibility.canViewInventory && (
          <SectionCard title="Inventory Alerts" icon="warning">
            {lowStockRows.length > 0 ? (
              <div className="space-y-2">
                {lowStockRows.map((row) => (
                  <div key={`${row.shopId}-${row.product.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{row.product.name}</p>
                      <p className="text-xs text-slate-500">Threshold {row.threshold}</p>
                    </div>
                    <Badge tone={row.status === "out" ? "red" : "amber"}>{row.qty} left</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No low or out-of-stock items." icon="task_alt" />
            )}
          </SectionCard>
        )}

        {visibility.canViewPurchases && (
          <SectionCard title="Pending PO Receipts" icon="local_shipping">
            {pendingReceipts.length > 0 ? (
              <div className="space-y-2">
                {pendingReceipts.map((po) => (
                  <div key={po.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-800">{po.orderNo}</span>
                      <MiniMoney value={po.totalMmk} />
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {suppliers.find((supplier) => supplier.id === po.supplierId)?.name ?? "Supplier"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No approved POs waiting for receipt." icon="task_alt" />
            )}
          </SectionCard>
        )}

        {visibility.canViewTransfers && (
          <SectionCard title="Pending Transfers" icon="sync_alt">
            {pendingTransfers.length > 0 ? (
              <div className="space-y-2">
                {pendingTransfers.map((transfer) => (
                  <div key={transfer.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-800">
                        {transfer.transferNo}
                      </span>
                      <Badge tone="blue">Pending</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {findShopName(shops, transfer.fromShopId)} to {findShopName(shops, transfer.toShopId)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No pending transfers for this shop." icon="task_alt" />
            )}
          </SectionCard>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Sales by Category" icon="donut_small">
          <div className="h-56">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={72}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={`category-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatMmk(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No category sales in this range." icon="donut_small" />
            )}
          </div>
        </SectionCard>

        <SectionCard title="Cash vs Other Sales" icon="payments">
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">Cash</span>
                <span className="text-slate-600">
                  {formatMmk(paymentSplit.cashRevenue)} ({paymentSplit.cashCount})
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${paymentPercent(paymentSplit.cashRevenue, paymentTotal)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">Other</span>
                <span className="text-slate-600">
                  {formatMmk(paymentSplit.otherRevenue)} ({paymentSplit.otherCount})
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${paymentPercent(paymentSplit.otherRevenue, paymentTotal)}%` }}
                />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
