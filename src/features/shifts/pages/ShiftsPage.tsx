import { useEffect, useMemo, useState } from "react";
import type { Role, Shift } from "../../../types";
import { useAuthStore } from "../../../stores/authStore";
import { useAppStore } from "../../../stores/appStore";
import { useDataStore } from "../../../stores/dataStore";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Tabs } from "../../../components/ui/Tabs";
import { Select } from "../../../components/ui/Select";
import { useToast } from "../../../components/ui/Toast";
import { ShiftTable } from "../../../components/shifts/ShiftTable";
import { ShiftDetail } from "../../../components/shifts/ShiftDetail";
import { ShiftSummary } from "../../../components/shifts/ShiftSummary";
import { StartShiftCard } from "../../../components/shifts/StartShiftCard";
import { EndShiftCard } from "../../../components/shifts/EndShiftCard";
import { buildShiftBreakdown } from "../service";
import { downloadCsv } from "../../../lib/csv";
import { formatDateTime, getEffectiveShopId } from "../../../lib/utils";
import { getErrorMessage } from "../../../lib/errors";
import { hasPermission } from "../../../lib/permissions";
import { WorkHoursPanel } from "../components/WorkHoursPanel";
import { formatDuration, getShiftDurationMs } from "../workHours";

// Unified Shifts page.
//
// One page for every role. The page does three things:
//   1) Lets the operator open/close their OWN shift (admin/manager become
//      the cashier of record — the open_shift RPC validates either
//      shift:manage_own or shift:manage_all per migration 009).
//   2) Shows a "Shift Records" tab with the shifts the operator is
//      allowed to see (RLS enforces row scope; the UI surfaces only what
//      the RLS will return).
//   3) Shows a "Work Hours" tab driven by the helpers in workHours.ts.
//
// Permission scope (RLS reference: 015_permission_gated_select_rls.sql):
//   ADMIN    — all shifts in all shops; shop and user filters.
//   MANAGER  — shifts in their assigned shop; user filter.
//   CASHIER  — only their own shifts.
//
// ADMIN-specific rule: an admin MUST have a shop selected in the shop
// switcher before they can open a shift. There is no fallback shop and
// the backend rejects a blank shop_id (migration 009 line 65).

const ROLE_TONES: Record<Role, "amber" | "red" | "green" | "blue" | "slate"> = {
  ADMIN: "red",
  MANAGER: "amber",
  CASHIER: "green",
  BUYER: "blue",
};

type TabId = "records" | "hours";

export const ShiftsPage = () => {
  const toast = useToast();
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const users = useDataStore((state) => state.users);
  const shifts = useDataStore((state) => state.shifts);
  const sales = useDataStore((state) => state.sales);
  const refundVoidRequests = useDataStore((state) => state.refundVoidRequests);
  const startShift = useDataStore((state) => state.startShift);
  const endShift = useDataStore((state) => state.endShift);

  const [activeTab, setActiveTab] = useState<TabId>("records");
  const [openingCash, setOpeningCash] = useState(0);
  const [closingCash, setClosingCash] = useState(0);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [recordsShopFilter, setRecordsShopFilter] = useState<string>("all");
  const [recordsUserFilter, setRecordsUserFilter] = useState<string>("all");

  // Tick once a minute so live durations on open shifts move forward
  // without each row owning its own interval.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(handle);
  }, []);

  if (!currentUser) return null;
  const role = currentUser.role;

  // The shop the operator can act in personally.
  //   ADMIN  — whichever shop they picked in the switcher (may be empty)
  //   others — their assigned shop
  const personalShopId =
    role === "ADMIN"
      ? getEffectiveShopId(currentUser, currentShopId, shops)
      : currentUser.shopId ?? "";
  const personalShop = shops.find((s) => s.id === personalShopId);
  const personalShopMissing = !personalShopId;

  // Visible shifts. RLS will independently strip rows the role cannot
  // read; this client-side filter just mirrors that so the UI stays
  // consistent when state is loaded but RLS is stricter than expected.
  const visibleShifts = useMemo(() => {
    if (role === "ADMIN") return shifts;
    if (role === "MANAGER") return shifts.filter((s) => s.shopId === currentUser.shopId);
    return shifts.filter((s) => s.cashierId === currentUser.id); // CASHIER + BUYER fallthrough
  }, [shifts, role, currentUser]);

  // The operator's own currently-open shift, if any. There is at most
  // one globally per cashier (enforced by `shifts_one_open_per_cashier_shop`
  // + the advisory lock in open_shift).
  const ownOpenShift = useMemo(
    () => shifts.find((s) => s.cashierId === currentUser.id && !s.endedAt),
    [shifts, currentUser.id]
  );

  // Permission gates. Per migration 014 defaults, ADMIN + MANAGER hold
  // both shift:manage_own and shift:manage_all; CASHIER holds only
  // shift:manage_own.
  const canOpenOwn = hasPermission(currentUser, "shift:manage_own");

  const handleStartShift = async () => {
    if (!personalShopId) {
      toast({
        title: "Select a shop first",
        description:
          role === "ADMIN"
            ? "Pick a shop from the switcher before opening a shift."
            : "Contact your administrator — your account is not assigned to a shop.",
        variant: "error",
      });
      return;
    }
    try {
      await startShift({
        shopId: personalShopId,
        cashierId: currentUser.id,
        openingCashMmk: openingCash,
      });
      toast({ title: "Shift opened", variant: "success" });
      setOpeningCash(0);
    } catch (error) {
      toast({
        title: "Could not open shift",
        description: getErrorMessage(error, "Failed to open shift."),
        variant: "error",
      });
    }
  };

  const handleEndShift = async () => {
    if (!ownOpenShift) return;
    const breakdown = buildShiftBreakdown(
      ownOpenShift,
      sales.filter((sale) => sale.shiftId === ownOpenShift.id),
      refundVoidRequests
    );
    const localVariance = closingCash - breakdown.expectedCash;
    const varianceReason =
      localVariance !== 0
        ? window.prompt("Closing cash does not match expected cash. Enter a variance reason.")?.trim()
        : undefined;
    if (localVariance !== 0 && !varianceReason) return;

    try {
      await endShift({ shiftId: ownOpenShift.id, closingCashMmk: closingCash, varianceReason });
      toast({ title: "Shift closed", variant: "success" });
      setClosingCash(0);
    } catch (error) {
      toast({
        title: "Could not close shift",
        description: getErrorMessage(error, "Failed to close shift."),
        variant: "error",
      });
    }
  };

  // ============================================================
  // Records tab
  // ============================================================
  const recordsShopOptions = useMemo(() => {
    if (role !== "ADMIN") return [];
    return shops
      .filter((s) => s.isActive || visibleShifts.some((sh) => sh.shopId === s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [role, shops, visibleShifts]);

  const recordsUserOptions = useMemo(() => {
    if (role === "CASHIER") return [];
    const seen = new Set<string>();
    const opts: { id: string; name: string }[] = [];
    for (const s of visibleShifts) {
      if (seen.has(s.cashierId)) continue;
      seen.add(s.cashierId);
      const u = users.find((user) => user.id === s.cashierId);
      opts.push({ id: s.cashierId, name: u?.name ?? "Unknown user" });
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleShifts, users, role]);

  const filteredRecords = useMemo(() => {
    let list = visibleShifts;
    if (role === "ADMIN" && recordsShopFilter !== "all") {
      list = list.filter((s) => s.shopId === recordsShopFilter);
    }
    if (role !== "CASHIER" && recordsUserFilter !== "all") {
      list = list.filter((s) => s.cashierId === recordsUserFilter);
    }
    return list.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [visibleShifts, role, recordsShopFilter, recordsUserFilter]);

  const selectedShift: Shift | undefined = useMemo(
    () => shifts.find((s) => s.id === selectedShiftId),
    [shifts, selectedShiftId]
  );

  const exportShifts = () => {
    const rows = filteredRecords.map((shift) => ({
      cashier: users.find((user) => user.id === shift.cashierId)?.name ?? "",
      role: users.find((user) => user.id === shift.cashierId)?.role ?? "",
      shop: shops.find((s) => s.id === shift.shopId)?.name ?? shift.shopId,
      startedAt: shift.startedAt,
      endedAt: shift.endedAt ?? "",
      durationMinutes: Math.floor(getShiftDurationMs(shift, now) / 60000),
      openingCashMmk: shift.openingCashMmk,
      expectedCashMmk: shift.expectedCashMmk ?? 0,
      closingCashMmk: shift.closingCashMmk ?? 0,
      varianceMmk: shift.varianceMmk ?? 0,
      varianceReason: shift.varianceReason ?? "",
    }));
    downloadCsv("shifts.csv", rows);
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <Card>
      <PageHeader
        title="Shifts"
        subtitle="Open or close your shift, review sessions, and check work hours."
        actions={
          activeTab === "records" && filteredRecords.length > 0 ? (
            <Button variant="secondary" onClick={exportShifts}>Export CSV</Button>
          ) : undefined
        }
      />

      {/* Own active shift / open form. Visible to anyone who holds
          shift:manage_own (ADMIN, MANAGER, CASHIER). */}
      {canOpenOwn && (
        <div className="mt-6 rounded-2xl border border-slate-200/70 bg-slate-50/40 p-4">
          {ownOpenShift ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Your active shift</div>
                  <div className="text-sm font-semibold text-slate-800">
                    {shops.find((s) => s.id === ownOpenShift.shopId)?.name ?? ownOpenShift.shopId}
                    {" · "}
                    started {formatDateTime(ownOpenShift.startedAt)}
                  </div>
                </div>
                <Badge tone="green">
                  Open · {formatDuration(getShiftDurationMs(ownOpenShift, now))}
                </Badge>
              </div>
              <ShiftSummary
                shift={ownOpenShift}
                breakdown={buildShiftBreakdown(
                  ownOpenShift,
                  sales.filter((sale) => sale.shiftId === ownOpenShift.id),
                  refundVoidRequests
                )}
              />
              <EndShiftCard
                closingCash={closingCash}
                onClosingCashChange={setClosingCash}
                onEnd={handleEndShift}
              />
            </div>
          ) : personalShopMissing ? (
            <div className="text-sm text-slate-600">
              {role === "ADMIN" ? (
                <>Select a shop to open a shift. Pick one from the shop switcher at the top of the page.</>
              ) : (
                <>Your account is not assigned to a shop. Contact your administrator.</>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-slate-600">
                No active shift. Open one for{" "}
                <span className="font-semibold text-slate-800">{personalShop?.name ?? personalShopId}</span>.
              </div>
              <StartShiftCard
                openingCash={openingCash}
                onOpeningCashChange={setOpeningCash}
                onStart={handleStartShift}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <Tabs
          tabs={[
            { id: "records", label: "Shift Records" },
            { id: "hours", label: "Work Hours" },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as TabId)}
        />
      </div>

      {activeTab === "records" && (
        <div className="mt-5 space-y-4">
          {(role === "ADMIN" || role === "MANAGER") && (
            <div className="flex flex-wrap items-end gap-3">
              {role === "ADMIN" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Shop</label>
                  <Select
                    value={recordsShopFilter}
                    onChange={(e) => setRecordsShopFilter(e.target.value)}
                    className="w-48"
                  >
                    <option value="all">All shops</option>
                    {recordsShopOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">User</label>
                <Select
                  value={recordsUserFilter}
                  onChange={(e) => setRecordsUserFilter(e.target.value)}
                  className="w-52"
                >
                  <option value="all">All users</option>
                  {recordsUserOptions.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </div>
              <div className="ml-auto text-xs text-slate-500">
                {filteredRecords.length} shift{filteredRecords.length === 1 ? "" : "s"}
              </div>
            </div>
          )}

          {filteredRecords.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
              No shift records to show.
              {role === "CASHIER" && " Open a shift above to start your first record."}
            </div>
          ) : (
            <>
              {(role === "ADMIN" || role === "MANAGER") ? (
                <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white">
                  <table className="w-full min-w-[720px] text-sm text-slate-700">
                    <thead className="bg-slate-100/80 text-left text-[11px] uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-3 font-semibold">User</th>
                        <th className="px-3 py-3 font-semibold">Role</th>
                        <th className="px-3 py-3 font-semibold">Shop</th>
                        <th className="px-3 py-3 font-semibold">Started</th>
                        <th className="px-3 py-3 font-semibold">Duration</th>
                        <th className="px-3 py-3 font-semibold">Status</th>
                        <th className="px-3 py-3 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80">
                      {filteredRecords.map((s) => {
                        const user = users.find((u) => u.id === s.cashierId);
                        const shop = shops.find((sh) => sh.id === s.shopId);
                        return (
                          <tr key={s.id}>
                            <td className="px-3 py-3">{user?.name ?? "Unknown user"}</td>
                            <td className="px-3 py-3">
                              <Badge tone={ROLE_TONES[user?.role ?? "CASHIER"]}>{user?.role ?? "—"}</Badge>
                            </td>
                            <td className="px-3 py-3">{shop?.name ?? s.shopId}</td>
                            <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(s.startedAt)}</td>
                            <td className="px-3 py-3 tabular-nums">{formatDuration(getShiftDurationMs(s, now))}</td>
                            <td className="px-3 py-3">
                              <Badge tone={s.endedAt ? "slate" : "green"}>
                                {s.endedAt ? "CLOSED" : "OPEN"}
                              </Badge>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <Button variant="secondary" size="sm" onClick={() => setSelectedShiftId(s.id)}>
                                View
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <ShiftTable shifts={filteredRecords} users={users} onSelect={setSelectedShiftId} />
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "hours" && (
        <div className="mt-5">
          <WorkHoursPanel
            shifts={visibleShifts}
            users={users}
            shops={shops}
            viewerRole={role}
            viewerAssignedShopId={currentUser.shopId}
            now={now}
          />
        </div>
      )}

      <Modal
        open={!!selectedShift}
        onClose={() => setSelectedShiftId(null)}
        title="Shift summary"
        description="Totals for this cashier session."
        footer={<Button onClick={() => setSelectedShiftId(null)}>Close</Button>}
      >
        {selectedShift && (
          <ShiftDetail
            shift={selectedShift}
            cashierName={users.find((user) => user.id === selectedShift.cashierId)?.name}
            breakdown={buildShiftBreakdown(
              selectedShift,
              sales.filter((sale) => sale.shiftId === selectedShift.id),
              refundVoidRequests
            )}
          />
        )}
      </Modal>
    </Card>
  );
};
