import { describe, expect, it } from "vitest";
import type { ProductBarcode } from "../types";
import {
  BARCODE_FORM_MESSAGES,
  findBarcodeOwner,
  isDuplicateBarcodeInForm,
  mapBarcodeWriteError,
  normalizeBarcodeKey,
  normalizeBarcodeValue,
  validateBarcodeInput,
} from "./barcodeValidation";

const barcode = (productId: string, value: string): ProductBarcode => ({
  id: `${productId}-${value}`,
  productId,
  value,
  type: "EAN13",
});

describe("normalizeBarcodeValue", () => {
  it("trims surrounding whitespace and strips scanner control chars", () => {
    expect(normalizeBarcodeValue("  8801001\r\n")).toBe("8801001");
    expect(normalizeBarcodeValue("\t8801001\t")).toBe("8801001");
  });

  it("preserves case (POS lookup matches verbatim)", () => {
    expect(normalizeBarcodeValue(" abc123 ")).toBe("abc123");
    expect(normalizeBarcodeValue(" ABC123 ")).toBe("ABC123");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeBarcodeValue(null)).toBe("");
    expect(normalizeBarcodeValue(undefined)).toBe("");
  });
});

describe("validateBarcodeInput", () => {
  it("rejects empty input", () => {
    expect(validateBarcodeInput("")).toBe(BARCODE_FORM_MESSAGES.required);
    expect(validateBarcodeInput("   ")).toBe(BARCODE_FORM_MESSAGES.required);
  });

  it("rejects barcodes with internal whitespace", () => {
    expect(validateBarcodeInput("88 010 01")).toBe(BARCODE_FORM_MESSAGES.invalidChars);
  });

  it("rejects too-short barcodes (< 4 chars)", () => {
    expect(validateBarcodeInput("123")).toBe(BARCODE_FORM_MESSAGES.tooShort);
  });

  it("rejects too-long barcodes (> 64 chars)", () => {
    expect(validateBarcodeInput("a".repeat(65))).toBe(BARCODE_FORM_MESSAGES.tooLong);
  });

  it("accepts a typical EAN-13", () => {
    expect(validateBarcodeInput("8801234567890")).toBeNull();
  });

  it("accepts a short alphanumeric code (>= 4 chars)", () => {
    expect(validateBarcodeInput("PEPSI")).toBeNull();
  });
});

describe("findBarcodeOwner", () => {
  const barcodes = [
    barcode("prod-a", "8801001"),
    barcode("prod-b", "PEPSI-12"),
  ];

  it("returns the existing barcode when a different product owns the value", () => {
    expect(findBarcodeOwner("8801001", barcodes, "prod-new")?.productId).toBe("prod-a");
  });

  it("matches case-insensitively after normalization", () => {
    expect(findBarcodeOwner("pepsi-12", barcodes, "prod-new")?.productId).toBe("prod-b");
    expect(findBarcodeOwner("PEPSI-12", barcodes, "prod-new")?.productId).toBe("prod-b");
  });

  it("ignores barcodes that belong to the product being edited", () => {
    expect(findBarcodeOwner("8801001", barcodes, "prod-a")).toBeUndefined();
  });

  it("returns undefined for unknown values", () => {
    expect(findBarcodeOwner("nothing-like-this", barcodes)).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(findBarcodeOwner("", barcodes)).toBeUndefined();
    expect(findBarcodeOwner("   ", barcodes)).toBeUndefined();
  });
});

describe("isDuplicateBarcodeInForm", () => {
  it("detects exact duplicates", () => {
    expect(isDuplicateBarcodeInForm("8801001", ["8801001"])).toBe(true);
  });

  it("detects case-insensitive duplicates after normalization", () => {
    expect(isDuplicateBarcodeInForm("Pepsi-12", ["PEPSI-12"])).toBe(true);
    expect(isDuplicateBarcodeInForm(" pepsi-12 ", ["PEPSI-12"])).toBe(true);
  });

  it("returns false on no overlap", () => {
    expect(isDuplicateBarcodeInForm("8801001", ["9991111", "PEPSI"])).toBe(false);
  });
});

describe("normalizeBarcodeKey", () => {
  it("lowercases on top of trim", () => {
    expect(normalizeBarcodeKey(" PEPSI-12 ")).toBe("pepsi-12");
  });
});

describe("mapBarcodeWriteError", () => {
  it("maps 23505 + product_barcodes to the duplicate-product message", () => {
    expect(
      mapBarcodeWriteError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "product_barcodes_unique_normalized_value"',
      })
    ).toBe(BARCODE_FORM_MESSAGES.duplicateOtherProduct);
  });

  it("maps an arbitrary 23505 on product_barcodes table to the duplicate message", () => {
    expect(
      mapBarcodeWriteError({
        code: "23505",
        message: 'duplicate key value violates unique constraint on table product_barcodes',
      })
    ).toBe(BARCODE_FORM_MESSAGES.duplicateOtherProduct);
  });

  it("passes other errors through getErrorMessage", () => {
    expect(mapBarcodeWriteError(new Error("network down"))).toBe("network down");
  });
});
