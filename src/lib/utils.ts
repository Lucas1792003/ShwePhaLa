import type { Shop, User } from "../types";

export const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

export const formatMmk = (value: number) => `MMK ${value.toLocaleString("en-US")}`;

export const formatDateTime = (value: string | number | Date) =>
  new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatDate = (value: string | number | Date) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const getDateKey = (value: Date = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

export const buildReceiptNo = (shopCode: string, dateKey: string, seq: number) =>
  `${shopCode}-${dateKey}-${String(seq).padStart(4, "0")}`;

export const getEffectiveShopId = (user: User | null | undefined, appShopId: string | null, shops: Shop[]) => {
  if (!user) return "";
  if (user.role === "ADMIN") return appShopId || user.shopId || shops[0]?.id || "";
  return user.shopId || "";
};

export const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Normalize a free-text amount field to a clean non-negative integer string.
 *
 * - Strips any non-digit (commas, spaces, currency symbols, etc.) so a paste
 *   of "2,900" becomes "2900".
 * - Trims leading zeros so "02900" becomes "2900".
 * - Collapses all-zero input ("000") to a single "0" so the field never sits
 *   on a meaningless padded zero.
 * - Returns "" when the caller's input was empty — the caller decides what to
 *   show: the editing UI may keep "" visible while focused and reset to "0"
 *   on blur.
 *
 * This is the source-of-truth sanitizer for any cashier-facing amount field.
 */
export const normalizeAmountInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return "";
  const trimmed = digits.replace(/^0+/, "");
  return trimmed === "" ? "0" : trimmed;
};
