import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card } from "../ui/Card";
import { formatMmk } from "../../lib/utils";
import { useTranslation } from "../../hooks/useTranslation";
import type { Sale, SaleItem, Product } from "../../types/domain";

interface ProfitTrendChartProps {
  sales: Sale[];
  saleItems: SaleItem[];
  products: Product[];
  shopId: string | null;
  isAdmin: boolean;
}

type TimeRange = "7days" | "30days";

export const ProfitTrendChart = ({
  sales,
  saleItems,
  products,
  shopId,
  isAdmin,
}: ProfitTrendChartProps) => {
  const [timeRange, setTimeRange] = useState<TimeRange>("7days");
  const { language } = useTranslation();

  const chartData = useMemo(() => {
    const filteredSales = sales.filter(
      (s) => s.status === "NORMAL" && (isAdmin || s.shopId === shopId)
    );

    const days = timeRange === "7days" ? 7 : 30;
    const data: Record<string, { date: string; fullDate: string; revenue: number; cost: number; profit: number }> = {};
    const today = new Date();

    // Initialize days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      const displayDate = days <= 7
        ? date.toLocaleDateString("en-US", { weekday: "short" })
        : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      data[key] = { date: displayDate, fullDate: key, revenue: 0, cost: 0, profit: 0 };
    }

    // Calculate daily profit
    filteredSales.forEach((sale) => {
      const saleDate = sale.createdAt.slice(0, 10);
      if (data[saleDate]) {
        data[saleDate].revenue += sale.totalMmk;

        const items = saleItems.filter((i) => i.saleId === sale.id);
        const cost = items.reduce((sum, item) => {
          const product = products.find((p) => p.id === item.productId);
          return sum + (product?.costMmk || 0) * item.qtyUnits;
        }, 0);
        data[saleDate].cost += cost;
        data[saleDate].profit += sale.totalMmk - cost;
      }
    });

    return Object.values(data);
  }, [sales, saleItems, products, shopId, isAdmin, timeRange]);

  // Calculate trend
  const trend = useMemo(() => {
    if (chartData.length < 2) return "neutral";
    const recentHalf = chartData.slice(Math.floor(chartData.length / 2));
    const olderHalf = chartData.slice(0, Math.floor(chartData.length / 2));

    const recentAvg = recentHalf.reduce((sum, d) => sum + d.profit, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((sum, d) => sum + d.profit, 0) / olderHalf.length;

    if (recentAvg < olderAvg * 0.9) return "declining";
    if (recentAvg > olderAvg * 1.1) return "improving";
    return "neutral";
  }, [chartData]);

  const totalProfit = chartData.reduce((sum, d) => sum + d.profit, 0);
  const profitDays = chartData.filter((d) => d.profit > 0).length;
  const lossDays = chartData.filter((d) => d.profit < 0).length;

  return (
    <Card className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">
            {language === "my" ? "အမြတ်လမ်းကြောင်း" : "Profit Trend"}
          </h3>
          <div className="mt-1 flex items-center gap-3 text-sm">
            <span className={`font-medium ${totalProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {language === "my" ? "စုစုပေါင်း" : "Total"}: {formatMmk(totalProfit)}
            </span>
            <span className="text-emerald-600">{profitDays} {language === "my" ? "မြတ်ရက်" : "profit days"}</span>
            {lossDays > 0 && (
              <span className="text-red-600">{lossDays} {language === "my" ? "ရှုံးရက်" : "loss days"}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {trend === "declining" && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
              <span className="material-symbols-rounded text-sm">trending_down</span>
              {language === "my" ? "ကျဆင်းနေသည်" : "Declining"}
            </span>
          )}
          {trend === "improving" && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
              <span className="material-symbols-rounded text-sm">trending_up</span>
              {language === "my" ? "တိုးတက်နေသည်" : "Improving"}
            </span>
          )}

          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button
              onClick={() => setTimeRange("7days")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                timeRange === "7days"
                  ? "bg-violet-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {language === "my" ? "၇ ရက်" : "7 Days"}
            </button>
            <button
              onClick={() => setTimeRange("30days")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                timeRange === "30days"
                  ? "bg-violet-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {language === "my" ? "၃၀ ရက်" : "30 Days"}
            </button>
          </div>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                      <p className="text-xs font-medium text-slate-500">{data.fullDate}</p>
                      <div className="mt-2 space-y-1">
                        <p className="text-sm">
                          <span className="text-slate-500">{language === "my" ? "ဝင်ငွေ" : "Revenue"}: </span>
                          <span className="font-medium text-emerald-600">{formatMmk(data.revenue)}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-slate-500">{language === "my" ? "ကုန်ကျစရိတ်" : "Cost"}: </span>
                          <span className="font-medium text-violet-600">{formatMmk(data.cost)}</span>
                        </p>
                        <p className="text-sm font-semibold">
                          <span className="text-slate-500">{language === "my" ? "အမြတ်" : "Profit"}: </span>
                          <span className={data.profit >= 0 ? "text-emerald-600" : "text-red-600"}>
                            {formatMmk(data.profit)}
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <Bar dataKey="profit" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.profit >= 0 ? "#10b981" : "#ef4444"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
