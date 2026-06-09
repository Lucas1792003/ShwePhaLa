import { useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { AuditTable } from "../components/audit/AuditTable";
import { SearchInput } from "../components/forms/SearchInput";
import { getEffectiveShopId } from "../lib/utils";

export const AuditPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const auditLogs = useDataStore((state) => state.auditLogs);
  const [search, setSearch] = useState("");

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const logs = currentUser?.role === "ADMIN" ? auditLogs : auditLogs.filter((log) => log.shopId === shopId);
  const filtered = logs.filter((log) => log.message.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card>
      <PageHeader title="Audit Log" subtitle="Key system actions and overrides." />
      <div className="mt-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search audit log" className="md:max-w-md" />
      </div>
      <div className="mt-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            No audit logs yet.
          </div>
        ) : (
          <AuditTable logs={filtered} />
        )}
      </div>
    </Card>
  );
};
