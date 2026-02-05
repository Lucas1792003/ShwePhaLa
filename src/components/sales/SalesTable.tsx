import type { Sale, User } from "../../types";
import { Badge } from "../ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../ui/Table";
import { formatDateTime, formatMmk } from "../../lib/utils";

interface SalesTableProps {
  sales: Sale[];
  users: User[];
  onSelect: (saleId: string) => void;
}

export const SalesTable = ({ sales, users, onSelect }: SalesTableProps) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
    <Table>
      <THead>
        <TR>
          <TH>Receipt</TH>
          <TH>Time</TH>
          <TH>Cashier</TH>
          <TH>Status</TH>
          <TH>Total</TH>
        </TR>
      </THead>
      <TBody>
        {sales.map((sale) => {
          const cashier = users.find((user) => user.id === sale.cashierId);
          return (
            <TR key={sale.id} className="cursor-pointer transition hover:bg-slate-50/80" onClick={() => onSelect(sale.id)}>
              <TD>{sale.receiptNo}</TD>
              <TD>{formatDateTime(sale.createdAt)}</TD>
              <TD>{cashier?.name}</TD>
              <TD>
                <Badge tone={sale.status === "NORMAL" ? "green" : sale.status === "VOID" ? "red" : "amber"}>{sale.status}</Badge>
              </TD>
              <TD>{formatMmk(sale.totalMmk)}</TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  </div>
);
