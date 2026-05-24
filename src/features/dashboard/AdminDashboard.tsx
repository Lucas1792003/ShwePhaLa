import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  calculateLowStock,
  calculateNetRevenue,
  calculatePerShopMetrics,
  calculateProfit,
  calculateProfitMargin,
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
  RANGE_LABELS,
  SectionCard,
} from "./DashboardCommon";

interface AdminDashboardProps {
  currentUser: User;
  shops: Shop[];
}

const shopName = (shops: Shop[], shopId: string | undefined) =>
  shops.find((shop) => shop.id === shopId)?.name ?? "Unknown shop";

const withinRange = (createdAt: string, range: DateRange, now = new Date()) => {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= dateRangeStart(range, now).getTime() && t <= now.getTime();
};

export const AdminDashboard = ({ currentUser, shops }: AdminDashboardProps) => {
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

  const scopeLabel = scope.showAllShops ? "All shops" : shopName(shops, metricShopId ?? undefined);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {scopeLabel} business control for {new Date().toLocaleDateString("en-US")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedShopId}
            onChange={(event) => setSelectedShopId(event.target.value as DashboardSelectedShopId)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Shops</option>
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
          label={`${RANGE_LABELS[range]} Revenue`}
          value={formatMmk(revenue)}
          detail={scopeLabel}
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
        {visibility.canViewProfit && (
          <KpiCard
            label="Profit / Margin"
            value={formatMmk(profit)}
            detail={`${margin.toFixed(1)}% margin`}
            icon={profit >= 0 ? "trending_up" : "trending_down"}
            tone={profit >= 0 ? "violet" : "rose"}
          />
        )}
        {visibility.canViewSupplierDebt && (
          <KpiCard
            label="Supplier Debt"
            value={formatMmk(supplierDebt.debt)}
            detail={`${supplierDebt.openPoCount} received PO(s) unpaid or partial`}
            icon="account_balance_wallet"
            tone={supplierDebt.debt > 0 ? "amber" : "emerald"}
          />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <SectionCard title="Shop Performance" icon="storefront">
          {perShopRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                    <th className="pb-2 pr-3">Shop</th>
                    <th className="pb-2 pr-3 text-right">Revenue</th>
                    <th className="pb-2 pr-3 text-right">Orders</th>
                    <th className="pb-2 pr-3 text-right">AOV</th>
                    {visibility.canViewProfit && <th className="pb-2 pr-3 text-right">Profit</th>}
                    {visibility.canViewProfit && <th className="pb-2 pr-3 text-right">Margin</th>}
                    <th className="pb-2 text-right">Open shifts</th>
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
            <EmptyState message="No shop sales in this range." icon="storefront" />
          )}
        </SectionCard>

        <SectionCard title="Revenue by Shop" icon="bar_chart">
          <div className="h-72">
            {revenueByShopData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByShopData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="shop" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                  <Tooltip
                    formatter={(value) => formatMmk(Number(value))}
                    labelFormatter={(label) => `Shop ${label}`}
                  />
                  <Bar dataKey="revenue" fill="#047857" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No revenue to chart in this range." icon="bar_chart" />
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {visibility.canViewInventory && (
          <SectionCard title={scope.showAllShops ? "Low Stock Across Shops" : "Low Stock"} icon="warning">
            {lowStockRows.length > 0 ? (
              <div className="space-y-2">
                {lowStockRows.map((row) => (
                  <div key={`${row.shopId}-${row.product.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{row.product.name}</p>
                      <p className="truncate text-xs text-slate-500">{row.shopName} - threshold {row.threshold}</p>
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

        {visibility.canViewApprovals && (
          <SectionCard title="Pending Approvals" icon="approval">
            {pendingApprovals.length > 0 ? (
              <div className="space-y-2">
                {pendingApprovals.map((request) => (
                  <div key={request.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-800">{request.type}</span>
                      <Badge tone="amber">{shopName(shops, request.shopId)}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{request.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No pending refund or void approvals." icon="task_alt" />
            )}
          </SectionCard>
        )}

        <SectionCard title="Active Staff / Open Shifts" icon="groups">
          {activeShiftRows.length > 0 ? (
            <div className="space-y-2">
              {activeShiftRows.slice(0, 6).map((row) => (
                <div key={row.shift.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {row.user?.name ?? "Unknown user"}
                    </span>
                    <Badge tone="green">Open</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {row.shop?.name ?? row.shift.shopId} - since {formatDateTime(row.shift.startedAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No open shifts in this scope." icon="groups" />
          )}
        </SectionCard>

        <SectionCard title="Action Queue" icon="priority_high">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-rose-50 p-3">
              <div className="text-xl font-bold text-rose-700">{actionNeeded.outOfStockCount}</div>
              <div className="text-xs text-rose-700">Out of stock</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <div className="text-xl font-bold text-amber-700">{actionNeeded.lowStockCount}</div>
              <div className="text-xs text-amber-700">Low stock</div>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="text-xl font-bold text-blue-700">{pendingReceipts.length}</div>
              <div className="text-xs text-blue-700">PO receipts</div>
            </div>
            <div className="rounded-lg bg-slate-100 p-3">
              <div className="text-xl font-bold text-slate-800">{actionNeeded.pendingTransfers}</div>
              <div className="text-xs text-slate-600">Transfers</div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {visibility.canViewSupplierDebt && (
          <SectionCard title={metricShopId ? "Supplier Debt by Supplier" : "Supplier Debt by Shop"} icon="account_balance_wallet">
            {debtGroups.length > 0 ? (
              <div className="space-y-2">
                {debtGroups.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.openPoCount} open PO(s)</p>
                    </div>
                    <MiniMoney value={row.debt} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No outstanding received supplier debt." icon="task_alt" />
            )}
          </SectionCard>
        )}

        {visibility.canViewAudit && (
          <SectionCard title="Recent Audit Activity" icon="manage_search">
            {auditRows.length > 0 ? (
              <div className="space-y-2">
                {auditRows.map((log) => (
                  <div key={log.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-800">{log.actionType}</span>
                      {log.shopId && <Badge tone="slate">{shopName(shops, log.shopId)}</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{log.message}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(log.createdAt)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No audit activity in this range." icon="manage_search" />
            )}
          </SectionCard>
        )}

        <SectionCard title="Recent Sales" icon="receipt_long" className="xl:col-span-1">
          {recentSales.length > 0 ? (
            <div className="space-y-2">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">#{sale.receiptNo}</p>
                    <p className="truncate text-xs text-slate-500">
                      {shopName(shops, sale.shopId)} - {formatDateTime(sale.createdAt)}
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
      </div>
    </div>
  );
};
