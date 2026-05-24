import type { Role, Shift, Shop, User } from "../../types";

// ============================================================
// Work-hour helpers
//
// The whole "Work Hours" tab is driven by a single, deterministic set of
// functions so the UI never disagrees with the totals. The cross-midnight /
// cross-month rule is intentionally simple:
//
//   A shift is attributed to the month its `startedAt` falls in. Even a
//   shift that crosses midnight into the next month counts for the month
//   it began.
//
// Rationale (MVP):
//   * Cashier sessions are short — split-by-actual-overlap would add
//     complexity for a few rare minutes of error.
//   * Matches the close_shift cash reconciliation, which is anchored on
//     opening_cash captured at `startedAt`.
//   * Mirrors how the existing `shift-open-a` style daily reports already
//     bucket sales (by `created_at` of the shift's first sale).
//
// A future enhancement could split duration across calendar months; if you
// implement that, add an explicit migration note + bump these helpers'
// behaviour together with a test update.
// ============================================================

/** YYYY-MM string for a Date. Always local time. */
export const monthKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

/** Parse a "YYYY-MM" string to the first instant of that month (local). */
const startOfMonth = (key: string): Date | null => {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (Number.isNaN(year) || Number.isNaN(month) || month < 0 || month > 11) return null;
  return new Date(year, month, 1, 0, 0, 0, 0);
};

/** Parse a "YYYY-MM" string to the first instant of the NEXT month (local). */
const startOfNextMonth = (key: string): Date | null => {
  const start = startOfMonth(key);
  if (!start) return null;
  return new Date(start.getFullYear(), start.getMonth() + 1, 1, 0, 0, 0, 0);
};

/**
 * Duration of a shift in milliseconds.
 *
 *  - Closed shift: endedAt - startedAt.
 *  - Open shift:   now - startedAt.
 *  - Bad / missing dates: 0 (never negative).
 *
 * `now` is injectable so the UI's live "tick every minute" effect and the
 * tests share the same code path.
 */
export const getShiftDurationMs = (shift: Shift, now: Date = new Date()): number => {
  const startMs = Date.parse(shift.startedAt);
  if (!Number.isFinite(startMs)) return 0;

  const endMs = shift.endedAt ? Date.parse(shift.endedAt) : now.getTime();
  if (!Number.isFinite(endMs)) return 0;

  const diff = endMs - startMs;
  return diff > 0 ? diff : 0;
};

/**
 * Render a millisecond duration as `Xh Ym`.
 *
 *  - 0 ms                  -> "0h 0m"
 *  - rounded DOWN to the minute (a 119s shift shows "0h 1m" once it ticks)
 *  - hours can exceed 24   -> "42h 30m" for a monthly total
 *  - negative / NaN         -> "0h 0m"
 */
export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return "0h 0m";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
};

/**
 * Whether a shift counts towards a given month per the MVP rule
 * ("attributed to the month of `startedAt`").
 *
 * `monthYYYYMM` is "YYYY-MM" so the caller can pass an `<input type="month">`
 * value straight in.
 */
export const isShiftInMonth = (shift: Shift, monthYYYYMM: string): boolean => {
  const start = startOfMonth(monthYYYYMM);
  const end = startOfNextMonth(monthYYYYMM);
  if (!start || !end) return false;
  const startMs = Date.parse(shift.startedAt);
  if (!Number.isFinite(startMs)) return false;
  return startMs >= start.getTime() && startMs < end.getTime();
};

/**
 * Sum of shift durations for the given month.
 * Uses the same attribution rule as `isShiftInMonth`.
 */
export const getMonthlyShiftHoursMs = (
  shifts: Shift[],
  monthYYYYMM: string,
  now: Date = new Date()
): number => {
  return shifts
    .filter((s) => isShiftInMonth(s, monthYYYYMM))
    .reduce((sum, s) => sum + getShiftDurationMs(s, now), 0);
};

export interface UserMonthlyHours {
  userId: string;
  userName: string;
  role: Role;
  shopId: string;
  shopName: string;
  shiftCount: number;
  openShiftCount: number;
  totalMs: number;
}

/**
 * Group shifts by cashier into one row per (user, shop) showing their
 * shift count, open count and total duration for the month.
 *
 * Rows where the cashier has been deleted are still returned with a
 * synthetic placeholder name; we never silently drop history.
 */
export const groupShiftHoursByUser = (
  shifts: Shift[],
  users: User[],
  shops: Shop[],
  monthYYYYMM: string,
  now: Date = new Date()
): UserMonthlyHours[] => {
  const inMonth = shifts.filter((s) => isShiftInMonth(s, monthYYYYMM));

  // Key by (userId, shopId) so the same admin opening in two different
  // shops in the same month still produces one row per shop.
  const buckets = new Map<string, UserMonthlyHours>();
  for (const shift of inMonth) {
    const key = `${shift.cashierId}::${shift.shopId}`;
    const user = users.find((u) => u.id === shift.cashierId);
    const shop = shops.find((s) => s.id === shift.shopId);
    const row =
      buckets.get(key) ??
      {
        userId: shift.cashierId,
        userName: user?.name ?? "Unknown user",
        role: (user?.role ?? "CASHIER") as Role,
        shopId: shift.shopId,
        shopName: shop?.name ?? shift.shopId,
        shiftCount: 0,
        openShiftCount: 0,
        totalMs: 0,
      };
    row.shiftCount += 1;
    if (!shift.endedAt) row.openShiftCount += 1;
    row.totalMs += getShiftDurationMs(shift, now);
    buckets.set(key, row);
  }

  return [...buckets.values()].sort((a, b) => {
    if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
    return a.userName.localeCompare(b.userName);
  });
};
