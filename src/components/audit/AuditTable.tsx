import type { AuditLog } from "../../types";
import { Table, TBody, TD, TH, THead, TR } from "../ui/Table";
import { formatDateTime } from "../../lib/utils";

interface AuditTableProps {
  logs: AuditLog[];
}

export const AuditTable = ({ logs }: AuditTableProps) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
    <Table>
      <THead>
        <TR>
          <TH>Action</TH>
          <TH>Message</TH>
          <TH>Time</TH>
        </TR>
      </THead>
      <TBody>
        {logs.map((log) => (
          <TR key={log.id}>
            <TD>{log.actionType}</TD>
            <TD>{log.message}</TD>
            <TD>{formatDateTime(log.createdAt)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  </div>
);
