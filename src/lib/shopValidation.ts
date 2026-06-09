import type { Shop } from "../types";
import { getErrorMessage } from "./errors";

export const SHOP_FORM_MESSAGES = {
  nameRequired: "Shop name is required.",
  codeRequired: "Shop code is required.",
  codeInvalid: "Shop code cannot contain spaces.",
  duplicateName: "A shop with this name already exists.",
  duplicateCode: "A shop with this code already exists.",
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyError = any;

export interface ShopFormInput {
  name: string;
  code: string;
  address: string;
  phone?: string;
}

export const normalizeShopText = (value: string | null | undefined): string =>
  (value ?? "").trim();

export const normalizeShopKey = (value: string | null | undefined): string =>
  normalizeShopText(value).toLowerCase();

export const normalizeShopInput = (input: ShopFormInput): ShopFormInput => {
  const phone = normalizeShopText(input.phone);
  return {
    name: normalizeShopText(input.name),
    code: normalizeShopText(input.code),
    address: normalizeShopText(input.address),
    phone: phone || undefined,
  };
};

export const findShopWithNormalizedName = (
  shops: Shop[],
  name: string,
  editingId: string | null = null
): Shop | undefined => {
  const key = normalizeShopKey(name);
  if (!key) return undefined;
  return shops.find((shop) => shop.id !== editingId && normalizeShopKey(shop.name) === key);
};

export const findShopWithNormalizedCode = (
  shops: Shop[],
  code: string,
  editingId: string | null = null
): Shop | undefined => {
  const key = normalizeShopKey(code);
  if (!key) return undefined;
  return shops.find((shop) => shop.id !== editingId && normalizeShopKey(shop.code) === key);
};

export const validateShopInput = (
  input: ShopFormInput,
  shops: Shop[],
  editingId: string | null = null
): string | null => {
  const normalized = normalizeShopInput(input);
  if (!normalized.name) return SHOP_FORM_MESSAGES.nameRequired;
  if (!normalized.code) return SHOP_FORM_MESSAGES.codeRequired;
  if (/\s/.test(normalized.code)) return SHOP_FORM_MESSAGES.codeInvalid;
  if (findShopWithNormalizedName(shops, normalized.name, editingId)) {
    return SHOP_FORM_MESSAGES.duplicateName;
  }
  if (findShopWithNormalizedCode(shops, normalized.code, editingId)) {
    return SHOP_FORM_MESSAGES.duplicateCode;
  }
  return null;
};

const errorBlob = (error: AnyError): string => {
  if (!error) return "";
  const parts: string[] = [];
  if (typeof error === "string") parts.push(error);
  if (typeof error?.message === "string") parts.push(error.message);
  if (typeof error?.details === "string") parts.push(error.details);
  if (typeof error?.hint === "string") parts.push(error.hint);
  if (typeof error?.cause?.message === "string") parts.push(error.cause.message);
  if (typeof error?.cause?.details === "string") parts.push(error.cause.details);
  return parts.join(" | ").toLowerCase();
};

export const mapShopFormError = (error: AnyError): string => {
  const text = errorBlob(error);
  if (text.includes("shops_unique_normalized_name")) {
    return SHOP_FORM_MESSAGES.duplicateName;
  }
  if (text.includes("shops_unique_normalized_code")) {
    return SHOP_FORM_MESSAGES.duplicateCode;
  }
  return getErrorMessage(error);
};
