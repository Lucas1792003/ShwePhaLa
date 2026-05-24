import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { buildShiftBreakdown } from "../../features/shifts/service";
import { formatDateTime, formatMmk } from "../../lib/utils";
import { useDataStore } from "../../stores/dataStore";
import type { Shop, User } from "../../types";
import { EmptyState, KpiCard, MiniMoney, SectionCard } from "./DashboardCommon";

interface CashierDashboardProps {
  currentUser: User;
  shopId: string;
  shops: Shop[];
}

const shortcutClass =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50";

export const CashierDashboard = ({ currentUser, shopId, shops }: CashierDashboardProps) => {
  const sales = useDataStore((state) => state.sales);
  const refunds = useDataStore((state) => state.refundVoidRequests);
  const shifts = useDataStore((state) => state.shifts);

  const shop = shops.find((item) => item.id === shopId);
  const openShift = useMemo(
    () =>
      shifts.find(
        (shift) => shift.shopId === shopId && shift.cashierId === currentUser.id && !shift.endedAt
      ),
    [shifts, shopId, currentUser.id]
  );
  const ownSales = useMemo(
    () =>
      sales
        .filter((sale) =>
          openShift
            ? sale.shiftId === openShift.id
            : sale.shopId === shopId && sale.cashierId === currentUser.id
        )
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [sales, openShift, shopId, currentUser.id]
  );
  const shiftBreakdown = openShift ? buildShiftBreakdown(openShift, ownSales, refunds) : null;
  const activeSales = ownSales.filter((sale) => sale.status !== "VOID");
  const ownRevenue = activeSales.reduce((sum, sale) => sum + sale.totalMmk, 0);
  const pendingRequests = refunds.filter(
    (request) => request.createdBy === currentUser.id && request.status === "REQUESTED"
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {shop?.name ?? "Assigned shop"} own-shift summary
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/app/pos" className={shortcutClass}>
            <span className="material-symbols-rounded text-lg">point_of_sale</span>
            POS
          </Link>
          <Link to="/app/sales" className={shortcutClass}>
            <span className="material-symbols-rounded text-lg">receipt_long</span>
            Sales History
          </Link>
          <Link to="/app/shifts" className={shortcutClass}>
            <span className="material-symbols-rounded text-lg">schedule</span>
            Shift Summary
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Shift Status"
          value={openShift ? "Open" : "No open shift"}
          detail={openShift ? `Started ${formatDateTime(openShift.startedAt)}` : "Start a shift before POS"}
          icon="schedule"
          tone={openShift ? "emerald" : "amber"}
        />
        <KpiCard
          label="Own Shift Sales"
          value={formatMmk(ownRevenue)}
          detail="VOID sales excluded"
          icon="payments"
          tone="blue"
        />
        <KpiCard
          label="Own Orders"
          value={activeSales.length}
          detail={`${shiftBreakdown?.voidedCount ?? 0} voided`}
          icon="receipt_long"
          tone="slate"
        />
        <KpiCard
          label="Expected Cash"
          value={formatMmk(shiftBreakdown?.expectedCash ?? 0)}
          detail={`${formatMmk(shiftBreakdown?.cashTotal ?? 0)} cash sales`}
          icon="account_balance_wallet"
          tone="amber"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard title="Recent Own Sales" icon="receipt_long">
          {ownSales.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {ownSales.slice(0, 8).map((sale) => (
                <div key={sale.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">
                        #{sale.receiptNo}
                      </span>
                      <Badge tone={sale.status === "VOID" ? "red" : "green"}>{sale.status}</Badge>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {formatDateTime(sale.createdAt)} - {sale.paymentMethod}
                    </p>
                  </div>
                  <MiniMoney value={sale.status === "VOID" ? 0 : sale.totalMmk} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No sales for your current scope." icon="receipt" />
          )}
        </SectionCard>

        <SectionCard title="Requests" icon="approval">
          {pendingRequests.length > 0 ? (
            <div className="space-y-2">
              {pendingRequests.slice(0, 5).map((request) => (
                <div key={request.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-800">{request.type}</span>
                    <Badge tone="amber">Requested</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{request.reason}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No pending refund or void requests." icon="task_alt" />
          )}
        </SectionCard>
      </div>
    </div>
  );
};
