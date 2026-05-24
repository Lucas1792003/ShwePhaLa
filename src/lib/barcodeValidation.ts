import type { ProductBarcode } from "../types";
import { getErrorMessage } from "./errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyError = any;

export const BARCODE_FORM_MESSAGES = {
  required: "Barcode is required.",
  tooShort: "Barcode is too short (minimum 4 characters).",
  tooLong: "Barcode is too long (maximum 64 characters).",
  invalidChars: "Barcode cannot contain spaces.",
  duplicateInForm: "This barcode is already added to this product.",
  duplicateOtherProduct: "This barcode is already linked to another product.",
} as const;

export const BARCODE_MIN_LENGTH = 4;
export const BARCODE_MAX_LENGTH = 64;

/**
 * Normalize a scanned/typed barcode value before save or comparison.
 * Strips surrounding whitespace and ASCII control characters (\r, \n, \t)
 * that some scanners emit alongside the Enter key. Internal whitespace is
 * preserved-as-rejected by `validateBarcodeInput`; we don't silently
 * delete it because that could merge two distinct codes.
 *
 * Case is preserved: real EAN/UPC values are numeric, but some internal
 * codes are alphanumeric — uppercasing here would diverge from the value
 * encoded onto the physical label. POS lookup (`findProductForScan`)
 * matches `product_barcodes.value` verbatim for that reason.
 */
export const normalizeBarcodeValue = (value: string | null | undefined): string =>
  (value ?? "").replace(/[\r\n\t]+/g, "").trim();

/**
 * Key used for duplicate detection. Lower-cased on top of normalize so
 * `abc123` and `ABC123` cannot both be registered against different
 * products — they would scan ambiguously at POS otherwise.
 */
export const normalizeBarcodeKey = (value: string | null | undefined): string =>
  normalizeBarcodeValue(value).toLowerCase();

export const validateBarcodeInput = (raw: string): string | null => {
  const normalized = normalizeBarcodeValue(raw);
  if (!normalized) return BARCODE_FORM_MESSAGES.required;
  if (/\s/.test(normalized)) return BARCODE_FORM_MESSAGES.invalidChars;
  if (normalized.length < BARCODE_MIN_LENGTH) return BARCODE_FORM_MESSAGES.tooShort;
  if (normalized.length > BARCODE_MAX_LENGTH) return BARCODE_FORM_MESSAGES.tooLong;
  return null;
};

/**
 * Find which OTHER product (if any) already owns the given barcode value.
 * Match is case-insensitive after normalization, so EAN-style numeric and
 * alphanumeric codes are both protected from cross-product collisions.
 *
 * `excludeProductId` lets the caller skip the product currently being
 * edited — its own existing rows must not flag as "another product".
 */
export const findBarcodeOwner = (
  value: string,
  barcodes: ProductBarcode[],
  excludeProductId: string | null = null
): ProductBarcode | undefined => {
  const key = normalizeBarcodeKey(value);
  if (!key) return undefined;
  return barcodes.find(
    (item) => item.productId !== excludeProductId && normalizeBarcodeKey(item.value) === key
  );
};

/**
 * Pure duplicate-within-this-form check. Used after the input is valid but
 * before we add it to the in-memory list the user sees in the editor.
 */
export const isDuplicateBarcodeInForm = (
  value: string,
  existingValues: string[]
): boolean => {
  const key = normalizeBarcodeKey(value);
  if (!key) return false;
  return existingValues.some((existing) => normalizeBarcodeKey(existing) === key);
};

const errorBlob = (error: AnyError): string => {
  if (!error) return "";
  const parts: string[] = [];
  if (typeof error === "string") parts.push(error);
  if (typeof error?.message === "string") parts.push(error.message);
  if (typeof error?.details === "string") parts.push(error.details);
  if (typeof error?.hint === "string") parts.push(error.hint);
  if (typeof error?.code === "string") parts.push(error.code);
  if (typeof error?.cause?.message === "string") parts.push(error.cause.message);
  return parts.join(" | ").toLowerCase();
};

/**
 * Map a Postgres write error from a barcode insert into a friendly form
 * message. `23505` is unique_violation; the index name is the one created
 * by migration 023.
 */
export const mapBarcodeWriteError = (error: AnyError): string => {
  const text = errorBlob(error);
  if (
    text.includes("product_barcodes_unique_normalized_value") ||
    (text.includes("23505") && text.includes("product_barcodes"))
  ) {
    return BARCODE_FORM_MESSAGES.duplicateOtherProduct;
  }
  return getErrorMessage(error);
};
