import { useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { ShiftTable } from "../components/shifts/ShiftTable";
import { ShiftDetail } from "../components/shifts/ShiftDetail";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { buildShiftBreakdown } from "../features/shifts/service";
import { downloadCsv } from "../lib/csv";
import { getEffectiveShopId } from "../lib/utils";

export const ShiftsPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const shifts = useDataStore((state) => state.shifts);
  const users = useDataStore((state) => state.users);
  const sales = useDataStore((state) => state.sales);
  const refundVoidRequests = useDataStore((state) => state.refundVoidRequests);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const shopShifts = shifts.filter((shift) => shift.shopId === shopId);
  const selectedShift = shifts.find((shift) => shift.id === selectedShiftId);

  const exportShifts = () => {
    const rows = shopShifts.map((shift) => ({
      cashier: users.find((user) => user.id === shift.cashierId)?.name ?? "",
      startedAt: shift.startedAt,
      endedAt: shift.endedAt ?? "",
      openingCashMmk: shift.openingCashMmk,
      expectedCashMmk: shift.expectedCashMmk ?? 0,
      closingCashMmk: shift.closingCashMmk ?? 0,
      varianceMmk: shift.varianceMmk ?? 0,
    }));
    downloadCsv("shifts.csv", rows);
  };

  return (
    <Card>
      <PageHeader title="Shifts" subtitle="Review cashier sessions." actions={<Button variant="secondary" onClick={exportShifts}>Export CSV</Button>} />
      <div className="mt-6">
        <ShiftTable shifts={shopShifts} users={users} onSelect={setSelectedShiftId} />
      </div>

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
