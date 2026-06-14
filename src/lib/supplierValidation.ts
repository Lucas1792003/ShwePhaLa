import type { Supplier } from "../types";
import { getErrorMessage } from "./errors";

export const SUPPLIER_FORM_MESSAGES = {
  codeRequired: "Supplier code is required.",
  nameRequired: "Supplier name is required.",
  duplicateCode: "A supplier with this code already exists.",
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyError = any;

export interface SupplierFormInput {
  code: string;
  name: string;
}

export const normalizeSupplierText = (value: string | null | undefined): string =>
  (value ?? "").trim();

export const normalizeSupplierKey = (value: string | null | undefined): string =>
  normalizeSupplierText(value).toLowerCase();

export const findSupplierWithNormalizedCode = (
  suppliers: Supplier[],
  code: string,
  editingId: string | null = null
): Supplier | undefined => {
  const key = normalizeSupplierKey(code);
  if (!key) return undefined;
  return suppliers.find(
    (supplier) => supplier.id !== editingId && normalizeSupplierKey(supplier.code) === key
  );
};

export const validateSupplierInput = (
  input: SupplierFormInput,
  suppliers: Supplier[],
  editingId: string | null = null
): string | null => {
  const code = normalizeSupplierText(input.code);
  const name = normalizeSupplierText(input.name);
  if (!code) return SUPPLIER_FORM_MESSAGES.codeRequired;
  if (!name) return SUPPLIER_FORM_MESSAGES.nameRequired;
  if (findSupplierWithNormalizedCode(suppliers, code, editingId)) {
    return SUPPLIER_FORM_MESSAGES.duplicateCode;
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

export const mapSupplierFormError = (error: AnyError): string => {
  const text = errorBlob(error);
  if (text.includes("suppliers_unique_normalized_code")) {
    return SUPPLIER_FORM_MESSAGES.duplicateCode;
  }
  return getErrorMessage(error);
};

/**
 * Next sequential `SUP-###` code. Reads the highest existing SUP-number across
 * all suppliers (active or not) and returns max + 1, so it never collides after
 * a deactivation or out-of-order add the way a count-based suggestion would.
 */
export const nextSupplierCode = (suppliers: Supplier[]): string => {
  const max = suppliers.reduce((highest, supplier) => {
    const match = /^SUP-(\d+)$/i.exec(normalizeSupplierText(supplier.code));
    if (!match) return highest;
    const value = parseInt(match[1], 10);
    return Number.isFinite(value) ? Math.max(highest, value) : highest;
  }, 0);
  return `SUP-${String(max + 1).padStart(3, "0")}`;
};
