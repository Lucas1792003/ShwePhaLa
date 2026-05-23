import type { Sale, User } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Table, TBody, TD, TH, THead, TR } from "../ui/Table";
import { formatDateTime, formatMmk } from "../../lib/utils";

interface SalesTableProps {
  sales: Sale[];
  users: User[];
  onView: (saleId: string) => void;
}

export const SalesTable = ({ sales, users, onView }: SalesTableProps) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white">
    <Table className="min-w-[720px]">
      <THead>
        <TR>
          <TH>Receipt</TH>
          <TH>Time</TH>
          <TH>Cashier</TH>
          <TH>Payment</TH>
          <TH>Status</TH>
          <TH>Total</TH>
          <TH></TH>
        </TR>
      </THead>
      <TBody>
        {sales.map((sale) => {
          const cashier = users.find((user) => user.id === sale.cashierId);
          return (
            <TR key={sale.id}>
              <TD>{sale.receiptNo}</TD>
              <TD>{formatDateTime(sale.createdAt)}</TD>
              <TD>{cashier?.name}</TD>
              <TD>{sale.paymentMethod}</TD>
              <TD>
                <Badge tone={sale.status === "NORMAL" ? "green" : sale.status === "VOID" ? "red" : "amber"}>{sale.status}</Badge>
              </TD>
              <TD>{formatMmk(sale.totalMmk)}</TD>
              <TD>
                <Button variant="secondary" size="sm" onClick={() => onView(sale.id)}>
                  View receipt
                </Button>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  </div>
);
