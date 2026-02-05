import { useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { StartShiftCard } from "../components/shifts/StartShiftCard";
import { EndShiftCard } from "../components/shifts/EndShiftCard";
import { ShiftSummary } from "../components/shifts/ShiftSummary";
import { formatDateTime, getEffectiveShopId } from "../lib/utils";

export const ShiftPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const shifts = useDataStore((state) => state.shifts);
  const sales = useDataStore((state) => state.sales);
  const startShift = useDataStore((state) => state.startShift);
  const endShift = useDataStore((state) => state.endShift);
  const [openingCash, setOpeningCash] = useState(0);
  const [closingCash, setClosingCash] = useState(0);

  if (!currentUser) return null;
  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const openShift = shifts.find((shift) => shift.shopId === shopId && shift.cashierId === currentUserId && !shift.endedAt);
  const shiftSales = sales.filter((sale) => sale.shiftId === openShift?.id && sale.status !== "VOID");
  const totalSales = shiftSales.reduce((sum, sale) => sum + sale.totalMmk, 0);
  const cashSales = shiftSales.filter((sale) => sale.paymentMethod === "CASH").reduce((sum, sale) => sum + sale.totalMmk, 0);
  const otherSales = totalSales - cashSales;

  return (
    <Card>
      <PageHeader title="Shift" subtitle="Start or end your cashier session." />
      {!openShift ? (
        <div className="mt-6 space-y-4">
          <div className="text-sm text-slate-500">No active shift.</div>
          <StartShiftCard
            openingCash={openingCash}
            onOpeningCashChange={setOpeningCash}
            onStart={() => startShift({ shopId, cashierId: currentUser.id, openingCashMmk: openingCash })}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="text-sm text-slate-500">Shift started {formatDateTime(openShift.startedAt)}</div>
          <ShiftSummary saleCount={shiftSales.length} cashTotal={cashSales} otherTotal={otherSales} />
          <EndShiftCard closingCash={closingCash} onClosingCashChange={setClosingCash} onEnd={() => endShift({ shiftId: openShift.id, closingCashMmk: closingCash })} />
        </div>
      )}
    </Card>
  );
};
