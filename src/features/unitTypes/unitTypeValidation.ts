/**
 * Pure helpers for the dynamic Unit Type registry.
 *
 * Mirrors the DB constraints from migration 025:
 *   - case-insensitive unique name (trimmed)
 *   - case-insensitive unique abbreviation when present (trimmed)
 *   - name must not be blank
 *
 * Used by:
 *   - the Unit Types settings page (pre-flight validation, friendlier
 *     error than the raw Postgres unique-index error)
 *   - the Product form, to decide whether the saved product's legacy
 *     unit_type still maps to an active registry row
 */

import type { UnitType } from "../../types";

export const normalizeUnitTypeName = (value: string): string =>
  value.trim().toLowerCase();

export const normalizeUnitTypeAbbreviation = (value: string | undefined | null): string =>
  (value ?? "").trim().toLowerCase();

export interface UnitTypeFormInput {
  name: string;
  abbreviation?: string;
  description?: string;
}

export type UnitTypeValidationError =
  | { field: "name"; message: string }
  | { field: "abbreviation"; message: string };

/**
 * Validates a create/edit submission against the in-memory unit-type list.
 * Returns null when the input is valid.
 *
 * `editingId` lets the rule ignore the row being edited when checking
 * duplicates — so saving an unchanged row never trips its own conflict.
 */
export const validateUnitTypeForm = (
  input: UnitTypeFormInput,
  existing: UnitType[],
  editingId: string | null = null,
): UnitTypeValidationError | null => {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    return { field: "name", message: "Name is required." };
  }

  const trimmedAbbrev = (input.abbreviation ?? "").trim();
  // Abbreviation is optional, but if provided it must not be blank — the
  // DB CHECK constraint mirrors this so we surface a friendly error first.
  if (input.abbreviation !== undefined && input.abbreviation.length > 0 && trimmedAbbrev.length === 0) {
    return { field: "abbreviation", message: "Abbreviation cannot be blank." };
  }

  const normName = normalizeUnitTypeName(trimmedName);
  const dupName = existing.find(
    (u) => u.id !== editingId && normalizeUnitTypeName(u.name) === normName,
  );
  if (dupName) {
    return { field: "name", message: `"${dupName.name}" already exists.` };
  }

  if (trimmedAbbrev.length > 0) {
    const normAbbrev = normalizeUnitTypeAbbreviation(trimmedAbbrev);
    const dupAbbrev = existing.find(
      (u) =>
        u.id !== editingId &&
        u.abbreviation &&
        normalizeUnitTypeAbbreviation(u.abbreviation) === normAbbrev,
    );
    if (dupAbbrev) {
      return {
        field: "abbreviation",
        message: `Abbreviation "${dupAbbrev.abbreviation}" is already used by "${dupAbbrev.name}".`,
      };
    }
  }

  return null;
};

/**
 * Sort key for the dropdown: sort_order ascending, then name. Stable across
 * renders because both fields are deterministic.
 */
export const compareUnitTypes = (a: UnitType, b: UnitType): number => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name);
};

/**
 * Resolve a saved product's `unitType` string against the registry.
 *
 * Returns one of:
 *   { kind: "active",   unitType }       — matched, currently active
 *   { kind: "inactive", unitType }       — matched, deactivated by admin
 *   { kind: "legacy",   value: string }  — no match (pre-registry product)
 *
 * Match is case-insensitive on both `name` and `abbreviation` so that a
 * product saved as "piece" still resolves to the "Piece" registry row.
 */
export type ResolvedProductUnit =
  | { kind: "active"; unitType: UnitType }
  | { kind: "inactive"; unitType: UnitType }
  | { kind: "legacy"; value: string };

export const resolveProductUnit = (
  rawValue: string | undefined | null,
  registry: UnitType[],
): ResolvedProductUnit => {
  const value = (rawValue ?? "").trim();
  if (value.length === 0) return { kind: "legacy", value: "" };

  const norm = value.toLowerCase();
  const match = registry.find(
    (u) =>
      normalizeUnitTypeName(u.name) === norm ||
      (u.abbreviation && normalizeUnitTypeAbbreviation(u.abbreviation) === norm),
  );
  if (!match) return { kind: "legacy", value };
  return match.isActive ? { kind: "active", unitType: match } : { kind: "inactive", unitType: match };
};
