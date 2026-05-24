import { describe, expect, it } from "vitest";
import type { Shop } from "../types";
import {
  SHOP_FORM_MESSAGES,
  mapShopFormError,
  normalizeShopInput,
  validateShopInput,
} from "./shopValidation";

const shop = (overrides: Partial<Shop>): Shop => ({
  id: "shop-a",
  code: "SA",
  name: "Shop A",
  address: "Yangon",
  isActive: true,
  createdAt: "",
  ...overrides,
});

describe("shop validation", () => {
  const shops: Shop[] = [
    shop({ id: "shop-b", code: "SB", name: "Shop B" }),
    shop({ id: "shop-c", code: "SC", name: "Shop C" }),
  ];

  it("blocks exact duplicate names", () => {
    expect(validateShopInput({ name: "Shop B", code: "SBN", address: "" }, shops)).toBe(
      SHOP_FORM_MESSAGES.duplicateName
    );
  });

  it("blocks case-insensitive duplicate names", () => {
    expect(validateShopInput({ name: "shop b", code: "SBN", address: "" }, shops)).toBe(
      SHOP_FORM_MESSAGES.duplicateName
    );
  });

  it("blocks whitespace-normalized duplicate names", () => {
    expect(validateShopInput({ name: "  Shop B  ", code: "SBN", address: "" }, shops)).toBe(
      SHOP_FORM_MESSAGES.duplicateName
    );
  });

  it("blocks duplicate codes case-insensitively", () => {
    expect(validateShopInput({ name: "New Shop", code: "sb", address: "" }, shops)).toBe(
      SHOP_FORM_MESSAGES.duplicateCode
    );
  });

  it("allows editing the same shop without changing name or code", () => {
    expect(
      validateShopInput({ name: "Shop B", code: "SB", address: "New address" }, shops, "shop-b")
    ).toBeNull();
  });

  it("blocks editing another shop to a duplicate name", () => {
    expect(validateShopInput({ name: "Shop B", code: "SC", address: "" }, shops, "shop-c")).toBe(
      SHOP_FORM_MESSAGES.duplicateName
    );
  });

  it("trims form input before saving", () => {
    expect(normalizeShopInput({ name: "  Shop D ", code: " SD ", address: " Mandalay " })).toEqual({
      name: "Shop D",
      code: "SD",
      address: "Mandalay",
    });
  });

  it("maps database duplicate-name index errors to the friendly message", () => {
    expect(
      mapShopFormError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "shops_unique_normalized_name"',
      })
    ).toBe(SHOP_FORM_MESSAGES.duplicateName);
  });

  it("maps database duplicate-code index errors to the friendly message", () => {
    expect(
      mapShopFormError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "shops_unique_normalized_code"',
      })
    ).toBe(SHOP_FORM_MESSAGES.duplicateCode);
  });
});
