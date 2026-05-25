/**
 * Human-friendly inventory display helpers.
 *
 * Inventory is stored in BASE units (the smallest configured unit per
 * product — see migrations 025 + 026). The DB never stores
 * "8 packages 22 cans"; it stores 214. These helpers translate
 * a base-unit integer into a multi-tier label using the product's
 * configured `product_units`.
 *
 * Greedy decomposition picks the largest active unit that fits, drops
 * the remainder to the next-smaller active unit, and so on until the
 * smallest (base, `baseQuantity === 1`) unit absorbs whatever is left.
 *
 * Example:
 *   baseQuantity = 214
 *   units = [{ name: "Case", baseQuantity: 24 }, { name: "Can", baseQuantity: 1 }]
 *   result = [{ unit: Case, qty: 8 }, { unit: Can, qty: 22 }]
 *   label  = "8 Case 22 Can"
 *
 * If no base-quantity-1 unit exists (legacy product without the
 * registry-seeded default), the helper falls back to displaying the
 * raw base-unit count plus the optional `baseUnitName` argument.
 */

import type { ProductUnit } from "../../types";

export interface DecomposedStockPart {
  unit: ProductUnit;
  qty: number;
}

const cleanBaseQty = (raw: number | undefined | null): number => {
  if (!Number.isFinite(raw ?? NaN)) return 0;
  return Math.max(0, Math.trunc(raw ?? 0));
};

const pickActiveUnitsDescending = (
  productUnits: ProductUnit[],
  productId: string,
): ProductUnit[] => {
  return productUnits
    .filter((u) => u.productId === productId && u.isActive && u.baseQuantity > 0)
    .sort((a, b) => {
      if (a.baseQuantity !== b.baseQuantity) return b.baseQuantity - a.baseQuantity;
      // Stable tiebreaker on sortOrder, then name, so the same input always
      // produces the same decomposition across renders.
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
};

/**
 * Greedy decomposition. Returns an empty array when `baseQuantity` is 0
 * (display layer can render "Out" / "0" itself). Skips zero-quantity tiers
 * so the label stays compact.
 */
export const decomposeBaseQuantity = (
  baseQuantity: number,
  productUnits: ProductUnit[],
  productId: string,
): DecomposedStockPart[] => {
  let remaining = cleanBaseQty(baseQuantity);
  if (remaining === 0) return [];

  const tiers = pickActiveUnitsDescending(productUnits, productId);
  if (tiers.length === 0) return [];

  const parts: DecomposedStockPart[] = [];
  for (const unit of tiers) {
    if (remaining <= 0) break;
    const qty = Math.floor(remaining / unit.baseQuantity);
    if (qty > 0) {
      parts.push({ unit, qty });
      remaining -= qty * unit.baseQuantity;
    }
  }

  // If no tier of baseQuantity 1 absorbs the remainder, fold it into the
  // last/smallest tier so we don't silently drop stock from the display.
  // This only happens for misconfigured registries (no base-unit row).
  if (remaining > 0 && parts.length > 0) {
    const smallest = parts[parts.length - 1];
    smallest.qty += Math.floor(remaining / smallest.unit.baseQuantity);
  }

  return parts;
};

/**
 * Render a decomposition as a single string, e.g. "8 Case 22 Can".
 *
 * `baseUnitName` is the safety net for products with no `product_units` rows
 * at all — falls back to `<n> <baseUnitName>` (or just `<n>` when no name
 * is provided). Pre-registry products that loaded from the legacy
 * `unit_type` text still hit this path until migration `026`'s INSERT
 * has populated their default unit.
 */
export const formatStockQuantity = (
  baseQuantity: number,
  productUnits: ProductUnit[],
  productId: string,
  baseUnitName?: string,
): string => {
  const safe = cleanBaseQty(baseQuantity);
  const parts = decomposeBaseQuantity(safe, productUnits, productId);
  if (parts.length === 0) {
    if (safe === 0) return baseUnitName ? `0 ${baseUnitName}` : "0";
    return baseUnitName ? `${safe} ${baseUnitName}` : String(safe);
  }
  return parts.map((p) => `${p.qty} ${p.unit.name}`).join(" ");
};

/**
 * Convert a typed quantity in some product unit back to base units, e.g.
 * "10 packages of 24" → 240. Used by purchase/transfer/adjust UIs that
 * accept a unit-and-quantity pair from the user but still need to write
 * base units to inventory. Server-side RPCs MUST re-validate the
 * conversion — never trust this client number for the final write.
 */
export const convertToBaseQuantity = (
  qty: number,
  unit: Pick<ProductUnit, "baseQuantity"> | undefined | null,
): number => {
  const cleanQty = Math.max(0, Math.trunc(Number.isFinite(qty) ? qty : 0));
  const factor = Math.max(1, Math.trunc(unit?.baseQuantity ?? 1));
  return cleanQty * factor;
};
