import { useMemo, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Tabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Select";
import { DateRangePicker } from "../components/forms/DateRangePicker";
import { Button } from "../components/ui/Button";
import { downloadCsv } from "../lib/csv";
import { getEffectiveShopId } from "../lib/utils";

export const ProfitReportsPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((u) => u.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const products = useDataStore((state) => state.products);
  const sales = useDataStore((state) => state.sales);
  const saleItems = useDataStore((state) => state.saleItems);
  const inventory = useDataStore((state) => state.inventory);
  const transfers = useDataStore((state) => state.stockTransfers);
  const transferItems = useDataStore((state) => state.stockTransferItems);
  const purchaseOrders = useDataStore((state) => state.purchaseOrders);
  const purchaseOrderItems = useDataStore((state) => state.purchaseOrderItems);

  const [activeTab, setActiveTab] = useState("profit");
  const [range, setRange] = useState({ start: "", end: "" });
  const [shopFilter, setShopFilter] = useState("all");

  const _shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  void _shopId; // Used for context, but effectiveShopId is user-controllable
  const isAdmin = currentUser?.role === "ADMIN";
  const effectiveShopId = shopFilter === "all" ? null : shopFilter;

  // Calculate profit by shop
  const profitByShop = useMemo(() => {
    const result: { shopId: string; shopName: string; revenue: number; cost: number; profit: number; margin: number }[] = [];

    shops.forEach((shop) => {
      if (effectiveShopId && shop.id !== effectiveShopId) return;

      const shopSales = sales.filter((s) => {
        if (s.shopId !== shop.id) return false;
        if (s.status === "VOID") return false;
        const saleDate = s.createdAt.slice(0, 10);
        if (range.start && saleDate < range.start) return false;
        if (range.end && saleDate > range.end) return false;
        return true;
      });

      const revenue = shopSales.reduce((sum, s) => sum + s.totalMmk, 0);
      let cost = 0;

      shopSales.forEach((sale) => {
        const items = saleItems.filter((i) => i.saleId === sale.id);
        items.forEach((item) => {
          const product = products.find((p) => p.id === item.productId);
          cost += (product?.costMmk ?? 0) * item.qtyUnits;
        });
      });

      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      result.push({
        shopId: shop.id,
        shopName: shop.name,
        revenue,
        cost,
        profit,
        margin,
      });
    });

    return result;
  }, [shops, sales, saleItems, products, range, effectiveShopId]);

  // Calculate stock valuation
  const stockValuation = useMemo(() => {
    const result: { productId: string; productName: string; totalQty: number; retailValue: number; costValue: number }[] = [];

    products.forEach((product) => {
      let totalQty = 0;
      shops.forEach((shop) => {
        if (effectiveShopId && shop.id !== effectiveShopId) return;
        const inv = inventory.find((i) => i.shopId === shop.id && i.productId === product.id);
        totalQty += inv?.qtyBaseUnits ?? 0;
      });

      if (totalQty > 0) {
        result.push({
          productId: product.id,
          productName: product.name,
          totalQty,
          retailValue: totalQty * product.priceMmk,
          costValue: totalQty * (product.costMmk ?? 0),
        });
      }
    });

    return result.sort((a, b) => b.retailValue - a.retailValue);
  }, [products, inventory, shops, effectiveShopId]);

  // Calculate transfer summary (borrowed vs lent)
  const transferSummary = useMemo(() => {
    const completedTransfers = transfers.filter((t) => {
      if (t.status !== "COMPLETED") return false;
      if (t.completedAt) {
        const date = t.completedAt.slice(0, 10);
        if (range.start && date < range.start) return false;
        if (range.end && date > range.end) return false;
      }
      return true;
    });

    const summary: { shopId: string; shopName: string; lent: number; borrowed: number; net: number }[] = [];

    shops.forEach((shop) => {
      let lent = 0;
      let borrowed = 0;

      completedTransfers.forEach((transfer) => {
        const items = transferItems.filter((i) => i.transferId === transfer.id);
        const totalQty = items.reduce((sum, i) => sum + (i.transferredQty ?? i.requestedQty), 0);

        if (transfer.fromShopId === shop.id) {
          lent += totalQty;
        }
        if (transfer.toShopId === shop.id) {
          borrowed += totalQty;
        }
      });

      summary.push({
        shopId: shop.id,
        shopName: shop.name,
        lent,
        borrowed,
        net: borrowed - lent,
      });
    });

    return summary;
  }, [shops, transfers, transferItems, range]);

  // Calculate purchase summary
  const purchaseSummary = useMemo(() => {
    const receivedPOs = purchaseOrders.filter((po) => {
      if (po.status !== "RECEIVED") return false;
      if (effectiveShopId && po.shopId !== effectiveShopId) return false;
      if (po.receivedAt) {
        const date = po.receivedAt.slice(0, 10);
        if (range.start && date < range.start) return false;
        if (range.end && date > range.end) return false;
      }
      return true;
    });

    const totalPurchases = receivedPOs.reduce((sum, po) => sum + po.totalMmk, 0);
    const totalItems = receivedPOs.reduce((sum, po) => {
      const items = purchaseOrderItems.filter((i) => i.purchaseOrderId === po.id);
      return sum + items.reduce((itemSum, i) => itemSum + (i.receivedQty ?? i.orderedQty), 0);
    }, 0);

    return {
      orderCount: receivedPOs.length,
      totalPurchases,
      totalItems,
    };
  }, [purchaseOrders, purchaseOrderItems, range, effectiveShopId]);

  // Total calculations
  const totals = useMemo(() => {
    const totalRevenue = profitByShop.reduce((sum, s) => sum + s.revenue, 0);
    const totalCost = profitByShop.reduce((sum, s) => sum + s.cost, 0);
    const totalProfit = profitByShop.reduce((sum, s) => sum + s.profit, 0);
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const totalRetailValue = stockValuation.reduce((sum, s) => sum + s.retailValue, 0);
    const totalCostValue = stockValuation.reduce((sum, s) => sum + s.costValue, 0);

    return { totalRevenue, totalCost, totalProfit, avgMargin, totalRetailValue, totalCostValue };
  }, [profitByShop, stockValuation]);

  const exportProfitReport = () => {
    downloadCsv("profit_report.csv", profitByShop.map((s) => ({
      shop: s.shopName,
      revenue: s.revenue,
      cost: s.cost,
      profit: s.profit,
      margin: `${s.margin.toFixed(1)}%`,
    })));
  };

  const exportStockValuation = () => {
    downloadCsv("stock_valuation.csv", stockValuation.map((s) => ({
      product: s.productName,
      quantity: s.totalQty,
      retail_value: s.retailValue,
      cost_value: s.costValue,
    })));
  };

  return (
    <Card>
      <PageHeader
        title="Profit & Analytics"
        subtitle="Track profitability, stock valuation, and transfer history"
      />

      <div className="mt-6">
        <Tabs
          tabs={[
            { id: "profit", label: "Profit by Shop" },
            { id: "valuation", label: "Stock Valuation" },
            { id: "transfers", label: "Transfer Summary" },
            { id: "purchases", label: "Purchase Summary" },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <DateRangePicker start={range.start} end={range.end} onChange={setRange} />
        {isAdmin && (
          <Select value={shopFilter} onChange={(e) => setShopFilter(e.target.value)}>
            <option value="all">All Shops</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>{shop.name}</option>
            ))}
          </Select>
        )}
      </div>

      {/* Profit by Shop */}
      {activeTab === "profit" && (
        <div className="mt-5 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-500">Total Revenue</div>
              <div className="text-xl font-bold text-slate-900">MMK {totals.totalRevenue.toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-500">Total Cost</div>
              <div className="text-xl font-bold text-slate-900">MMK {totals.totalCost.toLocaleString()}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-green-600">Total Profit</div>
              <div className="text-xl font-bold text-green-700">MMK {totals.totalProfit.toLocaleString()}</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-blue-600">Avg Margin</div>
              <div className="text-xl font-bold text-blue-700">{totals.avgMargin.toFixed(1)}%</div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={exportProfitReport}>Export CSV</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="pb-3 font-medium">Shop</th>
                  <th className="pb-3 font-medium text-right">Revenue</th>
                  <th className="pb-3 font-medium text-right">Cost</th>
                  <th className="pb-3 font-medium text-right">Profit</th>
                  <th className="pb-3 font-medium text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {profitByShop.map((row) => (
                  <tr key={row.shopId} className="border-b last:border-0">
                    <td className="py-3 font-medium">{row.shopName}</td>
                    <td className="py-3 text-right">MMK {row.revenue.toLocaleString()}</td>
                    <td className="py-3 text-right">MMK {row.cost.toLocaleString()}</td>
                    <td className={`py-3 text-right font-medium ${row.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      MMK {row.profit.toLocaleString()}
                    </td>
                    <td className="py-3 text-right">{row.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Valuation */}
      {activeTab === "valuation" && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-500">Total Retail Value</div>
              <div className="text-xl font-bold text-slate-900">MMK {totals.totalRetailValue.toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-500">Total Cost Value</div>
              <div className="text-xl font-bold text-slate-900">MMK {totals.totalCostValue.toLocaleString()}</div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={exportStockValuation}>Export CSV</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="pb-3 font-medium">Product</th>
                  <th className="pb-3 font-medium text-right">Total Qty</th>
                  <th className="pb-3 font-medium text-right">Retail Value</th>
                  <th className="pb-3 font-medium text-right">Cost Value</th>
                  <th className="pb-3 font-medium text-right">Potential Profit</th>
                </tr>
              </thead>
              <tbody>
                {stockValuation.slice(0, 20).map((row) => (
                  <tr key={row.productId} className="border-b last:border-0">
                    <td className="py-3">{row.productName}</td>
                    <td className="py-3 text-right">{row.totalQty}</td>
                    <td className="py-3 text-right">MMK {row.retailValue.toLocaleString()}</td>
                    <td className="py-3 text-right">MMK {row.costValue.toLocaleString()}</td>
                    <td className="py-3 text-right text-green-600">
                      MMK {(row.retailValue - row.costValue).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stockValuation.length > 20 && (
              <p className="text-sm text-slate-500 mt-2">Showing top 20 products by value. Export CSV for full list.</p>
            )}
          </div>
        </div>
      )}

      {/* Transfer Summary */}
      {activeTab === "transfers" && (
        <div className="mt-5 space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">Transfer Balance Explanation</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>- <strong>Lent:</strong> Items this shop sent to other shops</li>
              <li>- <strong>Borrowed:</strong> Items this shop received from other shops</li>
              <li>- <strong>Net:</strong> Borrowed - Lent (positive = net receiver, negative = net lender)</li>
            </ul>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="pb-3 font-medium">Shop</th>
                  <th className="pb-3 font-medium text-right">Items Lent</th>
                  <th className="pb-3 font-medium text-right">Items Borrowed</th>
                  <th className="pb-3 font-medium text-right">Net Balance</th>
                </tr>
              </thead>
              <tbody>
                {transferSummary.map((row) => (
                  <tr key={row.shopId} className="border-b last:border-0">
                    <td className="py-3 font-medium">{row.shopName}</td>
                    <td className="py-3 text-right text-red-600">-{row.lent}</td>
                    <td className="py-3 text-right text-green-600">+{row.borrowed}</td>
                    <td className={`py-3 text-right font-medium ${row.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {row.net >= 0 ? "+" : ""}{row.net}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Purchase Summary */}
      {activeTab === "purchases" && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-500">Purchase Orders</div>
              <div className="text-xl font-bold text-slate-900">{purchaseSummary.orderCount}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-500">Total Items Received</div>
              <div className="text-xl font-bold text-slate-900">{purchaseSummary.totalItems.toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-500">Total Purchases</div>
              <div className="text-xl font-bold text-slate-900">MMK {purchaseSummary.totalPurchases.toLocaleString()}</div>
            </div>
          </div>

          <p className="text-sm text-slate-500">
            These figures represent received purchase orders within the selected date range.
            View detailed purchase history in the Purchase Orders section.
          </p>
        </div>
      )}
    </Card>
  );
};
