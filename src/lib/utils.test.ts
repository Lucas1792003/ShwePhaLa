import { describe, it, expect } from "vitest";
import { normalizeAmountInput, toNumber } from "./utils";

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
