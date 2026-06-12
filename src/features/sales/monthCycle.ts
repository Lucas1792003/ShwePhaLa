/**
 * Monthly cycle helpers (calendar month, local time).
 *
 * The Sales page shows only the current month's sales and the monthly
 * auto-email/archive fires at the start of each month, so the countdown and
 * the page's month filter both derive from these.
 */

/** Midnight on the 1st of the month containing `d`. */
export const startOfMonth = (d: Date = new Date()): Date =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);

/** Midnight on the 1st of NEXT month (when the monthly report fires). */
export const nextMonthStart = (d: Date = new Date()): Date =>
  new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);

export interface MonthBounds {
  /** Start of the current month (ms). */
  thisStart: number;
  /** Start of next month / end of this month (ms). */
  nextStart: number;
}

export const getMonthBounds = (now: Date = new Date()): MonthBounds => ({
  thisStart: startOfMonth(now).getTime(),
  nextStart: nextMonthStart(now).getTime(),
});

/** True if `createdAt` falls inside the current calendar month. */
export const inCurrentMonth = (createdAt: string, bounds: MonthBounds): boolean => {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= bounds.thisStart && t < bounds.nextStart;
};

/** e.g. "June 2026" for the current month. */
export const formatMonthLabel = (bounds: MonthBounds): string =>
  new Date(bounds.thisStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
