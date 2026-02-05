import { useMemo } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/layout/PageHeader";
import { formatMmk, getEffectiveShopId } from "../lib/utils";

export const ReportsPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const sales = useDataStore((state) => state.sales);

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const shopSales = sales.filter((sale) => sale.shopId === shopId && sale.status !== "VOID");
  const totalSales = shopSales.reduce((sum, sale) => sum + sale.totalMmk, 0);
  const cashSales = shopSales.filter((sale) => sale.paymentMethod === "CASH").reduce((sum, sale) => sum + sale.totalMmk, 0);
  const otherSales = totalSales - cashSales;

  const dailyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    shopSales.forEach((sale) => {
      const day = sale.createdAt.slice(0, 10);
      totals[day] = (totals[day] || 0) + sale.totalMmk;
    });
    return Object.entries(totals)
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .slice(-7);
  }, [shopSales]);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Quick view of shop performance." />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-sm text-slate-500">Total sales</div>
          <div className="mt-2 text-2xl font-semibold">{formatMmk(totalSales)}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Cash</div>
          <div className="mt-2 text-2xl font-semibold">{formatMmk(cashSales)}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Other</div>
          <div className="mt-2 text-2xl font-semibold">{formatMmk(otherSales)}</div>
        </Card>
      </div>
      <Card>
        <div className="text-lg font-semibold">7-day sales pulse</div>
        <div className="mt-4 grid gap-3">
          {dailyTotals.map(([date, value]) => (
            <div key={date} className="flex items-center gap-3">
              <div className="w-24 text-xs text-slate-500">{date}</div>
              <div className="flex-1 rounded-full bg-slate-100">
                <div className="h-3 rounded-full bg-indigo-600" style={{ width: `${Math.min(100, (value / (totalSales || 1)) * 100)}%` }} />
              </div>
              <div className="w-24 text-right text-xs font-semibold">{formatMmk(value)}</div>
            </div>
          ))}
          {dailyTotals.length === 0 && <div className="text-sm text-slate-400">No sales yet.</div>}
        </div>
      </Card>
    </div>
  );
};
