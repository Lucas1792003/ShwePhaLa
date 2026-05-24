import { describe, expect, it } from "vitest";
import type { Shift, Shop, User } from "../../types";
import {
  formatDuration,
  getMonthlyShiftHoursMs,
  getShiftDurationMs,
  groupShiftHoursByUser,
  isShiftInMonth,
  monthKey,
} from "./workHours";

// All fixtures are built in LOCAL time so the suite is timezone-agnostic
// — the work-hour helpers themselves bucket shifts by LOCAL calendar
// month (a Myanmar operator expects month boundaries to follow their wall
// clock, not UTC). `iso(...)` produces an ISO string for the given local
// fields by going through JS Date and toISOString, so the comparison
// loop stays exact regardless of the host timezone.
const iso = (y: number, mZeroBased: number, d: number, h = 12, min = 0): string =>
  new Date(y, mZeroBased, d, h, min, 0, 0).toISOString();

const NOW = new Date(2026, 4, 15, 12, 0, 0, 0); // 15 May 2026 noon local
const startMay15_8 = iso(2026, 4, 15, 8);
const startMay15_8_plus_2_30 = iso(2026, 4, 15, 10, 30);
const startMay10_8 = iso(2026, 4, 10, 8);
const endMay10_16 = iso(2026, 4, 10, 16);
const startMay12_9 = iso(2026, 4, 12, 9);
const endMay12_13 = iso(2026, 4, 12, 13);
const endMay15_10 = iso(2026, 4, 15, 10);
const startMay20_9 = iso(2026, 4, 20, 9);
const endMay20_13_30 = iso(2026, 4, 20, 13, 30);
const startApr30_20 = iso(2026, 3, 30, 20);
const endApr30_22 = iso(2026, 3, 30, 22);
const startApr30_12 = iso(2026, 3, 30, 12);
const startMay31_22 = iso(2026, 4, 31, 22);
const endJun1_03 = iso(2026, 5, 1, 3);
const endMay15_10_30 = iso(2026, 4, 15, 10, 30);

const shift = (overrides: Partial<Shift>): Shift => ({
  id: "shift-x",
  shopId: "shop-a",
  cashierId: "user-cashier-a",
  startedAt: startMay15_8,
  openingCashMmk: 0,
  ...overrides,
});

describe("getShiftDurationMs", () => {
  it("computes a closed shift's duration", () => {
    const s = shift({ startedAt: startMay15_8, endedAt: endMay15_10_30 });
    expect(getShiftDurationMs(s, NOW)).toBe(150 * 60 * 1000);
  });

  it("uses `now` for an open shift", () => {
    const s = shift({ startedAt: startMay15_8 });
    expect(getShiftDurationMs(s, NOW)).toBe(4 * 60 * 60 * 1000);
  });

  it("treats an invalid startedAt as zero", () => {
    expect(getShiftDurationMs(shift({ startedAt: "not-a-date" }), NOW)).toBe(0);
  });

  it("treats an invalid endedAt as zero", () => {
    expect(getShiftDurationMs(shift({ endedAt: "not-a-date" }), NOW)).toBe(0);
  });

  it("never returns a negative duration", () => {
    // A clock-skewed endedAt before startedAt shouldn't make a worker owe
    // hours; we floor at 0.
    const s = shift({ startedAt: startMay15_8_plus_2_30, endedAt: startMay15_8 });
    expect(getShiftDurationMs(s, NOW)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats whole hours and minutes", () => {
    expect(formatDuration(2 * 60 * 60 * 1000 + 15 * 60 * 1000)).toBe("2h 15m");
  });

  it("floors to the minute so a 119s shift shows as 1m once ticked", () => {
    expect(formatDuration(119 * 1000)).toBe("0h 1m");
    expect(formatDuration(0)).toBe("0h 0m");
  });

  it("does not wrap large hour values", () => {
    // Monthly totals routinely cross 24h.
    expect(formatDuration(42 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe("42h 30m");
  });

  it("clamps invalid values to 0h 0m", () => {
    expect(formatDuration(Number.NaN)).toBe("0h 0m");
    expect(formatDuration(-1000)).toBe("0h 0m");
    expect(formatDuration(Infinity)).toBe("0h 0m");
  });
});

describe("isShiftInMonth (attribution rule = startedAt local month)", () => {
  it("includes a shift that started in the requested month", () => {
    expect(isShiftInMonth(shift({ startedAt: startMay15_8 }), "2026-05")).toBe(true);
  });

  it("excludes a shift that started in a different month", () => {
    // 12:00 local on Apr 30 is unambiguously in April in any timezone.
    expect(isShiftInMonth(shift({ startedAt: startApr30_12 }), "2026-05")).toBe(false);
  });

  it("attributes a cross-midnight, cross-month shift to its starting LOCAL month", () => {
    // Started 31 May 22:00 local, closed 1 June 03:00 local — counts for May.
    const crossing = shift({ startedAt: startMay31_22, endedAt: endJun1_03 });
    expect(isShiftInMonth(crossing, "2026-05")).toBe(true);
    expect(isShiftInMonth(crossing, "2026-06")).toBe(false);
  });

  it("rejects a malformed month string", () => {
    expect(isShiftInMonth(shift({}), "")).toBe(false);
    expect(isShiftInMonth(shift({}), "2026-13")).toBe(false);
    expect(isShiftInMonth(shift({}), "not-a-month")).toBe(false);
  });
});

describe("getMonthlyShiftHoursMs", () => {
  it("sums the durations of shifts in the month, ignoring others", () => {
    const shifts: Shift[] = [
      shift({ id: "s-1", startedAt: startMay15_8, endedAt: endMay15_10 }),
      shift({ id: "s-2", startedAt: startMay20_9, endedAt: endMay20_13_30 }),
      shift({ id: "s-3", startedAt: startApr30_20, endedAt: endApr30_22 }),
    ];
    expect(getMonthlyShiftHoursMs(shifts, "2026-05", NOW)).toBe((2 + 4.5) * 60 * 60 * 1000);
  });

  it("counts open shifts up to `now` for the current month", () => {
    const shifts: Shift[] = [shift({ id: "s-open", startedAt: startMay15_8 })];
    expect(getMonthlyShiftHoursMs(shifts, "2026-05", NOW)).toBe(4 * 60 * 60 * 1000);
  });
});

describe("groupShiftHoursByUser", () => {
  const users: User[] = [
    { id: "u-admin", name: "Admin", role: "ADMIN", isActive: true, createdAt: "" },
    { id: "u-cash", name: "Cashier A", role: "CASHIER", shopId: "shop-a", isActive: true, createdAt: "" },
  ];
  const shops: Shop[] = [
    { id: "shop-a", code: "A", name: "Shop A", address: "", isActive: true, createdAt: "" },
    { id: "shop-b", code: "B", name: "Shop B", address: "", isActive: true, createdAt: "" },
  ];

  it("buckets per (user, shop) and counts shifts + open shifts", () => {
    const shifts: Shift[] = [
      // Cashier A: two shifts in shop-a (one closed, one still open)
      shift({ id: "s-1", cashierId: "u-cash", shopId: "shop-a", startedAt: startMay10_8, endedAt: endMay10_16 }),
      shift({ id: "s-open", cashierId: "u-cash", shopId: "shop-a", startedAt: startMay15_8 }),
      // Admin opened a shift in shop-b mid-month
      shift({ id: "s-2", cashierId: "u-admin", shopId: "shop-b", startedAt: startMay12_9, endedAt: endMay12_13 }),
      // Out-of-month shift — excluded
      shift({ id: "s-prev", cashierId: "u-cash", shopId: "shop-a", startedAt: startApr30_12, endedAt: iso(2026, 3, 30, 16) }),
    ];

    const rows = groupShiftHoursByUser(shifts, users, shops, "2026-05", NOW);

    // Sorted by totalMs desc. Cashier A: 8h + 4h (open) = 12h. Admin: 4h.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      userId: "u-cash",
      userName: "Cashier A",
      role: "CASHIER",
      shopId: "shop-a",
      shopName: "Shop A",
      shiftCount: 2,
      openShiftCount: 1,
      totalMs: 12 * 60 * 60 * 1000,
    });
    expect(rows[1]).toMatchObject({
      userId: "u-admin",
      shopId: "shop-b",
      shiftCount: 1,
      openShiftCount: 0,
      totalMs: 4 * 60 * 60 * 1000,
    });
  });

  it("keeps history for a deleted user with a placeholder name", () => {
    const shifts: Shift[] = [
      shift({ id: "s-x", cashierId: "ghost-user", shopId: "shop-a", startedAt: startMay10_8, endedAt: iso(2026, 4, 10, 12) }),
    ];
    const rows = groupShiftHoursByUser(shifts, users, shops, "2026-05", NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userName: "Unknown user", role: "CASHIER" });
  });
});

describe("monthKey", () => {
  it("pads single-digit months", () => {
    expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
    expect(monthKey(new Date(2026, 11, 31))).toBe("2026-12");
  });
});
