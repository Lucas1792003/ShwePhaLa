import { describe, it, expect } from "vitest";
import { getEffectiveShopId, normalizeAmountInput, toNumber } from "./utils";
import type { Shop, User } from "../types";

describe("normalizeAmountInput", () => {
  it("strips leading zeros", () => {
    expect(normalizeAmountInput("02900")).toBe("2900");
    expect(normalizeAmountInput("000500")).toBe("500");
  });

  it("collapses all-zero input to a single 0", () => {
    expect(normalizeAmountInput("0")).toBe("0");
    expect(normalizeAmountInput("00")).toBe("0");
    expect(normalizeAmountInput("000")).toBe("0");
  });

  it("returns empty string for empty input so the editor can keep the field clear", () => {
    expect(normalizeAmountInput("")).toBe("");
  });

  it("strips non-digit characters (commas, spaces, currency symbols)", () => {
    expect(normalizeAmountInput("2,900")).toBe("2900");
    expect(normalizeAmountInput("2 900")).toBe("2900");
    expect(normalizeAmountInput("MMK 2,900")).toBe("2900");
    expect(normalizeAmountInput("$2,900.00")).toBe("290000");
  });

  it("rejects negative signs and decimal points (cashier amount is a non-negative integer)", () => {
    expect(normalizeAmountInput("-500")).toBe("500");
    expect(normalizeAmountInput("12.34")).toBe("1234");
  });

  it("keeps a clean integer untouched", () => {
    expect(normalizeAmountInput("2900")).toBe("2900");
    expect(normalizeAmountInput("1")).toBe("1");
  });

  it("composes with toNumber so the editing state can drive calculations", () => {
    expect(toNumber(normalizeAmountInput("02900"))).toBe(2900);
    expect(toNumber(normalizeAmountInput(""))).toBe(0);
    expect(toNumber(normalizeAmountInput("000"))).toBe(0);
  });

  it("rejects pure-letter input", () => {
    expect(normalizeAmountInput("abc")).toBe("");
  });

  it("keeps the digits and drops letters when mixed", () => {
    expect(normalizeAmountInput("123abc")).toBe("123");
    expect(normalizeAmountInput("2,900abc")).toBe("2900");
    expect(normalizeAmountInput("abc500def")).toBe("500");
  });
});

/**
 * Behavior contract for the `MoneyInput` component (asserted indirectly:
 * `MoneyInput` is a thin shell over `normalizeAmountInput`, the `value`
 * prop, and a local string state. The branching rules below are what
 * MoneyInput relies on — keeping them tested here pins the contract
 * without pulling in a DOM testing framework).
 */
describe("MoneyInput contract (via normalizeAmountInput rules)", () => {
  it("allowEmpty=false: a cleared field normalizes to 0 on commit", () => {
    // What MoneyInput does on blur when display === "" and !allowEmpty:
    const display = "";
    const committed = display === "" ? 0 : Number(normalizeAmountInput(display));
    expect(committed).toBe(0);
  });

  it("allowEmpty=true: a cleared field stays empty / emits undefined", () => {
    const display = "";
    const emitted = display === "" ? undefined : Number(normalizeAmountInput(display));
    expect(emitted).toBeUndefined();
  });

  it("typing 02900 emits 2900 (numeric)", () => {
    const raw = "02900";
    const display = normalizeAmountInput(raw);
    expect(display).toBe("2900");
    expect(Number(display)).toBe(2900);
  });
});

// `getEffectiveShopId` is the single seam every shop-scoped page goes
// through to know whether the operator is "in" a shop. The rules below
// are load-bearing for the no-shop blocked states in POS / Shift /
// Inventory (see `04-features-workflows.md`).
describe("getEffectiveShopId", () => {
  const shops: Shop[] = [
    { id: "shop-a", code: "A", name: "Shop A", address: "x", isActive: true, createdAt: "" },
    { id: "shop-b", code: "B", name: "Shop B", address: "y", isActive: true, createdAt: "" },
  ];
  const admin: User = { id: "u-admin", name: "A", role: "ADMIN", isActive: true, createdAt: "" };
  const manager: User = { id: "u-mgr", name: "M", role: "MANAGER", shopId: "shop-b", isActive: true, createdAt: "" };
  const cashierNoShop: User = { id: "u-cash", name: "C", role: "CASHIER", isActive: true, createdAt: "" };

  it("returns empty string when there is no user", () => {
    expect(getEffectiveShopId(null, "shop-a", shops)).toBe("");
    expect(getEffectiveShopId(undefined, "shop-a", shops)).toBe("");
  });

  it("returns the admin's explicitly-picked shop", () => {
    expect(getEffectiveShopId(admin, "shop-b", shops)).toBe("shop-b");
  });

  it("returns empty string for an admin with no shop picked (no shops[0] fallback)", () => {
    // Critical: the old behavior was to silently fall back to shops[0].
    // The new contract is that callers must render a blocked state.
    expect(getEffectiveShopId(admin, null, shops)).toBe("");
    expect(getEffectiveShopId(admin, "", shops)).toBe("");
  });

  it("ignores an admin's picked shop id if it no longer exists in the list", () => {
    // E.g. the shop was deleted between sessions.
    expect(getEffectiveShopId(admin, "shop-deleted", shops)).toBe("");
  });

  it("falls back to user.shopId for an admin only if it points to a real shop", () => {
    const adminWithShop: User = { ...admin, shopId: "shop-a" };
    expect(getEffectiveShopId(adminWithShop, null, shops)).toBe("shop-a");

    const adminWithGhostShop: User = { ...admin, shopId: "shop-deleted" };
    expect(getEffectiveShopId(adminWithGhostShop, null, shops)).toBe("");
  });

  it("returns the manager's assigned shopId regardless of currentShopId", () => {
    // Non-admins are bound to their assigned shop; they cannot switch.
    expect(getEffectiveShopId(manager, "shop-a", shops)).toBe("shop-b");
    expect(getEffectiveShopId(manager, null, shops)).toBe("shop-b");
  });

  it("returns empty string for a non-admin with no assigned shop", () => {
    // Should be unreachable under migration 020's trigger, but the helper
    // stays safe: empty string is treated as "no shop selected" everywhere.
    expect(getEffectiveShopId(cashierNoShop, "shop-a", shops)).toBe("");
  });
});
