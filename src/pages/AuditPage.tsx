import { useMemo, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { AuditTable } from "../components/audit/AuditTable";
import { SearchInput } from "../components/forms/SearchInput";
import { Select } from "../components/ui/Select";
import { DateRangePicker } from "../components/forms/DateRangePicker";
import { getEffectiveShopId } from "../lib/utils";

export const AuditPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const users = useDataStore((state) => state.users);
  const shops = useDataStore((state) => state.shops);
  const auditLogs = useDataStore((state) => state.auditLogs);
  const { currentShopId } = useAppStore();

  const [search, setSearch] = useState("");
  const [actionType, setActionType] = useState("all");
  const [actorId, setActorId] = useState("all");
  const [shopFilter, setShopFilter] = useState("all");
  const [range, setRange] = useState({ start: "", end: "" });

  const currentUser = users.find((user) => user.id === currentUserId);
  const isAdmin = currentUser?.role === "ADMIN";
  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const shopsById = useMemo(() => new Map(shops.map((s) => [s.id, s.name])), [shops]);

  // Scope: admins see every shop's log; everyone else only their own shop.
  const scoped = useMemo(
    () => (isAdmin ? auditLogs : auditLogs.filter((log) => log.shopId === shopId)),
    [auditLogs, isAdmin, shopId],
  );

  // Filter dropdown options, derived from what's actually in the log.
  const actionTypes = useMemo(
    () => [...new Set(scoped.map((log) => log.actionType))].sort(),
    [scoped],
  );
  const actorsInLog = useMemo(
    () =>
      [...new Set(scoped.map((log) => log.actorId))]
        .map((id) => ({ id, name: usersById.get(id) ?? id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [scoped, usersById],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return scoped.filter((log) => {
      if (actionType !== "all" && log.actionType !== actionType) return false;
      if (actorId !== "all" && log.actorId !== actorId) return false;
      if (isAdmin && shopFilter !== "all" && log.shopId !== shopFilter) return false;
      const date = log.createdAt.slice(0, 10);
      if (range.start && date < range.start) return false;
      if (range.end && date > range.end) return false;
      if (term) {
        const haystack = [
          log.actionType,
          log.message,
          log.entityType,
          usersById.get(log.actorId) ?? log.actorId,
          log.shopId ? shopsById.get(log.shopId) ?? log.shopId : "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [scoped, search, actionType, actorId, shopFilter, isAdmin, range, usersById, shopsById]);

  return (
    <Card>
      <PageHeader title="Audit Log" subtitle="Key system actions and overrides." />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search action, actor, message…"
          className="min-w-64 flex-1 md:w-72 md:flex-none"
        />
        <Select value={actionType} onChange={(e) => setActionType(e.target.value)} className="min-w-40 flex-1 md:w-auto md:flex-none">
          <option value="all">All actions</option>
          {actionTypes.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>
        <Select value={actorId} onChange={(e) => setActorId(e.target.value)} className="min-w-40 flex-1 md:w-auto md:flex-none">
          <option value="all">All users</option>
          {actorsInLog.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
        {isAdmin && (
          <Select value={shopFilter} onChange={(e) => setShopFilter(e.target.value)} className="min-w-40 flex-1 md:w-auto md:flex-none">
            <option value="all">All shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        )}
        <DateRangePicker start={range.start} end={range.end} onChange={setRange} />
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {filtered.length} {filtered.length === 1 ? "action" : "actions"}
          {filtered.length !== scoped.length ? ` of ${scoped.length}` : ""}
        </span>
      </div>
      <div className="mt-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            No audit logs found.
          </div>
        ) : (
          <AuditTable logs={filtered} users={users} shops={shops} />
        )}
      </div>
    </Card>
  );
};
