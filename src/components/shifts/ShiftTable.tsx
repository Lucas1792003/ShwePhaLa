import type { Shift, User } from "../../types";
import { Button } from "../ui/Button";
import { Table, TBody, TD, TH, THead, TR } from "../ui/Table";
import { formatDateTime } from "../../lib/utils";

interface ShiftTableProps {
  shifts: Shift[];
  users: User[];
  onSelect: (shiftId: string) => void;
}

export const ShiftTable = ({ shifts, users, onSelect }: ShiftTableProps) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
    <Table>
      <THead>
        <TR>
          <TH>Cashier</TH>
          <TH>Start</TH>
          <TH>Status</TH>
          <TH></TH>
        </TR>
      </THead>
      <TBody>
        {shifts.map((shift) => (
          <TR key={shift.id}>
            <TD>{users.find((user) => user.id === shift.cashierId)?.name}</TD>
            <TD>{formatDateTime(shift.startedAt)}</TD>
            <TD>{shift.endedAt ? "Closed" : "Open"}</TD>
            <TD>
              <Button variant="secondary" size="sm" onClick={() => onSelect(shift.id)}>
                View
              </Button>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  </div>
);
