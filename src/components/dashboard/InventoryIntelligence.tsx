import { Badge } from "../ui/Badge";
import { SectionCard } from "../../features/dashboard/DashboardCommon";
import { useDashboardCopy } from "../../features/dashboard/dashboardCopy";
import type { StockHealthItem, FastSlowMover } from "../../hooks/useDashboardInsights";

interface InventoryIntelligenceProps {
  stockHealth: StockHealthItem[];
  fastSlowMovers: FastSlowMover[];
  className?: string;
}

/**
 * Restored Admin-only analytics card.
 *
 * Sections:
 *   1. Stock Health Summary — counts of out / low / healthy across the
 *      current scope (single shop or All Shops worst-shop classification).
 *   2. Fast / Slow Movers — products with non-null velocity, ranked by
 *      days-of-stock. Products with zero recent sales get null days and
 *      a literal "n/a" badge (no fake 999d).
 *   3. Reorder Suggestions — low-stock items projected to run out within
 *      a week, or out-of-stock items that had sales in the velocity
 *      window. Critical / high / medium urgency badges.
 *
 * "Avoid restocking" is intentionally omitted; the Slow Movers tile
 * already names the same products, and the dedicated note doubled the
 * card height for little extra signal.
 */
export const InventoryIntelligence = ({
  stockHealth,
  fastSlowMovers,
  className,
}: InventoryIntelligenceProps) => {
  const copy = useDashboardCopy();

  const healthyCount = stockHealth.filter((s) => s.status === "healthy").length;
  const lowCount = stockHealth.filter((s) => s.status === "low").length;
  const outCount = stockHealth.filter((s) => s.status === "out").length;

  const fastMovers = fastSlowMovers.filter((m) => m.type === "fast").slice(0, 3);
  const slowMovers = fastSlowMovers.filter((m) => m.type === "slow").slice(0, 3);

  const reorderSuggestions = stockHealth
    .filter((s) => {
      if (s.status === "low" && s.avgDailySales > 0 && s.daysUntilStockout !== null) {
        return s.daysUntilStockout <= 7;
      }
      if (s.status === "out" && s.avgDailySales > 0) return true;
      return false;
    })
    .slice(0, 3)
    .map((s) => ({
      product: s.product,
      urgency:
        s.status === "out"
          ? "critical"
          : (s.daysUntilStockout ?? 0) <= 3
            ? "high"
            : "medium",
      daysLeft: s.daysUntilStockout,
      status: s.status,
    }));

  // Compact, locale-neutral badge: number + "d" (days). When the product
  // had no sales in the velocity window the hook returns `null` — we show
  // a literal "n/a" instead of a fake 999-day estimate.
  const daysBadge = (days: number | null) => (days === null ? "n/a" : `${days}d`);
  const cardClassName = ["flex flex-col", className].filter(Boolean).join(" ");

  return (
    <SectionCard title={copy("inventoryIntelligence")} icon="inventory_2" className={cardClassName}>
      <div className="flex flex-1 flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-emerald-50 p-4 text-center">
            <div className="text-2xl font-bold leading-7 text-emerald-600">{healthyCount}</div>
            <div className="text-xs text-emerald-700">{copy("healthy")}</div>
          </div>
          <div className="rounded-lg bg-amber-50 p-4 text-center">
            <div className="text-2xl font-bold leading-7 text-amber-600">{lowCount}</div>
            <div className="text-xs text-amber-700">{copy("lowStock")}</div>
          </div>
          <div className="rounded-lg bg-rose-50 p-4 text-center">
            <div className="text-2xl font-bold leading-7 text-rose-600">{outCount}</div>
            <div className="text-xs text-rose-700">{copy("outOfStock")}</div>
          </div>
        </div>

        <div className="grid flex-1 gap-3 xl:grid-rows-[minmax(0,1fr)_auto]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-h-36 flex-col rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <span className="material-symbols-rounded text-sm">bolt</span>
                {copy("fastMovers")}
              </div>
              {fastMovers.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {fastMovers.map((m) => (
                    <li
                      key={m.product.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2"
                    >
                      <span className="truncate text-sm text-slate-700">{m.product.name}</span>
                      <Badge tone="amber">{daysBadge(m.daysOfStock)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-emerald-200 bg-white/70 px-4 py-6 text-center">
                  <span className="material-symbols-rounded text-2xl text-emerald-300">task_alt</span>
                  <p className="mt-1 text-sm text-slate-500">{copy("noFastMovers")}</p>
                </div>
              )}
            </div>

            <div className="flex min-h-36 flex-col rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <span className="material-symbols-rounded text-sm">hourglass_empty</span>
                {copy("slowMovers")}
              </div>
              {slowMovers.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {slowMovers.map((m) => (
                    <li
                      key={m.product.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2"
                    >
                      <span className="truncate text-sm text-slate-700">{m.product.name}</span>
                      <Badge tone="slate">{daysBadge(m.daysOfStock)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center">
                  <span className="material-symbols-rounded text-2xl text-slate-300">task_alt</span>
                  <p className="mt-1 text-sm text-slate-500">{copy("noSlowMovers")}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-32 flex-col rounded-lg border border-violet-100 bg-violet-50/30 p-4">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <span className="material-symbols-rounded text-sm text-violet-500">shopping_cart</span>
              {copy("reorderSuggestions")}
            </h4>
            {reorderSuggestions.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {reorderSuggestions.map((s) => {
                  const tone =
                    s.urgency === "critical"
                      ? { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", icon: "error" }
                      : s.urgency === "high"
                        ? { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: "warning" }
                        : { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: "info" };
                  return (
                    <li
                      key={s.product.id}
                      className={`flex items-center gap-2 rounded-lg border p-2 ${tone.bg} ${tone.border}`}
                    >
                      <span className={`material-symbols-rounded text-sm ${tone.text}`}>{tone.icon}</span>
                      <span className={`min-w-0 truncate text-xs ${tone.text}`}>
                        {s.status === "out"
                          ? `${s.product.name} ${copy("reorderImmediately")}`
                          : `${s.product.name} — ${copy("reorderWithinDays")} ${s.daysLeft} ${copy("days")}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="flex flex-1 items-center text-sm text-slate-500">
                {copy("noReorderSuggestions")}
              </p>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
};
