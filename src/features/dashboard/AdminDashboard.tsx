import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "../../components/ui/Badge";
import { formatDateTime, formatMmk } from "../../lib/utils";
import { useDataStore } from "../../stores/dataStore";
import type { Shop, User } from "../../types";
import {
  calculateActionNeeded,
  calculateAvgOrderValue,
  calculateCostOfGoods,
  calculateDailyRevenueCostProfitTrend,
  calculateLowStock,
  calculateNetRevenue,
  calculatePerShopMetrics,
  calculateProfit,
  calculateProfitMargin,
  calculateSalesByCategoryPercent,
  calculateSalesCount,
  calculateSupplierDebt,
  dateRangeStart,
  decorateLowStockWithShopName,
  filterPendingApprovals,
  filterPendingReceipts,
  filterSalesByRange,
  getDashboardVisibility,
  groupSupplierDebtByShop,
  groupSupplierDebtBySupplier,
  listActiveShiftRows,
  recentAuditLogs,
  resolveDashboardScope,
  scopeSales,
  type DashboardSelectedShopId,
  type DateRange,
} from "./dashboardMetrics";
import {
  DateRangeSelector,
  EmptyState,
  KpiCard,
  MiniMoney,
  SectionCard,
} from "./DashboardCommon";
import { rangeLabel, useDashboardCopy } from "./dashboardCopy";

interface AdminDashboardProps {
  currentUser: User;
  shops: Shop[];
}

const shopName = (shops: Shop[], shopId: string | undefined, fallback: string) =>
  shops.find((shop) => shop.id === shopId)?.name ?? fallback;

const CATEGORY_COLORS = ["#047857", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

const withinRange = (createdAt: string, range: DateRange, now = new Date()) => {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= dateRangeStart(range, now).getTime() && t <= now.getTime();
};

export const AdminDashboard = ({ currentUser, shops }: AdminDashboardProps) => {
  const copy = useDashboardCopy();
  const [selectedShopId, setSelectedShopId] = useState<DashboardSelectedShopId>("all");
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
  const users = useDataStore((state) => state.users);
  const auditLogs = useDataStore((state) => state.auditLogs);

  const visibility = useMemo(() => getDashboardVisibility(currentUser), [currentUser]);
  const scope = resolveDashboardScope(currentUser, selectedShopId, "");
  const metricShopId = scope.metricShopId;
  const activeShops = useMemo(() => shops.filter((shop) => shop.isActive), [shops]);
  const visibleShops = useMemo(
    () => (metricShopId ? activeShops.filter((shop) => shop.id === metricShopId) : activeShops),
    [activeShops, metricShopId]
  );

  const scopedSales = useMemo(() => scopeSales(sales, metricShopId), [sales, metricShopId]);
  const rangedSales = useMemo(
    () => filterSalesByRange(scopedSales, range),
    [scopedSales, range]
  );

  const revenue = useMemo(() => calculateNetRevenue(rangedSales, refunds), [rangedSales, refunds]);
  const orders = calculateSalesCount(rangedSales);
  const avgOrder = calculateAvgOrderValue(revenue, orders);
  const cost = useMemo(
    () => calculateCostOfGoods(rangedSales, saleItems, products),
    [rangedSales, saleItems, products]
  );
  const profit = calculateProfit(revenue, cost);
  const margin = calculateProfitMargin(revenue, profit);
  const supplierDebt = useMemo(
    () => calculateSupplierDebt(purchaseOrders, metricShopId),
    [purchaseOrders, metricShopId]
  );

  const perShopRows = useMemo(
    () =>
      calculatePerShopMetrics(
        rangedSales,
        saleItems,
        products,
        visibleShops,
        refunds,
        shifts,
        purchaseOrders
      ).sort((a, b) => b.revenue - a.revenue),
    [rangedSales, saleItems, products, visibleShops, refunds, shifts, purchaseOrders]
  );

  const revenueByShopData = useMemo(
    () =>
      perShopRows.map((row) => ({
        shop: row.shop.code || row.shop.name,
        revenue: row.revenue,
        orders: row.orders,
      })),
    [perShopRows]
  );

  const trendData = useMemo(
    () =>
      visibility.canViewProfit
        ? calculateDailyRevenueCostProfitTrend(
            sales,
            saleItems,
            products,
            refunds,
            metricShopId,
            range
          )
        : [],
    [visibility.canViewProfit, sales, saleItems, products, refunds, metricShopId, range]
  );

  const categoryData = useMemo(
    () => calculateSalesByCategoryPercent(sales, saleItems, products, metricShopId, range),
    [sales, saleItems, products, metricShopId, range]
  );

  const lowStockRows = useMemo(
    () =>
      decorateLowStockWithShopName(calculateLowStock(products, inventory, metricShopId), shops).slice(0, 8),
    [products, inventory, metricShopId, shops]
  );

  const pendingApprovals = useMemo(
    () => filterPendingApprovals(refunds, metricShopId).slice(0, 6),
    [refunds, metricShopId]
  );
  const pendingReceipts = useMemo(
    () => filterPendingReceipts(purchaseOrders, metricShopId).slice(0, 6),
    [purchaseOrders, metricShopId]
  );
  const actionNeeded = useMemo(
    () => calculateActionNeeded(metricShopId, inventory, products, refunds, purchaseOrders, stockTransfers),
    [metricShopId, inventory, products, refunds, purchaseOrders, stockTransfers]
  );
  const activeShiftRows = useMemo(
    () => listActiveShiftRows(shifts, users, shops, metricShopId),
    [shifts, users, shops, metricShopId]
  );
  const debtGroups = useMemo(
    () =>
      metricShopId
        ? groupSupplierDebtBySupplier(purchaseOrders, suppliers, metricShopId).slice(0, 6)
        : groupSupplierDebtByShop(purchaseOrders, shops).slice(0, 6),
    [metricShopId, purchaseOrders, suppliers, shops]
  );
  const recentSales = useMemo(
    () =>
      [...rangedSales]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 6),
    [rangedSales]
  );
  const auditRows = useMemo(
    () =>
      recentAuditLogs(
        auditLogs.filter(
          (log) => (metricShopId === null || log.shopId === metricShopId) && withinRange(log.createdAt, range)
        ),
        6
      ),
    [auditLogs, metricShopId, range]
  );

  const selectedRangeLabel = rangeLabel(copy, range);
  const scopeLabel = scope.showAllShops
    ? copy("allShopsScope")
    : shopName(shops, metricShopId ?? undefined, copy("unknownShop"));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{copy("dashboard")}</h1>
          <p className="text-sm text-slate-500">
            {scopeLabel} {copy("businessControlFor")} {new Date().toLocaleDateString("en-US")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedShopId}
            onChange={(event) => setSelectedShopId(event.target.value as DashboardSelectedShopId)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">{copy("allShops")}</option>
            {activeShops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
          <DateRangeSelector value={range} onChange={setRange} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label={`${selectedRangeLabel} ${copy("revenue")}`}
          value={formatMmk(revenue)}
          detail={scopeLabel}
          icon="payments"
          tone="emerald"
        />
        <KpiCard
          label={`${selectedRangeLabel} ${copy("orders")}`}
          value={orders}
          detail={copy("validSales")}
          icon="receipt_long"
          tone="blue"
        />
        <KpiCard
          label={copy("aov")}
          value={formatMmk(avgOrder)}
          detail={`${selectedRangeLabel} ${copy("average")}`}
          icon="analytics"
          tone="slate"
        />
        {visibility.canViewProfit && (
          <KpiCard
            label={copy("profitMargin")}
            value={formatMmk(profit)}
            detail={`${margin.toFixed(1)}% ${copy("margin")}`}
            icon={profit >= 0 ? "trending_up" : "trending_down"}
            tone={profit >= 0 ? "violet" : "rose"}
          />
        )}
        {visibility.canViewSupplierDebt && (
          <KpiCard
            label={copy("supplierDebt")}
            value={formatMmk(supplierDebt.debt)}
            detail={`${supplierDebt.openPoCount} ${copy("receivedPosUnpaidPartial")}`}
            icon="account_balance_wallet"
            tone={supplierDebt.debt > 0 ? "amber" : "emerald"}
          />
        )}
      </div>

      {visibility.canViewProfit && (
        <SectionCard title={copy("revenueCostProfitTrend")} icon="show_chart">
          <div className="h-72">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                  />
                  <Tooltip formatter={(value, name) => [formatMmk(Number(value)), name]} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name={copy("revenue")}
                    stroke="#047857"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    name={copy("costInvestment")}
                    stroke="#d97706"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name={copy("profit")}
                    stroke="#7c3aed"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={copy("noSalesDataForPeriod")} icon="show_chart" />
            )}
          </div>
        </SectionCard>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <SectionCard title={copy("shopPerformance")} icon="storefront">
          {perShopRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                    <th className="pb-2 pr-3">{copy("shop")}</th>
                    <th className="pb-2 pr-3 text-right">{copy("revenue")}</th>
                    <th className="pb-2 pr-3 text-right">{copy("orders")}</th>
                    <th className="pb-2 pr-3 text-right">{copy("aov")}</th>
                    {visibility.canViewProfit && <th className="pb-2 pr-3 text-right">{copy("profit")}</th>}
                    {visibility.canViewProfit && <th className="pb-2 pr-3 text-right">{copy("margin")}</th>}
                    <th className="pb-2 text-right">{copy("openShifts")}</th>
                  </tr>
                </thead>
                <tbody>
                  {perShopRows.map((row) => (
                    <tr key={row.shop.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-800">{row.shop.name}</div>
                        <div className="text-xs text-slate-500">{row.shop.code}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-sm font-semibold text-emerald-700">
                        {formatMmk(row.revenue)}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-sm text-slate-600">{row.orders}</td>
                      <td className="py-2.5 pr-3 text-right text-sm text-slate-600">
                        {formatMmk(calculateAvgOrderValue(row.revenue, row.orders))}
                      </td>
                      {visibility.canViewProfit && (
                        <td className="py-2.5 pr-3 text-right text-sm font-semibold text-slate-800">
                          {formatMmk(row.profit)}
                        </td>
                      )}
                      {visibility.canViewProfit && (
                        <td className="py-2.5 pr-3 text-right text-sm text-slate-600">
                          {row.margin.toFixed(1)}%
                        </td>
                      )}
                      <td className="py-2.5 text-right text-sm text-slate-600">{row.activeShifts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message={copy("noShopSalesInRange")} icon="storefront" />
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title={copy("revenueByShop")} icon="bar_chart">
            <div className="h-72">
              {revenueByShopData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByShopData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="shop" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                    <Tooltip
                      formatter={(value) => formatMmk(Number(value))}
                      labelFormatter={(label) => `${copy("shop")} ${label}`}
                    />
                    <Bar dataKey="revenue" fill="#047857" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message={copy("noRevenueToChart")} icon="bar_chart" />
              )}
            </div>
          </SectionCard>

          <SectionCard title={copy("salesByCategory")} icon="donut_small">
            <div className="h-64">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={82}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`admin-category-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name, props) => [
                        `${formatMmk(Number(value))} (${Number(props.payload?.percent ?? 0).toFixed(1)}%)`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message={copy("noCategorySalesForPeriod")} icon="donut_small" />
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {visibility.canViewInventory && (
          <SectionCard title={scope.showAllShops ? copy("lowStockAcrossShops") : copy("lowStock")} icon="warning">
            {lowStockRows.length > 0 ? (
              <div className="space-y-2">
                {lowStockRows.map((row) => (
                  <div key={`${row.shopId}-${row.product.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{row.product.name}</p>
                      <p className="truncate text-xs text-slate-500">{row.shopName} - {copy("threshold")} {row.threshold}</p>
                    </div>
                    <Badge tone={row.status === "out" ? "red" : "amber"}>{row.qty} {copy("left")}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message={copy("noLowOrOutStock")} icon="task_alt" />
            )}
          </SectionCard>
        )}

        {visibility.canViewApprovals && (
          <SectionCard title={copy("pendingApprovals")} icon="approval">
            {pendingApprovals.length > 0 ? (
              <div className="space-y-2">
                {pendingApprovals.map((request) => (
                  <div key={request.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-800">
                        {request.type === "VOID" ? copy("voidRequest") : copy("partialRefund")}
                      </span>
                      <Badge tone="amber">{shopName(shops, request.shopId, copy("unknownShop"))}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{request.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message={copy("noPendingRefundVoidApprovals")} icon="task_alt" />
            )}
          </SectionCard>
        )}

        <SectionCard title={copy("activeStaffOpenShifts")} icon="groups">
          {activeShiftRows.length > 0 ? (
            <div className="space-y-2">
              {activeShiftRows.slice(0, 6).map((row) => (
                <div key={row.shift.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {row.user?.name ?? copy("unknownUser")}
                    </span>
                    <Badge tone="green">{copy("open")}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {row.shop?.name ?? row.shift.shopId} - {copy("since")} {formatDateTime(row.shift.startedAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message={copy("noOpenShifts")} icon="groups" />
          )}
        </SectionCard>

        <SectionCard title={copy("actionQueue")} icon="priority_high">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-rose-50 p-3">
              <div className="text-xl font-bold text-rose-700">{actionNeeded.outOfStockCount}</div>
              <div className="text-xs text-rose-700">{copy("outOfStock")}</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <div className="text-xl font-bold text-amber-700">{actionNeeded.lowStockCount}</div>
              <div className="text-xs text-amber-700">{copy("lowStock")}</div>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="text-xl font-bold text-blue-700">{pendingReceipts.length}</div>
              <div className="text-xs text-blue-700">{copy("poReceipts")}</div>
            </div>
            <div className="rounded-lg bg-slate-100 p-3">
              <div className="text-xl font-bold text-slate-800">{actionNeeded.pendingTransfers}</div>
              <div className="text-xs text-slate-600">{copy("transfers")}</div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {visibility.canViewSupplierDebt && (
          <SectionCard title={metricShopId ? copy("supplierDebtBySupplier") : copy("supplierDebtByShop")} icon="account_balance_wallet">
            {debtGroups.length > 0 ? (
              <div className="space-y-2">
                {debtGroups.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.openPoCount} {copy("openPoCount")}</p>
                    </div>
                    <MiniMoney value={row.debt} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message={copy("noOutstandingSupplierDebt")} icon="task_alt" />
            )}
          </SectionCard>
        )}

        {visibility.canViewAudit && (
          <SectionCard title={copy("recentAuditActivity")} icon="manage_search">
            {auditRows.length > 0 ? (
              <div className="space-y-2">
                {auditRows.map((log) => (
                  <div key={log.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-800">{log.actionType}</span>
                      {log.shopId && <Badge tone="slate">{shopName(shops, log.shopId, copy("unknownShop"))}</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{log.message}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(log.createdAt)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message={copy("noAuditActivity")} icon="manage_search" />
            )}
          </SectionCard>
        )}

        <SectionCard title={copy("recentSales")} icon="receipt_long" className="xl:col-span-1">
          {recentSales.length > 0 ? (
            <div className="space-y-2">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">#{sale.receiptNo}</p>
                    <p className="truncate text-xs text-slate-500">
                      {shopName(shops, sale.shopId, copy("unknownShop"))} - {formatDateTime(sale.createdAt)}
                    </p>
                  </div>
                  <MiniMoney value={sale.totalMmk} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message={copy("noSalesInRange")} icon="receipt" />
          )}
        </SectionCard>
      </div>
    </div>
  );
};
