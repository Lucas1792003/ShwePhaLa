import { describe, it, expect } from "vitest";
import type { UnitType } from "../../types";
import {
  compareUnitTypes,
  normalizeUnitTypeAbbreviation,
  normalizeUnitTypeName,
  resolveProductUnit,
  validateUnitTypeForm,
} from "./unitTypeValidation";

const makeUnit = (overrides: Partial<UnitType> & { id: string; name: string }): UnitType => ({
  id: overrides.id,
  name: overrides.name,
  abbreviation: overrides.abbreviation,
  description: overrides.description,
  isActive: overrides.isActive ?? true,
  sortOrder: overrides.sortOrder ?? 10,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
});

describe("normalizeUnitTypeName", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeUnitTypeName("  Piece  ")).toBe("piece");
    expect(normalizeUnitTypeName("KILOGRAM")).toBe("kilogram");
  });
});

describe("normalizeUnitTypeAbbreviation", () => {
  it("treats null/undefined as empty", () => {
    expect(normalizeUnitTypeAbbreviation(null)).toBe("");
    expect(normalizeUnitTypeAbbreviation(undefined)).toBe("");
  });
  it("trims and lowercases", () => {
    expect(normalizeUnitTypeAbbreviation(" KG ")).toBe("kg");
  });
});

describe("validateUnitTypeForm", () => {
  const existing: UnitType[] = [
    makeUnit({ id: "ut-piece", name: "Piece", abbreviation: "pc" }),
    makeUnit({ id: "ut-kg", name: "Kilogram", abbreviation: "kg" }),
  ];

  it("requires a non-blank name", () => {
    expect(validateUnitTypeForm({ name: "   " }, existing)).toEqual({
      field: "name",
      message: expect.any(String),
    });
  });

  it("blocks duplicate name case-insensitively", () => {
    const err = validateUnitTypeForm({ name: "  piece  " }, existing);
    expect(err?.field).toBe("name");
    expect(err?.message).toMatch(/already exists/i);
  });

  it("blocks duplicate abbreviation case-insensitively", () => {
    const err = validateUnitTypeForm({ name: "Pound", abbreviation: " KG " }, existing);
    expect(err?.field).toBe("abbreviation");
    expect(err?.message).toMatch(/already used/i);
  });

  it("allows editing the same row without tripping its own duplicate", () => {
    expect(
      validateUnitTypeForm({ name: "Piece", abbreviation: "pc" }, existing, "ut-piece"),
    ).toBeNull();
  });

  it("allows omitting the abbreviation entirely", () => {
    expect(validateUnitTypeForm({ name: "Pound" }, existing)).toBeNull();
  });

  it("rejects an abbreviation that is only whitespace", () => {
    const err = validateUnitTypeForm({ name: "Pound", abbreviation: "   " }, existing);
    expect(err?.field).toBe("abbreviation");
  });
});

describe("compareUnitTypes", () => {
  it("orders by sort_order ascending, then name", () => {
    const a = makeUnit({ id: "a", name: "Bottle", sortOrder: 30 });
    const b = makeUnit({ id: "b", name: "Can", sortOrder: 20 });
    const c = makeUnit({ id: "c", name: "Apple", sortOrder: 30 });
    const sorted = [a, b, c].sort(compareUnitTypes);
    expect(sorted.map((u) => u.id)).toEqual(["b", "c", "a"]);
  });
});

describe("resolveProductUnit", () => {
  const registry: UnitType[] = [
    makeUnit({ id: "ut-piece", name: "Piece", abbreviation: "pc", isActive: true }),
    makeUnit({ id: "ut-can", name: "Can", abbreviation: "can", isActive: false }),
  ];

  it("returns 'active' when the registry has a matching active row", () => {
    const r = resolveProductUnit("piece", registry);
    expect(r.kind).toBe("active");
  });

  it("matches by abbreviation case-insensitively", () => {
    const r = resolveProductUnit("PC", registry);
    expect(r.kind).toBe("active");
    if (r.kind === "active") expect(r.unitType.id).toBe("ut-piece");
  });

  it("returns 'inactive' for a deactivated registry row so edit forms can still show it", () => {
    const r = resolveProductUnit("Can", registry);
    expect(r.kind).toBe("inactive");
  });

  it("returns 'legacy' when no row matches (pre-registry product)", () => {
    const r = resolveProductUnit("kilogram", registry);
    expect(r.kind).toBe("legacy");
    if (r.kind === "legacy") expect(r.value).toBe("kilogram");
  });

  it("returns 'legacy' with empty value when the saved value is blank", () => {
    const r = resolveProductUnit("", registry);
    expect(r.kind).toBe("legacy");
    if (r.kind === "legacy") expect(r.value).toBe("");
  });
});
