import { describe, expect, it } from "vitest";
import type { Sale, Shift, Shop, User } from "../../types";
import { toCsv } from "../../lib/csv";
import {
  buildShiftCsvRows,
  calculateClosingVariance,
  filterShiftRecords,
  getVisibleShiftsForUser,
  validateCloseShift,
} from "./shiftRecords";

const iso = (y: number, mZeroBased: number, d: number, h = 12, min = 0): string =>
  new Date(y, mZeroBased, d, h, min, 0, 0).toISOString();

const NOW = new Date(2026, 4, 20, 12, 0, 0, 0);

const user = (overrides: Partial<User>): User => ({
  id: "cashier-a",
  name: "Cashier A",
  role: "CASHIER",
  shopId: "shop-a",
  isActive: true,
  createdAt: "",
  ...overrides,
});

const shop = (overrides: Partial<Shop>): Shop => ({
  id: "shop-a",
  code: "A",
  name: "Shop A",
  address: "",
  isActive: true,
  createdAt: "",
  ...overrides,
});

const shift = (overrides: Partial<Shift>): Shift => ({
  id: "shift-a",
  shopId: "shop-a",
  cashierId: "cashier-a",
  startedAt: iso(2026, 4, 15, 8),
  openingCashMmk: 1000,
  ...overrides,
});

const sale = (overrides: Partial<Sale>): Sale => ({
  id: "sale-a",
  shopId: "shop-a",
  shiftId: "shift-a",
  receiptNo: "A-001",
  cashierId: "cashier-a",
  status: "NORMAL",
  subtotalMmk: 1200,
  discountMmk: 0,
  totalMmk: 1200,
  paymentMethod: "CASH",
  paidMmk: 1200,
  changeMmk: 0,
  createdAt: iso(2026, 4, 15, 9),
  ...overrides,
});

describe("getVisibleShiftsForUser", () => {
  const shifts: Shift[] = [
    shift({ id: "shift-a", shopId: "shop-a", cashierId: "cashier-a" }),
    shift({ id: "shift-b", shopId: "shop-b", cashierId: "cashier-b" }),
  ];

  it("allows admin all-shop visibility", () => {
    expect(getVisibleShiftsForUser(shifts, user({ id: "admin", role: "ADMIN", shopId: undefined }))).toHaveLength(2);
  });

  it("limits manager visibility to the assigned shop", () => {
    const visible = getVisibleShiftsForUser(shifts, user({ id: "manager-a", role: "MANAGER", shopId: "shop-a" }));
    expect(visible.map((item) => item.id)).toEqual(["shift-a"]);
  });

  it("limits cashier visibility to own shifts", () => {
    const visible = getVisibleShiftsForUser(shifts, user({ id: "cashier-b", role: "CASHIER", shopId: "shop-b" }));
    expect(visible.map((item) => item.id)).toEqual(["shift-b"]);
  });

  it("blocks buyer shift visibility", () => {
    expect(getVisibleShiftsForUser(shifts, user({ id: "buyer-a", role: "BUYER" }))).toEqual([]);
  });
});

describe("filterShiftRecords", () => {
  const shifts: Shift[] = [
    shift({ id: "open-a", shopId: "shop-a", cashierId: "cashier-a", startedAt: iso(2026, 4, 15, 8) }),
    shift({
      id: "closed-a",
      shopId: "shop-a",
      cashierId: "cashier-b",
      startedAt: iso(2026, 4, 10, 8),
      endedAt: iso(2026, 4, 10, 16),
    }),
    shift({
      id: "closed-b",
      shopId: "shop-b",
      cashierId: "cashier-a",
      startedAt: iso(2026, 3, 20, 8),
      endedAt: iso(2026, 3, 20, 16),
    }),
  ];

  it("applies month, status, user, and shop filters together", () => {
    const filtered = filterShiftRecords(shifts, {
      month: "2026-05",
      status: "closed",
      shopId: "shop-a",
      userId: "cashier-b",
    });
    expect(filtered.map((item) => item.id)).toEqual(["closed-a"]);
  });

  it("keeps open records when status is all", () => {
    expect(filterShiftRecords(shifts, { month: "2026-05", status: "all" }).map((item) => item.id)).toEqual([
      "open-a",
      "closed-a",
    ]);
  });
});

describe("close shift validation", () => {
  it("shows a variance preview from closing cash and expected cash", () => {
    expect(calculateClosingVariance(900, 1000)).toBe(-100);
    expect(calculateClosingVariance(undefined, 1000)).toBeNull();
  });

  it("requires closing cash", () => {
    expect(validateCloseShift({ closingCash: undefined, expectedCash: 1000 }).canClose).toBe(false);
  });

  it("requires a variance reason when cash differs", () => {
    expect(validateCloseShift({ closingCash: 900, expectedCash: 1000 }).canClose).toBe(false);
    expect(validateCloseShift({ closingCash: 900, expectedCash: 1000, varianceReason: "short drawer" }).canClose).toBe(true);
  });

  it("rejects invalid numeric values without NaN or Infinity leaking through", () => {
    expect(validateCloseShift({ closingCash: Number.NaN, expectedCash: 1000 }).error).toBe(
      "Closing cash must be zero or greater."
    );
    expect(validateCloseShift({ closingCash: 1000, expectedCash: Infinity }).error).toBe(
      "Expected cash is not available yet."
    );
  });
});

describe("buildShiftCsvRows", () => {
  it("exports the filtered record set with useful fields", () => {
    const shifts: Shift[] = [
      shift({
        id: "shift-a",
        cashierId: "cashier-a",
        shopId: "shop-a",
        startedAt: iso(2026, 4, 15, 8),
        endedAt: iso(2026, 4, 15, 10, 5),
        openingCashMmk: 1000,
        expectedCashMmk: 2200,
        closingCashMmk: 2100,
        varianceMmk: -100,
        varianceReason: "short drawer",
      }),
      shift({ id: "shift-hidden", cashierId: "cashier-b", shopId: "shop-b", startedAt: iso(2026, 4, 15, 8) }),
    ];
    const filtered = filterShiftRecords(shifts, { shopId: "shop-a" });
    const rows = buildShiftCsvRows(
      filtered,
      [user({ id: "cashier-a", name: "Cashier A", role: "CASHIER" })],
      [shop({ id: "shop-a", name: "Shop A" })],
      [sale({ id: "sale-a", shiftId: "shift-a", totalMmk: 1200 })],
      [],
      NOW
    );

    expect(rows).toEqual([
      {
        cashier: "Cashier A",
        role: "CASHIER",
        shop: "Shop A",
        started_at: shifts[0].startedAt,
        ended_at: shifts[0].endedAt,
        duration: "2h 05m",
        status: "Closed",
        opening_cash: 1000,
        expected_cash: 2200,
        closing_cash: 2100,
        variance: -100,
        sales_count: 1,
        variance_reason: "short drawer",
      },
    ]);
    expect(toCsv(rows)).toContain("cashier,role,shop,started_at,ended_at,duration,status,opening_cash,expected_cash,closing_cash,variance,sales_count,variance_reason");
    expect(toCsv(rows)).not.toContain("shift-hidden");
  });
});
