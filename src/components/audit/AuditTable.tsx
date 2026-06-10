import type { AuditLog, Shop, User } from "../../types";
import { Badge } from "../ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../ui/Table";
import { formatDateTime } from "../../lib/utils";

interface AuditTableProps {
  logs: AuditLog[];
  users: User[];
  shops: Shop[];
}

// Categorize the action type into a badge tone so overrides / deletes stand
// out and creates/edits read at a glance. Substring match keeps it working
// as new action types are added.
const actionTone = (actionType: string): string => {
  const a = actionType.toUpperCase();
  if (a.includes("OVERRIDE")) return "red";
  if (a.includes("DELETE") || a.includes("VOID") || a.includes("REFUND")) return "rose";
  if (a.includes("CREATE")) return "green";
  if (a.includes("EDIT") || a.includes("UPDATE")) return "blue";
  if (a.includes("ADJUST")) return "amber";
  if (a.includes("SALE")) return "emerald";
  if (a.includes("SHIFT")) return "indigo";
  if (a.includes("PAYMENT") || a.includes("RECEIV")) return "teal";
  if (a.includes("APPROV")) return "violet";
  return "slate";
};

const stickyTh = "sticky top-0 z-10 bg-slate-100";

export const AuditTable = ({ logs, users, shops }: AuditTableProps) => {
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const shopName = new Map(shops.map((s) => [s.id, s.name]));

  return (
    <div className="max-h-[70vh] overflow-auto rounded-2xl border border-slate-200/70 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Table className="min-w-[900px]">
        <THead>
          <TR>
            {/* Sticky so the header stays visible while the list scrolls.
                Solid bg + z-index so rows don't show through. */}
            <TH className={stickyTh}>Action</TH>
            <TH className={stickyTh}>Actor</TH>
            <TH className={stickyTh}>Branch</TH>
            <TH className={stickyTh}>Entity</TH>
            <TH className={stickyTh}>Message</TH>
            <TH className={stickyTh}>Time</TH>
          </TR>
        </THead>
        <TBody>
          {logs.map((log) => (
            <TR key={log.id}>
              <TD className="whitespace-nowrap">
                <Badge tone={actionTone(log.actionType)}>{log.actionType}</Badge>
              </TD>
              <TD className="whitespace-nowrap font-medium text-slate-700">
                {userName.get(log.actorId) ?? log.actorId}
              </TD>
              <TD className="whitespace-nowrap text-slate-500">
                {log.shopId ? shopName.get(log.shopId) ?? log.shopId : "—"}
              </TD>
              <TD className="whitespace-nowrap text-slate-500">{log.entityType}</TD>
              <TD>{log.message}</TD>
              <TD className="whitespace-nowrap text-slate-500">{formatDateTime(log.createdAt)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
};
