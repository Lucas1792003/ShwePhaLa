import { useMemo, useState } from "react";
import type { Role, Shift, Shop, User } from "../../../types";
import { Select } from "../../../components/ui/Select";
import { Input } from "../../../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../../../components/ui/Table";
import { Badge } from "../../../components/ui/Badge";
import { formatDateTime } from "../../../lib/utils";
import {
  formatDuration,
  getMonthlyShiftHoursMs,
  getShiftDurationMs,
  groupShiftHoursByUser,
  isShiftInMonth,
  monthKey,
} from "../workHours";

interface WorkHoursPanelProps {
  // Already permission-scoped by the caller — this component does not
  // re-filter by role. The caller passes whatever the operator is
  // allowed to see (ADMIN: everything; MANAGER: assigned shop; CASHIER:
  // own shifts only).
  shifts: Shift[];
  users: User[];
  shops: Shop[];
  // The currently signed-in operator's role and assigned shop, used to
  // decide which filter chips to render (CASHIER does not need a user
  // dropdown for their own data; MANAGER's shop is pre-bound).
  viewerRole: Role;
  viewerAssignedShopId?: string;
  // Re-rendered each tick by the parent so the "Active" duration
  // updates without each row re-subscribing.
  now: Date;
}

const ROLE_TONES: Record<Role, "amber" | "red" | "green" | "blue" | "slate"> = {
  ADMIN: "red",
  MANAGER: "amber",
  CASHIER: "green",
  BUYER: "blue",
};

export const WorkHoursPanel = ({
  shifts,
  users,
  shops,
  viewerRole,
  viewerAssignedShopId,
  now,
}: WorkHoursPanelProps) => {
  // Default to the calendar month containing `now` so the operator sees
  // current-month figures the moment they land on the tab.
  const [month, setMonth] = useState<string>(monthKey(now));
  const [shopFilter, setShopFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");

  // ADMIN gets a shop filter; MANAGER is hard-bound to their shop;
  // CASHIER doesn't pick (their data is already scoped to themselves).
  const showShopFilter = viewerRole === "ADMIN";
  const showUserFilter = viewerRole === "ADMIN" || viewerRole === "MANAGER";

  // Apply local UI filters on top of the already-scoped shift list.
  const filteredShifts = useMemo(() => {
    let list = shifts;
    if (showShopFilter && shopFilter !== "all") {
      list = list.filter((s) => s.shopId === shopFilter);
    } else if (viewerRole === "MANAGER" && viewerAssignedShopId) {
      // Defensive: a MANAGER's data is already scoped by the parent.
      list = list.filter((s) => s.shopId === viewerAssignedShopId);
    }
    if (showUserFilter && userFilter !== "all") {
      list = list.filter((s) => s.cashierId === userFilter);
    }
    return list;
  }, [shifts, shopFilter, userFilter, showShopFilter, showUserFilter, viewerRole, viewerAssignedShopId]);

  const inMonth = useMemo(
    () => filteredShifts.filter((s) => isShiftInMonth(s, month)),
    [filteredShifts, month]
  );

  // ACTIVE list: any currently-open shift visible to this operator.
  // Open shifts are global to the cashier, so we don't restrict to month.
  const activeShifts = useMemo(
    () => filteredShifts.filter((s) => !s.endedAt),
    [filteredShifts]
  );

  const monthlyTotalMs = useMemo(
    () => getMonthlyShiftHoursMs(filteredShifts, month, now),
    [filteredShifts, month, now]
  );

  const perUserRows = useMemo(
    () => groupShiftHoursByUser(filteredShifts, users, shops, month, now),
    [filteredShifts, users, shops, month, now]
  );

  // Pool of users the filter dropdown shows: anyone who has a shift in the
  // already-scoped list, regardless of month. Keeps a stable order between
  // months so the operator can compare without the dropdown re-shuffling.
  const userOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; name: string }[] = [];
    for (const s of shifts) {
      if (seen.has(s.cashierId)) continue;
      seen.add(s.cashierId);
      const u = users.find((user) => user.id === s.cashierId);
      opts.push({ id: s.cashierId, name: u?.name ?? "Unknown user" });
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [shifts, users]);

  const shopOptions = useMemo(() => {
    return shops
      .filter((s) => s.isActive || shifts.some((sh) => sh.shopId === s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [shops, shifts]);

  if (viewerRole !== "ADMIN" && !viewerAssignedShopId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-500">
        Your account is not assigned to a shop, so work hours cannot be calculated.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Month
          </label>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
          />
        </div>
        {showShopFilter && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Shop
            </label>
            <Select
              value={shopFilter}
              onChange={(e) => setShopFilter(e.target.value)}
              className="w-48"
            >
              <option value="all">All shops</option>
              {shopOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
        )}
        {showUserFilter && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              User
            </label>
            <Select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-52"
            >
              <option value="all">All users</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="ml-auto rounded-2xl border border-slate-200/70 bg-slate-50/60 px-4 py-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total this month</div>
          <div className="font-semibold tabular-nums text-slate-800">{formatDuration(monthlyTotalMs)}</div>
        </div>
      </div>

      {/* Active shifts */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700">Active shifts</h3>
        <p className="mt-1 text-xs text-slate-500">
          Currently-open shifts visible to you. Duration is calculated live
          from <span className="font-medium">started at</span> to now.
        </p>
        <div className="mt-3">
          {activeShifts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
              No active shifts.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeShifts.map((s) => {
                const user = users.find((u) => u.id === s.cashierId);
                const shop = shops.find((sh) => sh.id === s.shopId);
                return (
                  <div key={s.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm text-slate-800">{user?.name ?? "Unknown user"}</div>
                      <Badge tone={ROLE_TONES[user?.role ?? "CASHIER"]}>{user?.role ?? "—"}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{shop?.name ?? s.shopId}</div>
                    <div className="mt-2 text-xs text-slate-500">Started {formatDateTime(s.startedAt)}</div>
                    <div className="mt-1 text-sm font-semibold tabular-nums text-emerald-700">
                      {formatDuration(getShiftDurationMs(s, now))} so far
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Monthly totals per user */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700">Monthly totals</h3>
        <p className="mt-1 text-xs text-slate-500">
          Hours are attributed to the local calendar month the shift
          started in. A shift that crosses midnight into a new month
          stays in its starting month.
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white">
          <Table className="min-w-[560px]">
            <THead>
              <TR>
                <TH>User</TH>
                <TH>Role</TH>
                <TH>Shop</TH>
                <TH>Shifts</TH>
                <TH>Active</TH>
                <TH className="text-right">Total hours</TH>
              </TR>
            </THead>
            <TBody>
              {perUserRows.length === 0 ? (
                <TR>
                  <TD colSpan={6}>
                    <div className="py-4 text-center text-sm text-slate-500">
                      No work hours found for this month.
                    </div>
                  </TD>
                </TR>
              ) : (
                perUserRows.map((row) => (
                  <TR key={`${row.userId}-${row.shopId}`}>
                    <TD>{row.userName}</TD>
                    <TD><Badge tone={ROLE_TONES[row.role]}>{row.role}</Badge></TD>
                    <TD>{row.shopName}</TD>
                    <TD className="tabular-nums">{row.shiftCount}</TD>
                    <TD className="tabular-nums">{row.openShiftCount}</TD>
                    <TD className="text-right tabular-nums font-medium">{formatDuration(row.totalMs)}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </section>

      {/* Daily records */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700">Shift records in {month}</h3>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white">
          <Table className="min-w-[760px]">
            <THead>
              <TR>
                <TH>User</TH>
                <TH>Role</TH>
                <TH>Shop</TH>
                <TH>Started</TH>
                <TH>Ended</TH>
                <TH>Duration</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {inMonth.length === 0 ? (
                <TR>
                  <TD colSpan={7}>
                    <div className="py-4 text-center text-sm text-slate-500">
                      No shift records found for this month.
                    </div>
                  </TD>
                </TR>
              ) : (
                inMonth
                  .slice()
                  .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                  .map((s) => {
                    const user = users.find((u) => u.id === s.cashierId);
                    const shop = shops.find((sh) => sh.id === s.shopId);
                    return (
                      <TR key={s.id}>
                        <TD>{user?.name ?? "Unknown user"}</TD>
                        <TD><Badge tone={ROLE_TONES[user?.role ?? "CASHIER"]}>{user?.role ?? "—"}</Badge></TD>
                        <TD>{shop?.name ?? s.shopId}</TD>
                        <TD className="text-xs text-slate-600">{formatDateTime(s.startedAt)}</TD>
                        <TD className="text-xs text-slate-600">
                          {s.endedAt ? formatDateTime(s.endedAt) : <span className="text-emerald-700 font-medium">Active</span>}
                        </TD>
                        <TD className="tabular-nums">{formatDuration(getShiftDurationMs(s, now))}</TD>
                        <TD>
                          <Badge tone={s.endedAt ? "slate" : "green"}>
                            {s.endedAt ? "CLOSED" : "OPEN"}
                          </Badge>
                        </TD>
                      </TR>
                    );
                  })
              )}
            </TBody>
          </Table>
        </div>
      </section>
    </div>
  );
};
