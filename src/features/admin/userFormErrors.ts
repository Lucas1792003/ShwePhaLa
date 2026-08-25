// Maps Postgres / Supabase errors raised by migration 020's
// user-assignment constraints into the short, end-user-facing strings
// the Users form is supposed to display verbatim.
//
// Order of checks mirrors the rule list in the task spec; the first
// match wins. Falls back to `getErrorMessage` for anything else so
// generic mappings (network, permission, expired session) still apply.

import { getErrorMessage } from "../../lib/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyError = any;

const blob = (error: AnyError): string => {
  if (!error) return "";
  const parts: string[] = [];
  if (typeof error === "string") parts.push(error);
  if (typeof error?.message === "string") parts.push(error.message);
  if (typeof error?.details === "string") parts.push(error.details);
  if (typeof error?.hint === "string") parts.push(error.hint);
  return parts.join(" | ").toLowerCase();
};

const code = (error: AnyError): string | undefined => {
  if (!error) return undefined;
  if (typeof error.code === "string") return error.code;
  return undefined;
};

export const USER_FORM_MESSAGES = {
  secondAdmin: "Only one admin is allowed in the system.",
  secondManager: "This shop already has an active manager.",
  managerWithoutShop: "Manager must be assigned to a shop.",
  cashierWithoutShop: "Cashier must be assigned to a shop.",
  buyerWithoutShop: "Buyer must be assigned to a shop.",
  cashierWithoutManager: "Cashier must be assigned to a shop with an active manager.",
  managerHasCashiers:
    "Cannot remove the only manager of this shop while active cashiers remain. " +
    "Reassign or deactivate the cashiers first, or assign another manager.",
} as const;

export const mapUserFormError = (error: AnyError): string => {
  const text = blob(error);
  const errCode = code(error);

  // Unique-index violation from migration 020 (users_only_one_admin), and
  // the one-active-manager-per-shop rule — a plain unique index (23505)
  // until migration 049 converted it to a deferrable EXCLUDE constraint
  // (23P01) so replace_manager() can swap managers atomically; both codes
  // are checked since either could still be live depending on what's
  // applied.
  if (errCode === "23505" || errCode === "23P01") {
    if (text.includes("users_only_one_admin")) return USER_FORM_MESSAGES.secondAdmin;
    if (text.includes("users_one_active_manager_per_shop")) return USER_FORM_MESSAGES.secondManager;
  }

  // Trigger RAISE EXCEPTION messages (P0001) — the DB already emits the
  // exact friendly string, but we match on a few stable substrings so a
  // future rephrase in SQL doesn't break the mapping silently.
  if (text.includes("manager must be assigned to a shop")) return USER_FORM_MESSAGES.managerWithoutShop;
  if (text.includes("cashier must be assigned to a shop")) {
    if (text.includes("active manager")) return USER_FORM_MESSAGES.cashierWithoutManager;
    return USER_FORM_MESSAGES.cashierWithoutShop;
  }
  if (text.includes("buyer must be assigned to a shop")) return USER_FORM_MESSAGES.buyerWithoutShop;
  if (text.includes("cannot create cashier for a shop without an active manager")) {
    return USER_FORM_MESSAGES.cashierWithoutManager;
  }
  if (text.includes("cannot remove the only manager of this shop")) {
    return USER_FORM_MESSAGES.managerHasCashiers;
  }

  return getErrorMessage(error);
};
