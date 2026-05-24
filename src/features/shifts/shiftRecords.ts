import type { Refund, Role, Sale, Shift, Shop, User } from "../../types";
import { hasPermission, hasShopPermission } from "../../lib/permissions";
import { buildShiftBreakdown } from "./service";
import { formatDuration, getShiftDurationMs, isShiftInMonth } from "./workHours";

export type ShiftStatusFilter = "all" | "open" | "closed";

export interface ShiftRecordFilters {
  month?: string;
  status?: ShiftStatusFilter;
  shopId?: string;
  userId?: string;
}

export interface CloseShiftValidationInput {
  closingCash: number | undefined;
  expectedCash: number;
  varianceReason?: string;
}

export interface CloseShiftValidationResult {
  variance: number | null;
  canClose: boolean;
  error: string | null;
}

export const getVisibleShiftsForUser = (shifts: Shift[], user: User | null | undefined): Shift[] => {
  if (!user || !hasPermission(user, "shift:manage_own")) return [];
  if (user.role === "ADMIN") return shifts;
  if (user.role === "MANAGER") return shifts.filter((shift) => shift.shopId === user.shopId);
  if (user.role === "CASHIER") return shifts.filter((shift) => shift.cashierId === user.id);
  return [];
};

export const filterShiftRecords = (shifts: Shift[], filters: ShiftRecordFilters): Shift[] => {
  let list = shifts;
  if (filters.month && filters.month !== "all") {
    list = list.filter((shift) => isShiftInMonth(shift, filters.month as string));
  }
  if (filters.status === "open") {
    list = list.filter((shift) => !shift.endedAt);
  } else if (filters.status === "closed") {
    list = list.filter((shift) => !!shift.endedAt);
  }
  if (filters.shopId && filters.shopId !== "all") {
    list = list.filter((shift) => shift.shopId === filters.shopId);
  }
  if (filters.userId && filters.userId !== "all") {
    list = list.filter((shift) => shift.cashierId === filters.userId);
  }
  return list.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
};

export const canUserCloseShift = (user: User | null | undefined, shift: Shift): boolean => {
  if (!user || shift.endedAt) return false;
  const canCloseOwn =
    shift.cashierId === user.id && hasShopPermission(user, "shift:manage_own", shift.shopId);
  const canCloseManaged = hasShopPermission(user, "shift:manage_all", shift.shopId);
  return canCloseOwn || canCloseManaged;
};

export const calculateClosingVariance = (
  closingCash: number | undefined,
  expectedCash: number
): number | null => {
  if (closingCash === undefined) return null;
  if (!Number.isFinite(closingCash) || !Number.isFinite(expectedCash)) return null;
  return closingCash - expectedCash;
};

export const validateCloseShift = ({
  closingCash,
  expectedCash,
  varianceReason,
}: CloseShiftValidationInput): CloseShiftValidationResult => {
  const variance = calculateClosingVariance(closingCash, expectedCash);
  if (closingCash === undefined) {
    return { variance, canClose: false, error: "Enter closing cash before ending the shift." };
  }
  if (!Number.isFinite(closingCash) || closingCash < 0) {
    return { variance, canClose: false, error: "Closing cash must be zero or greater." };
  }
  if (!Number.isFinite(expectedCash)) {
    return { variance, canClose: false, error: "Expected cash is not available yet." };
  }
  if (variance !== 0 && (varianceReason ?? "").trim() === "") {
    return { variance, canClose: false, error: "Enter a variance reason before ending the shift." };
  }
  return { variance, canClose: true, error: null };
};

export const getSalesForShift = (sales: Sale[], shiftId: string): Sale[] =>
  sales.filter((sale) => sale.shiftId === shiftId);

export const buildShiftCsvRows = (
  shifts: Shift[],
  users: User[],
  shops: Shop[],
  sales: Sale[],
  refunds: Refund[],
  now: Date
): Record<string, string | number>[] =>
  shifts.map((shift) => {
    const user = users.find((item) => item.id === shift.cashierId);
    const shop = shops.find((item) => item.id === shift.shopId);
    const breakdown = buildShiftBreakdown(shift, getSalesForShift(sales, shift.id), refunds);
    const isClosed = !!shift.endedAt;

    return {
      cashier: user?.name ?? "Unknown user",
      role: user?.role ?? ("CASHIER" as Role),
      shop: shop?.name ?? shift.shopId,
      started_at: shift.startedAt,
      ended_at: shift.endedAt ?? "",
      duration: formatDuration(getShiftDurationMs(shift, now)),
      status: isClosed ? "Closed" : "Open",
      opening_cash: shift.openingCashMmk,
      expected_cash: breakdown.expectedCash,
      closing_cash: isClosed ? shift.closingCashMmk ?? 0 : "",
      variance: isClosed ? shift.varianceMmk ?? 0 : "",
      sales_count: breakdown.salesCount,
      variance_reason: shift.varianceReason ?? "",
    };
  });
