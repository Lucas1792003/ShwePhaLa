import type { StateCreator } from "zustand";
import type { DataState, ShiftState } from "../types";
import type { AuditLog, Shift } from "../../../types";
import { supabase } from "../../../lib/supabase";

interface ShiftRpcResult {
  shift: Shift;
  auditLogs: AuditLog[];
}

const replaceShift = (shifts: Shift[], shift: Shift): Shift[] => {
  const exists = shifts.some((item) => item.id === shift.id);
  if (!exists) return [shift, ...shifts];
  return shifts.map((item) => (item.id === shift.id ? shift : item));
};

export const createShiftSlice: StateCreator<DataState, [], [], ShiftState> = (set, get) => ({
  shifts: [],

  startShift: async ({ shopId, cashierId, openingCashMmk }) => {
    const existing = get().shifts.find((shift) => shift.cashierId === cashierId && !shift.endedAt);
    if (existing) return existing.id;

    const { data, error } = await supabase.rpc("open_shift", {
      p_shop_id: shopId,
      p_opening_cash_mmk: openingCashMmk,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Open shift returned no data.");

    const result = data as ShiftRpcResult;
    set((state) => ({
      shifts: replaceShift(state.shifts, result.shift),
      auditLogs: [...result.auditLogs, ...state.auditLogs],
    }));
    return result.shift.id;
  },

  endShift: async ({ shiftId, closingCashMmk, varianceReason }) => {
    const { data, error } = await supabase.rpc("close_shift", {
      p_shift_id: shiftId,
      p_closing_cash_mmk: closingCashMmk,
      p_variance_reason: varianceReason ?? null,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Close shift returned no data.");

    const result = data as ShiftRpcResult;
    set((state) => ({
      shifts: replaceShift(state.shifts, result.shift),
      auditLogs: [...result.auditLogs, ...state.auditLogs],
    }));
  },

  requireShiftForCashier: (shopId: string, cashierId: string) =>
    get().shifts.find((shift) => shift.shopId === shopId && shift.cashierId === cashierId && !shift.endedAt),
});
