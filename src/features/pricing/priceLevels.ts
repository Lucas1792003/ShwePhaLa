/**
 * Frontend price-level resolver.
 *
 * Mirrors the server-side fallback chain in migration 030's
 * `complete_sale`. Use it for cart previews and the product form's
 * "current price" display. The server is still the authority — the
 * final price that gets billed comes from `complete_sale`, not from
 * this helper.
 *
 * Fallback chain (matching the SQL):
 *   1. shop-specific override at the requested level
 *   2. global price at the requested level
 *   3. (when requested level ≠ default) the default level via the same
 *      shop-then-global chain — recorded as `retail_fallback_*`
 *   4. legacy `product_units.sale_price_mmk` — recorded as
 *      `legacy_sale_price`
 *
 * Never returns `undefined`. When no price is found, returns an
 * explicit `{ priceMmk: 0, source: "missing" }` so the caller can
 * decide whether to block the cart add or show an inline warning.
 */

import type { PriceLevel, ProductUnit, ProductUnitPrice } from "../../types";

export type ResolvedPriceSource =
  | "shop_override"
  | "global_price_level"
  | "retail_fallback_shop"
  | "retail_fallback_global"
  | "legacy_sale_price"
  | "missing";

export interface ResolvedPrice {
  priceMmk: number;
  priceLevelId: string;
  priceLevelName: string;
  /** True when we couldn't honour the requested level and fell back. */
  isFallback: boolean;
  source: ResolvedPriceSource;
}

export const getDefaultPriceLevel = (priceLevels: PriceLevel[]): PriceLevel | undefined =>
  priceLevels.find((pl) => pl.isActive && pl.isDefault) ??
  priceLevels.find((pl) => pl.isActive);

export const getActivePriceLevels = (priceLevels: PriceLevel[]): PriceLevel[] =>
  [...priceLevels]
    .filter((pl) => pl.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

const findPrice = (
  rows: ProductUnitPrice[],
  productUnitId: string,
  priceLevelId: string,
  shopId: string | undefined,
): ProductUnitPrice | undefined =>
  rows.find(
    (p) =>
      p.isActive &&
      p.productUnitId === productUnitId &&
      p.priceLevelId === priceLevelId &&
      (shopId === undefined ? p.shopId == null : p.shopId === shopId),
  );

interface ResolveInput {
  unit: Pick<ProductUnit, "id" | "salePriceMmk">;
  priceLevelId: string;
  shopId?: string;
  priceLevels: PriceLevel[];
  productUnitPrices: ProductUnitPrice[];
}

/**
 * Resolve the price a cashier should see for a given product unit at a
 * given price level in a given shop. See file-level docstring.
 */
export const resolveProductUnitPrice = ({
  unit,
  priceLevelId,
  shopId,
  priceLevels,
  productUnitPrices,
}: ResolveInput): ResolvedPrice => {
  const requestedLevel =
    priceLevels.find((pl) => pl.id === priceLevelId && pl.isActive) ??
    getDefaultPriceLevel(priceLevels);

  // No active levels at all — only legacy is left. The form/POS still
  // renders something so the cashier isn't blocked.
  if (!requestedLevel) {
    return {
      priceMmk: unit.salePriceMmk,
      priceLevelId: priceLevelId || "",
      priceLevelName: "",
      isFallback: true,
      source: "legacy_sale_price",
    };
  }

  // (1) Shop-specific override at requested level.
  if (shopId !== undefined) {
    const shopHit = findPrice(productUnitPrices, unit.id, requestedLevel.id, shopId);
    if (shopHit) {
      return {
        priceMmk: shopHit.priceMmk,
        priceLevelId: requestedLevel.id,
        priceLevelName: requestedLevel.name,
        isFallback: false,
        source: "shop_override",
      };
    }
  }

  // (2) Global price at requested level.
  const globalHit = findPrice(productUnitPrices, unit.id, requestedLevel.id, undefined);
  if (globalHit) {
    return {
      priceMmk: globalHit.priceMmk,
      priceLevelId: requestedLevel.id,
      priceLevelName: requestedLevel.name,
      isFallback: false,
      source: "global_price_level",
    };
  }

  // (3+4) Fall back to the default level (shop, then global, then legacy)
  // — only when the requested level isn't already the default.
  const defaultLevel = getDefaultPriceLevel(priceLevels);
  if (defaultLevel && defaultLevel.id !== requestedLevel.id) {
    if (shopId !== undefined) {
      const defShop = findPrice(productUnitPrices, unit.id, defaultLevel.id, shopId);
      if (defShop) {
        return {
          priceMmk: defShop.priceMmk,
          priceLevelId: defaultLevel.id,
          priceLevelName: defaultLevel.name,
          isFallback: true,
          source: "retail_fallback_shop",
        };
      }
    }
    const defGlobal = findPrice(productUnitPrices, unit.id, defaultLevel.id, undefined);
    if (defGlobal) {
      return {
        priceMmk: defGlobal.priceMmk,
        priceLevelId: defaultLevel.id,
        priceLevelName: defaultLevel.name,
        isFallback: true,
        source: "retail_fallback_global",
      };
    }
  }

  // (5) Legacy column — keeps pre-030 products sellable.
  return {
    priceMmk: unit.salePriceMmk,
    priceLevelId: requestedLevel.id,
    priceLevelName: requestedLevel.name,
    isFallback: true,
    source: "legacy_sale_price",
  };
};
