import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { formatDateTime } from "../../lib/utils";
import type { Shop, StockTransfer, TransferStatus } from "../../types";
import { EmptyState, SectionCard } from "./DashboardCommon";
import { useDashboardCopy, type DashboardCopyKey } from "./dashboardCopy";

const statusTone: Record<TransferStatus, string> = {
  PENDING: "amber",
  APPROVED: "blue",
  IN_TRANSIT: "violet",
  COMPLETED: "green",
  CANCELED: "slate",
  REJECTED: "red",
};

const statusKey: Record<TransferStatus, DashboardCopyKey> = {
  PENDING: "txPending",
  APPROVED: "txApproved",
  IN_TRANSIT: "txInTransit",
  COMPLETED: "txCompleted",
  CANCELED: "txCanceled",
  REJECTED: "txRejected",
};

interface TransfersStatusProps {
  /** Full transfer list in scope, sorted newest-first (see `recentTransfers`). */
  transfers: StockTransfer[];
  shops: Shop[];
  /** Rows to show before the "View all" button. */
  previewLimit?: number;
}

const TransferRow = ({ transfer, shops }: { transfer: StockTransfer; shops: Shop[] }) => {
  const copy = useDashboardCopy();
  const shopName = (id: string) => shops.find((shop) => shop.id === id)?.name ?? id;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">{transfer.transferNo}</p>
        <p className="truncate text-xs text-slate-500">
          {shopName(transfer.fromShopId)} → {shopName(transfer.toShopId)} ·{" "}
          {formatDateTime(transfer.createdAt)}
        </p>
      </div>
      <Badge tone={statusTone[transfer.status]}>{copy(statusKey[transfer.status])}</Badge>
    </div>
  );
};

/** Plain rows for the "view all" modal body. */
const TransfersStatusList = ({ transfers, shops }: { transfers: StockTransfer[]; shops: Shop[] }) => (
  <div className="space-y-2">
    {transfers.map((transfer) => (
      <TransferRow key={transfer.id} transfer={transfer} shops={shops} />
    ))}
  </div>
);

/**
 * Embeddable transfer feed: a fixed preview of the most recent transfers and,
 * when there are more, a "View all (N)" button that opens every transfer in a
 * scrollable modal — so the host card's height stays fixed. No card chrome, so
 * it can sit inside another card (Admin Action Queue) or be wrapped by
 * `TransfersStatusCard` (Manager).
 */
export const TransfersStatusFeed = ({ transfers, shops, previewLimit = 5 }: TransfersStatusProps) => {
  const copy = useDashboardCopy();
  const [showAll, setShowAll] = useState(false);
  const hasMore = transfers.length > previewLimit;

  if (transfers.length === 0) {
    return <EmptyState message={copy("noRecentTransfers")} icon="local_shipping" />;
  }

  return (
    <div className="space-y-2">
      {transfers.slice(0, previewLimit).map((transfer) => (
        <TransferRow key={transfer.id} transfer={transfer} shops={shops} />
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          {copy("viewAll")} ({transfers.length})
        </button>
      )}

      <Modal
        open={showAll}
        title={copy("transfersBetweenShops")}
        onClose={() => setShowAll(false)}
        size="lg"
      >
        <TransfersStatusList transfers={transfers} shops={shops} />
      </Modal>
    </div>
  );
};

/**
 * Standalone "Transfers Between Shops" card (Manager dashboard). The Admin
 * dashboard embeds `TransfersStatusFeed` inside its Action Queue card instead.
 */
export const TransfersStatusCard = ({ transfers, shops, previewLimit }: TransfersStatusProps) => {
  const copy = useDashboardCopy();
  return (
    <SectionCard title={copy("transfersBetweenShops")} icon="local_shipping">
      <TransfersStatusFeed transfers={transfers} shops={shops} previewLimit={previewLimit} />
    </SectionCard>
  );
};
