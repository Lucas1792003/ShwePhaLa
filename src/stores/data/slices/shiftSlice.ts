import type { StateCreator } from "zustand";
import type { DataState, ShiftState } from "../types";
import type { Shift } from "../../../types";
import { makeId } from "../utils";

export const createShiftSlice: StateCreator<DataState, [], [], ShiftState> = (set, get) => ({
  shifts: [],

  startShift: ({ shopId, cashierId, openingCashMmk }) => {
    const existing = get().shifts.find(
      (shift) => shift.shopId === shopId && shift.cashierId === cashierId && !shift.endedAt
    );
    if (existing) return existing.id;

    const shift: Shift = {
      id: makeId("shift"),
      shopId,
      cashierId,
      startedAt: new Date().toISOString(),
      openingCashMmk,
    };
    set((state) => ({ shifts: [shift, ...state.shifts] }));
    return shift.id;
  },

  endShift: ({ shiftId, closingCashMmk }) =>
    set((state) => {
      const shifts = state.shifts.map((shift) => {
        if (shift.id !== shiftId) return shift;
        const sales = state.sales.filter((sale) => sale.shiftId === shiftId && sale.status !== "VOID");
        const expectedCash = sales
          .filter((sale) => sale.paymentMethod === "CASH")
          .reduce((sum, sale) => sum + sale.totalMmk, 0);
        const variance = closingCashMmk - expectedCash;
        return {
          ...shift,
          endedAt: new Date().toISOString(),
          closingCashMmk,
          expectedCashMmk: expectedCash,
          varianceMmk: variance,
        };
      });
      return { shifts };
    }),

  requireShiftForCashier: (shopId: string, cashierId: string) =>
    get().shifts.find((shift) => shift.shopId === shopId && shift.cashierId === cashierId && !shift.endedAt),
});
