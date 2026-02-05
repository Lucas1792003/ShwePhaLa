import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { useTranslation } from "../../hooks/useTranslation";
import type { StockHealthItem, FastSlowMover } from "../../hooks/useDashboardInsights";

interface InventoryIntelligenceProps {
  stockHealth: StockHealthItem[];
  fastSlowMovers: FastSlowMover[];
}

export const InventoryIntelligence = ({
  stockHealth,
  fastSlowMovers,
}: InventoryIntelligenceProps) => {
  const { language } = useTranslation();

  // Calculate stock health summary
  const healthySummary = stockHealth.filter((s) => s.status === "healthy").length;
  const lowSummary = stockHealth.filter((s) => s.status === "low").length;
  const outSummary = stockHealth.filter((s) => s.status === "out").length;

  // Get fast and slow movers
  const fastMovers = fastSlowMovers.filter((m) => m.type === "fast").slice(0, 3);
  const slowMovers = fastSlowMovers.filter((m) => m.type === "slow").slice(0, 3);

  // Generate reorder suggestions
  const reorderSuggestions = stockHealth
    .filter((s) => {
      // Suggest reorder for low stock items that have sales velocity
      if (s.status === "low" && s.avgDailySales > 0 && s.daysUntilStockout !== null) {
        return s.daysUntilStockout <= 7;
      }
      // Suggest reorder for out of stock items that had sales
      if (s.status === "out" && s.avgDailySales > 0) {
        return true;
      }
      return false;
    })
    .slice(0, 3)
    .map((s) => ({
      product: s.product,
      urgency: s.status === "out" ? "critical" : s.daysUntilStockout! <= 3 ? "high" : "medium",
      daysLeft: s.daysUntilStockout,
      message:
        s.status === "out"
          ? language === "my"
            ? `${s.product.name} ကုန်သွားပြီ - အမြန်မှာပါ`
            : `${s.product.name} is out - reorder immediately`
          : language === "my"
          ? `${s.product.name} ကို ${s.daysUntilStockout} ရက်အတွင်း ပြန်မှာပါ`
          : `Reorder ${s.product.name} within ${s.daysUntilStockout} days`,
    }));

  // Avoid restocking suggestions (slow movers with high stock)
  const avoidRestocking = slowMovers.slice(0, 2).map((m) => ({
    product: m.product,
    message:
      language === "my"
        ? `${m.product.name} ကို ဤအပတ်မှာမဝယ်ပါနှင့်`
        : `Avoid restocking ${m.product.name} this week`,
    reason:
      language === "my"
        ? `${m.daysOfStock} ရက်စာ ကုန်ပစ္စည်းရှိပြီး ရောင်းအားနှေးသည်`
        : `${m.daysOfStock} days of stock with slow sales`,
  }));

  return (
    <Card className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-rounded text-violet-600">inventory_2</span>
          <h3 className="text-lg font-semibold text-slate-800">
            {language === "my" ? "ကုန်ပစ္စည်းထိန်းချုပ်မှု" : "Inventory Intelligence"}
          </h3>
        </div>
      </div>

      {/* Stock Health Summary */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-emerald-50 p-3 text-center">
          <p className="text-2xl font-bold text-emerald-600">{healthySummary}</p>
          <p className="text-xs text-emerald-700">
            {language === "my" ? "ကျန်းမာ" : "Healthy"}
          </p>
        </div>
        <div className="rounded-lg bg-amber-50 p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{lowSummary}</p>
          <p className="text-xs text-amber-700">
            {language === "my" ? "နည်းနေ" : "Low Stock"}
          </p>
        </div>
        <div className="rounded-lg bg-red-50 p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{outSummary}</p>
          <p className="text-xs text-red-700">
            {language === "my" ? "ကုန်သွားပြီ" : "Out of Stock"}
          </p>
        </div>
      </div>

      {/* Fast vs Slow Movers */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        {/* Fast Movers */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="mb-2 flex items-center gap-1">
            <span className="material-symbols-rounded text-sm text-emerald-600">bolt</span>
            <span className="text-xs font-semibold text-emerald-700">
              {language === "my" ? "မြန်မြန်ရောင်းရ" : "Fast Movers"}
            </span>
          </div>
          {fastMovers.length > 0 ? (
            <div className="space-y-1">
              {fastMovers.map((m) => (
                <div key={m.product.id} className="flex items-center justify-between">
                  <span className="truncate text-xs text-slate-700">{m.product.name}</span>
                  <Badge tone="amber" className="text-xs">
                    {m.daysOfStock}d
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {language === "my" ? "မရှိပါ" : "None detected"}
            </p>
          )}
        </div>

        {/* Slow Movers */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div className="mb-2 flex items-center gap-1">
            <span className="material-symbols-rounded text-sm text-slate-500">hourglass_empty</span>
            <span className="text-xs font-semibold text-slate-600">
              {language === "my" ? "နှေးနှေးရောင်းရ" : "Slow Movers"}
            </span>
          </div>
          {slowMovers.length > 0 ? (
            <div className="space-y-1">
              {slowMovers.map((m) => (
                <div key={m.product.id} className="flex items-center justify-between">
                  <span className="truncate text-xs text-slate-700">{m.product.name}</span>
                  <Badge tone="gray" className="text-xs">
                    {m.daysOfStock}d
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {language === "my" ? "မရှိပါ" : "None detected"}
            </p>
          )}
        </div>
      </div>

      {/* Reorder Suggestions */}
      <div className="space-y-2">
        <h4 className="flex items-center gap-1 text-sm font-semibold text-slate-700">
          <span className="material-symbols-rounded text-base text-violet-500">shopping_cart</span>
          {language === "my" ? "မှာယူရန်အကြံပြုချက်" : "Reorder Suggestions"}
        </h4>

        {reorderSuggestions.length > 0 ? (
          <div className="space-y-2">
            {reorderSuggestions.map((suggestion) => (
              <div
                key={suggestion.product.id}
                className={`flex items-center gap-2 rounded-lg p-2 ${
                  suggestion.urgency === "critical"
                    ? "bg-red-50 border border-red-200"
                    : suggestion.urgency === "high"
                    ? "bg-amber-50 border border-amber-200"
                    : "bg-blue-50 border border-blue-200"
                }`}
              >
                <span
                  className={`material-symbols-rounded text-sm ${
                    suggestion.urgency === "critical"
                      ? "text-red-500"
                      : suggestion.urgency === "high"
                      ? "text-amber-500"
                      : "text-blue-500"
                  }`}
                >
                  {suggestion.urgency === "critical" ? "error" : "info"}
                </span>
                <span
                  className={`text-xs ${
                    suggestion.urgency === "critical"
                      ? "text-red-700"
                      : suggestion.urgency === "high"
                      ? "text-amber-700"
                      : "text-blue-700"
                  }`}
                >
                  {suggestion.message}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            {language === "my" ? "လက်ရှိတွင် အကြံပြုချက်မရှိပါ" : "No suggestions at this time"}
          </p>
        )}

        {/* Avoid Restocking */}
        {avoidRestocking.length > 0 && (
          <div className="mt-3 space-y-2">
            <h4 className="flex items-center gap-1 text-sm font-semibold text-slate-700">
              <span className="material-symbols-rounded text-base text-slate-400">do_not_disturb</span>
              {language === "my" ? "ပြန်မမှာသင့်သည်" : "Avoid Restocking"}
            </h4>
            {avoidRestocking.map((item) => (
              <div
                key={item.product.id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-2"
              >
                <p className="text-xs text-slate-700">{item.message}</p>
                <p className="text-xs text-slate-500">{item.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};
