import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { EmptyState, SectionCard } from "./DashboardCommon";
import { useDashboardCopy } from "./dashboardCopy";
import type { LowStockRow } from "./dashboardMetrics";

export type DecoratedLowStockRow = LowStockRow & { shopName: string };

interface LowStockCardProps {
  title: string;
  /** Full, already-sorted+decorated row list — NOT pre-sliced. */
  rows: DecoratedLowStockRow[];
  /** How many rows to show in the compact dashboard preview. */
  previewLimit: number;
  /** Show the shop name in the subtitle (admin all-shops view). */
  showShop: boolean;
}

/**
 * Low / out-of-stock card. Renders a compact preview on the dashboard and,
 * when there are more rows than the preview limit, a "View all" button that
 * opens every low-stock row in a scrollable modal. Row markup matches the
 * original inline cards so the dashboard styling is unchanged.
 */
export const LowStockCard = ({ title, rows, previewLimit, showShop }: LowStockCardProps) => {
  const copy = useDashboardCopy();
  const [showAll, setShowAll] = useState(false);
  const hasMore = rows.length > previewLimit;

  const renderRow = (row: DecoratedLowStockRow) => (
    <div
      key={`${row.shopId}-${row.product.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">{row.product.name}</p>
        <p className="truncate text-xs text-slate-500">
          {showShop ? `${row.shopName} - ` : ""}
          {copy("threshold")} {row.threshold}
        </p>
      </div>
      <Badge tone={row.status === "out" ? "red" : "amber"}>
        {row.qty} {copy("left")}
      </Badge>
    </div>
  );

  return (
    <SectionCard title={title} icon="warning">
      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.slice(0, previewLimit).map(renderRow)}
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              {copy("viewAll")} ({rows.length})
            </button>
          )}
        </div>
      ) : (
        <EmptyState message={copy("noLowOrOutStock")} icon="task_alt" />
      )}

      <Modal open={showAll} title={title} onClose={() => setShowAll(false)} size="lg">
        <div className="space-y-2">{rows.map(renderRow)}</div>
      </Modal>
    </SectionCard>
  );
};
