import type { Product, ProductUnit } from "../../types";

export interface ProductUnitValidationResult {
  valid: boolean;
  error?: string;
}

export const normalizeUnitName = (name: string) => name.trim().replace(/\s+/g, " ");

export const makeDefaultProductUnit = (
  productId: string,
  unitType: string,
  priceMmk: number,
  now = new Date().toISOString(),
): ProductUnit => ({
  id: `unit-${productId}-default`,
  productId,
  name: normalizeUnitName(unitType) || "Piece",
  baseQuantity: 1,
  priceMmk: Math.max(0, Math.trunc(priceMmk || 0)),
  isDefault: true,
  isActive: true,
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
});

export const getActiveProductUnits = (
  productId: string,
  productUnits: ProductUnit[],
): ProductUnit[] =>
  productUnits
    .filter((unit) => unit.productId === productId && unit.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

export const getDefaultProductUnit = (
  product: Product,
  productUnits: ProductUnit[],
): ProductUnit => {
  const active = getActiveProductUnits(product.id, productUnits);
  return (
    active.find((unit) => unit.isDefault) ??
    active[0] ??
    makeDefaultProductUnit(product.id, product.unitType, product.priceMmk, product.createdAt)
  );
};

export const validateProductUnits = (units: ProductUnit[]): ProductUnitValidationResult => {
  const active = units.filter((unit) => unit.isActive);
  if (active.length === 0) {
    return { valid: false, error: "At least one active sellable unit is required." };
  }

  const defaultUnits = active.filter((unit) => unit.isDefault);
  if (defaultUnits.length !== 1) {
    return { valid: false, error: "Exactly one active sellable unit must be the default." };
  }

  const seenNames = new Set<string>();
  for (const unit of active) {
    const name = normalizeUnitName(unit.name);
    if (!name) return { valid: false, error: "Sellable unit name is required." };
    if (!Number.isInteger(unit.baseQuantity) || unit.baseQuantity <= 0) {
      return { valid: false, error: `${name} needs a base quantity greater than 0.` };
    }
    if (!Number.isInteger(unit.priceMmk) || unit.priceMmk < 0) {
      return { valid: false, error: `${name} needs a non-negative MMK price.` };
    }
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      return { valid: false, error: `Duplicate sellable unit name: ${name}.` };
    }
    seenNames.add(key);
  }

  return { valid: true };
};

export const sanitizeProductUnits = (units: ProductUnit[], productId: string): ProductUnit[] => {
  const now = new Date().toISOString();
  return units.map((unit, index) => ({
    ...unit,
    productId,
    name: normalizeUnitName(unit.name),
    baseQuantity: Math.max(1, Math.trunc(unit.baseQuantity || 1)),
    priceMmk: Math.max(0, Math.trunc(unit.priceMmk || 0)),
    sortOrder: index,
    updatedAt: now,
    createdAt: unit.createdAt || now,
  }));
};

