import { describe, expect, it } from "vitest";
import { mapUserFormError, USER_FORM_MESSAGES } from "./userFormErrors";

describe("mapUserFormError", () => {
  it("maps the one-admin unique index violation", () => {
    const err = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "users_only_one_admin"',
    };
    expect(mapUserFormError(err)).toBe(USER_FORM_MESSAGES.secondAdmin);
  });

  it("maps the one-active-manager-per-shop unique index violation", () => {
    const err = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "users_one_active_manager_per_shop"',
      details: "Key (shop_id)=(shop-001) already exists.",
    };
    expect(mapUserFormError(err)).toBe(USER_FORM_MESSAGES.secondManager);
  });

  it("falls back to generic duplicate message on unrelated unique violations", () => {
    const err = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "users_pkey"',
    };
    // Not one of ours — falls through to getErrorMessage which produces the
    // generic "This record already exists." string.
    expect(mapUserFormError(err)).toBe("This record already exists.");
  });

  it("maps the manager-without-shop trigger message", () => {
    expect(
      mapUserFormError({ code: "P0001", message: "Manager must be assigned to a shop." }),
    ).toBe(USER_FORM_MESSAGES.managerWithoutShop);
  });

  it("maps the cashier-without-shop trigger message", () => {
    expect(
      mapUserFormError({ code: "P0001", message: "Cashier must be assigned to a shop." }),
    ).toBe(USER_FORM_MESSAGES.cashierWithoutShop);
  });

  it("maps the cashier-without-manager trigger message", () => {
    expect(
      mapUserFormError({
        code: "P0001",
        message: "Cannot create cashier for a shop without an active manager.",
      }),
    ).toBe(USER_FORM_MESSAGES.cashierWithoutManager);
  });

  it("maps the buyer-without-shop trigger message", () => {
    expect(
      mapUserFormError({ code: "P0001", message: "Buyer must be assigned to a shop." }),
    ).toBe(USER_FORM_MESSAGES.buyerWithoutShop);
  });

  it("maps the manager-deactivation safety trigger message", () => {
    expect(
      mapUserFormError({
        code: "P0001",
        message:
          "Cannot remove the only manager of this shop while 3 active cashier(s) remain. " +
          "Reassign or deactivate the cashiers first, or assign another manager.",
      }),
    ).toBe(USER_FORM_MESSAGES.managerHasCashiers);
  });

  it("returns the existing generic mapping for unknown errors", () => {
    // No friendly raw message and no DB code — returns the fallback bucket.
    expect(mapUserFormError({ code: "XYZ" })).toBe("Something went wrong. Please try again.");
  });

  it("passes through unrelated permission-style errors", () => {
    expect(
      mapUserFormError({ code: "42501", message: "permission denied for table users" }),
    ).toBe("You do not have permission to perform this action.");
  });
});
