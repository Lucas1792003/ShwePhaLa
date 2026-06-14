import { describe, expect, it } from "vitest";
import type { Supplier } from "../types";
import {
  SUPPLIER_FORM_MESSAGES,
  mapSupplierFormError,
  nextSupplierCode,
  validateSupplierInput,
} from "./supplierValidation";

const supplier = (overrides: Partial<Supplier>): Supplier => ({
  id: "sup-a",
  code: "SUP-001",
  name: "Supplier A",
  isActive: true,
  createdAt: "",
  ...overrides,
});

describe("supplier validation", () => {
  const suppliers: Supplier[] = [
    supplier({ id: "sup-b", code: "SUP-002", name: "Supplier B" }),
    supplier({ id: "sup-c", code: "SUP-003", name: "Supplier C" }),
  ];

  it("requires a code", () => {
    expect(validateSupplierInput({ code: "  ", name: "New" }, suppliers)).toBe(
      SUPPLIER_FORM_MESSAGES.codeRequired
    );
  });

  it("requires a name", () => {
    expect(validateSupplierInput({ code: "SUP-009", name: "  " }, suppliers)).toBe(
      SUPPLIER_FORM_MESSAGES.nameRequired
    );
  });

  it("blocks exact duplicate codes", () => {
    expect(validateSupplierInput({ code: "SUP-002", name: "New" }, suppliers)).toBe(
      SUPPLIER_FORM_MESSAGES.duplicateCode
    );
  });

  it("blocks case- and whitespace-insensitive duplicate codes", () => {
    expect(validateSupplierInput({ code: "  sup-002 ", name: "New" }, suppliers)).toBe(
      SUPPLIER_FORM_MESSAGES.duplicateCode
    );
  });

  it("allows editing the same supplier without changing its code", () => {
    expect(
      validateSupplierInput({ code: "SUP-002", name: "Supplier B Renamed" }, suppliers, "sup-b")
    ).toBeNull();
  });

  it("blocks editing another supplier to a duplicate code", () => {
    expect(
      validateSupplierInput({ code: "SUP-002", name: "Supplier C" }, suppliers, "sup-c")
    ).toBe(SUPPLIER_FORM_MESSAGES.duplicateCode);
  });

  it("accepts a unique code", () => {
    expect(validateSupplierInput({ code: "SUP-099", name: "New" }, suppliers)).toBeNull();
  });

  it("maps database duplicate-code index errors to the friendly message", () => {
    expect(
      mapSupplierFormError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "suppliers_unique_normalized_code"',
      })
    ).toBe(SUPPLIER_FORM_MESSAGES.duplicateCode);
  });
});

describe("nextSupplierCode", () => {
  it("returns SUP-001 for an empty list", () => {
    expect(nextSupplierCode([])).toBe("SUP-001");
  });

  it("returns max existing SUP number + 1 (ignores gaps)", () => {
    const suppliers: Supplier[] = [
      supplier({ id: "1", code: "SUP-001" }),
      supplier({ id: "2", code: "SUP-005" }),
      supplier({ id: "3", code: "SUP-003" }),
    ];
    expect(nextSupplierCode(suppliers)).toBe("SUP-006");
  });

  it("ignores codes that are not SUP-### shaped", () => {
    const suppliers: Supplier[] = [
      supplier({ id: "1", code: "ACME" }),
      supplier({ id: "2", code: "SUP-002" }),
    ];
    expect(nextSupplierCode(suppliers)).toBe("SUP-003");
  });
});
