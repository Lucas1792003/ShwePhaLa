import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { buildShiftBreakdown } from "../../features/shifts/service";
import { formatDateTime, formatMmk } from "../../lib/utils";
import { useDataStore } from "../../stores/dataStore";
import type { Shop, User } from "../../types";
import { EmptyState, KpiCard, MiniMoney, SectionCard } from "./DashboardCommon";
import { useDashboardCopy } from "./dashboardCopy";

interface CashierDashboardProps {
  currentUser: User;
  shopId: string;
  shops: Shop[];
}

const shortcutClass =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50";

export const CashierDashboard = ({ currentUser, shopId, shops }: CashierDashboardProps) => {
  const copy = useDashboardCopy();
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
          <h1 className="text-2xl font-bold text-slate-900">{copy("dashboard")}</h1>
          <p className="text-sm text-slate-500">
            {shop?.name ?? copy("assignedShop")} {copy("ownShiftSummary")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/app/pos" className={shortcutClass}>
            <span className="material-symbols-rounded text-lg">point_of_sale</span>
            {copy("pos")}
          </Link>
          <Link to="/app/sales" className={shortcutClass}>
            <span className="material-symbols-rounded text-lg">receipt_long</span>
            {copy("salesHistory")}
          </Link>
          <Link to="/app/shifts" className={shortcutClass}>
            <span className="material-symbols-rounded text-lg">schedule</span>
            {copy("shiftSummary")}
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={copy("shiftStatus")}
          value={openShift ? copy("open") : copy("noOpenShift")}
          detail={openShift ? `${copy("started")} ${formatDateTime(openShift.startedAt)}` : copy("startShiftBeforePos")}
          icon="schedule"
          tone={openShift ? "emerald" : "amber"}
        />
        <KpiCard
          label={copy("ownShiftSales")}
          value={formatMmk(ownRevenue)}
          detail={copy("voidSalesExcluded")}
          icon="payments"
          tone="blue"
        />
        <KpiCard
          label={copy("ownOrders")}
          value={activeSales.length}
          detail={`${shiftBreakdown?.voidedCount ?? 0} ${copy("voided")}`}
          icon="receipt_long"
          tone="slate"
        />
        <KpiCard
          label={copy("expectedCash")}
          value={formatMmk(shiftBreakdown?.expectedCash ?? 0)}
          detail={`${formatMmk(shiftBreakdown?.cashTotal ?? 0)} ${copy("cashSales")}`}
          icon="account_balance_wallet"
          tone="amber"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard title={copy("recentOwnSales")} icon="receipt_long">
          {ownSales.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {ownSales.slice(0, 8).map((sale) => (
                <div key={sale.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">
                        #{sale.receiptNo}
                      </span>
                      <Badge tone={sale.status === "VOID" ? "red" : "green"}>
                        {sale.status === "VOID" ? copy("voidSale") : copy("normal")}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {formatDateTime(sale.createdAt)} - {sale.paymentMethod === "CASH" ? copy("cash") : copy("other")}
                    </p>
                  </div>
                  <MiniMoney value={sale.status === "VOID" ? 0 : sale.totalMmk} />
                </div>
              ))}
            </div>
          ) : (
              <EmptyState message={copy("noSalesForCurrentScope")} icon="receipt" />
          )}
        </SectionCard>

        <SectionCard title={copy("requests")} icon="approval">
          {pendingRequests.length > 0 ? (
            <div className="space-y-2">
              {pendingRequests.slice(0, 5).map((request) => (
                <div key={request.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-800">
                      {request.type === "VOID" ? copy("voidRequest") : copy("partialRefund")}
                    </span>
                    <Badge tone="amber">{copy("requested")}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{request.reason}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message={copy("noPendingRefundVoidRequests")} icon="task_alt" />
          )}
        </SectionCard>
      </div>
    </div>
  );
};
