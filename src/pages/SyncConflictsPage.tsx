import { useCallback, useEffect, useState } from "react";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { dismissOutboxEntry, drainOutbox, listOutboxConflicts, retryOutboxEntry } from "../stores/data/outbox";
import type { SyncOutboxEntry } from "../lib/localDb";

const RPC_LABELS: Record<string, string> = {
  complete_sale: "POS Sale",
  adjust_stock: "Stock Adjustment",
  open_shift: "Shift Opened",
  close_shift: "Shift Closed",
  create_refund_void_request: "Refund/Void Request",
  receive_purchase_order: "Purchase Order Received",
  record_supplier_payment: "Supplier Payment",
  dispatch_stock_transfer: "Transfer Dispatched",
  receive_stock_transfer: "Transfer Received",
};

// table_write entries (see tableWrite.ts) are named "<table>.<op>" — turn
// that into something readable, e.g. "categories.insert" -> "Category Added".
const TABLE_LABELS: Record<string, string> = {
  categories: "Category",
  brands: "Brand",
  unit_types: "Unit Type",
  price_tiers: "Price Tier",
  shops: "Shop",
  users: "User",
  suppliers: "Supplier",
};

const OP_LABELS: Record<string, string> = {
  insert: "Added",
  update: "Updated",
  delete: "Deleted",
};

const describeEntry = (entry: SyncOutboxEntry): string => {
  if (entry.kind === "table_write" && entry.table && entry.op) {
    const tableLabel = TABLE_LABELS[entry.table] ?? entry.table;
    const opLabel = OP_LABELS[entry.op] ?? entry.op;
    return `${tableLabel} ${opLabel}`;
  }
  return RPC_LABELS[entry.name] ?? entry.name;
};

export const SyncConflictsPage = () => {
  const shops = useDataStore((state) => state.shops);
  const addToast = useToast();
  const [conflicts, setConflicts] = useState<SyncOutboxEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setConflicts(await listOutboxConflicts());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shopName = (shopId: string | null) => shops.find((s) => s.id === shopId)?.name ?? shopId ?? "—";

  const handleRetry = async (entry: SyncOutboxEntry) => {
    setBusyId(entry.localId);
    try {
      await retryOutboxEntry(entry.localId);
      await drainOutbox();
      await refresh();
      addToast({ variant: "success", title: "Retried", description: "The queued entry was resubmitted." });
    } catch (err) {
      addToast({ variant: "error", title: "Retry failed", description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (entry: SyncOutboxEntry) => {
    setBusyId(entry.localId);
    try {
      await dismissOutboxEntry(entry.localId);
      await refresh();
      addToast({ variant: "success", title: "Dismissed", description: "The queued entry will no longer be retried." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <PageHeader
        title="Sync Conflicts"
        subtitle="Offline actions the server rejected once reconnected — the till stayed usable, but these need a manual look."
      />
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-slate-500">
          {isLoading ? "Loading…" : `${conflicts.length} ${conflicts.length === 1 ? "conflict" : "conflicts"}`}
        </span>
        <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={isLoading}>
          Refresh
        </Button>
      </div>
      <div className="mt-4">
        {!isLoading && conflicts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            No sync conflicts. Everything queued offline has synced cleanly.
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Action</TH>
                <TH>Shop</TH>
                <TH>Queued at</TH>
                <TH>Error</TH>
                <TH>Attempts</TH>
                <TH>&nbsp;</TH>
              </TR>
            </THead>
            <TBody>
              {conflicts.map((entry) => (
                <TR key={entry.localId}>
                  <TD>{describeEntry(entry)}</TD>
                  <TD>{shopName(entry.shopId)}</TD>
                  <TD>{new Date(entry.createdAt).toLocaleString()}</TD>
                  <TD>
                    <Badge tone="red">{entry.lastError ?? "Unknown error"}</Badge>
                  </TD>
                  <TD>{entry.attempts}</TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary" size="sm"
                        disabled={busyId === entry.localId}
                        onClick={() => void handleRetry(entry)}
                      >
                        Retry
                      </Button>
                      <Button
                        variant="danger" size="sm"
                        disabled={busyId === entry.localId}
                        onClick={() => void handleDismiss(entry)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        Dismissing stops retrying the queued server call, but leaves the original record (e.g. the sale) in place,
        flagged as not synced — reconcile stock or the customer's receipt manually before dismissing.
      </p>
    </Card>
  );
};
