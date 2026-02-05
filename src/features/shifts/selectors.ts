import type { Sale, Shift } from "../../types";

export const getShiftSales = (sales: Sale[], shiftId?: string) => sales.filter((sale) => sale.shiftId === shiftId);

export const getOpenShift = (shifts: Shift[], shopId: string, cashierId?: string | null) =>
  shifts.find((shift) => shift.shopId === shopId && shift.cashierId === cashierId && !shift.endedAt);
