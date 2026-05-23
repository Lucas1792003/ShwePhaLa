import { useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { useToast } from "../components/ui/Toast";
import { StartShiftCard } from "../components/shifts/StartShiftCard";
import { EndShiftCard } from "../components/shifts/EndShiftCard";
import { ShiftSummary } from "../components/shifts/ShiftSummary";
import { buildShiftBreakdown } from "../features/shifts/service";
import { formatDateTime, getEffectiveShopId } from "../lib/utils";

export const ShiftPage = () => {
  const toast = useToast();
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const shifts = useDataStore((state) => state.shifts);
  const sales = useDataStore((state) => state.sales);
  const refundVoidRequests = useDataStore((state) => state.refundVoidRequests);
  const startShift = useDataStore((state) => state.startShift);
  const endShift = useDataStore((state) => state.endShift);
  const [openingCash, setOpeningCash] = useState(0);
  const [closingCash, setClosingCash] = useState(0);

  if (!currentUser) return null;
  const activeUser = currentUser;
  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);

  const handleStartShift = async () => {
    try {
      await startShift({ shopId, cashierId: activeUser.id, openingCashMmk: openingCash });
    } catch (error) {
      toast({
        title: "Start shift failed",
        description: error instanceof Error ? error.message : "Failed to start shift",
        variant: "error",
      });
    }
  };
  const openShift = shifts.find((shift) => shift.shopId === shopId && shift.cashierId === currentUserId && !shift.endedAt);
  const shiftSales = sales.filter((sale) => sale.shiftId === openShift?.id);
  const breakdown = openShift ? buildShiftBreakdown(openShift, shiftSales, refundVoidRequests) : null;

  const handleEndShift = async () => {
    if (!openShift || !breakdown) return;
    const localVariance = closingCash - breakdown.expectedCash;
    const varianceReason =
      localVariance !== 0
        ? window.prompt("Closing cash does not match expected cash. Enter a variance reason.")?.trim()
        : undefined;
    if (localVariance !== 0 && !varianceReason) return;

    try {
      await endShift({ shiftId: openShift.id, closingCashMmk: closingCash, varianceReason });
      toast({ title: "Shift closed", variant: "success" });
    } catch (error) {
      toast({
        title: "Close shift failed",
        description: error instanceof Error ? error.message : "Failed to close shift",
        variant: "error",
      });
    }
  };

  return (
    <Card>
      <PageHeader title="Shift" subtitle="Start or end your cashier session." />
      {!openShift ? (
        <div className="mt-6 space-y-4">
          <div className="text-sm text-slate-500">No active shift.</div>
          <StartShiftCard
            openingCash={openingCash}
            onOpeningCashChange={setOpeningCash}
            onStart={handleStartShift}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="text-sm text-slate-500">Shift started {formatDateTime(openShift.startedAt)}</div>
          {breakdown && <ShiftSummary shift={openShift} breakdown={breakdown} />}
          <EndShiftCard closingCash={closingCash} onClosingCashChange={setClosingCash} onEnd={handleEndShift} />
        </div>
      )}
    </Card>
  );
};
