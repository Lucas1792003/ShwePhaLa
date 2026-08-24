import type { StateCreator } from "zustand";
import type { DataState, PriceLevelState } from "../types";
import type { ProductUnitPrice } from "../../../types";
import { supabase } from "../../../lib/supabase";
import { newId } from "../../../lib/id";

export const createPriceLevelSlice: StateCreator<DataState, [], [], PriceLevelState> = (set, get) => ({
  priceLevels: [],
  productUnitPrices: [],

  /**
   * Replace per-level prices for a single product unit. Active rows the
   * caller did NOT include are soft-deactivated (the unique partial
   * indexes on `(product_unit_id, price_level_id) WHERE is_active` keep
   * us safe from collisions).
   *
   * Server is still the source of truth — `complete_sale` re-resolves
   * the price from `product_unit_prices` at checkout, so even if this
   * write races with a stale cart the cashier never overpays/underpays.
   */
  replaceProductUnitPrices: async (productUnitId, prices) => {
    const now = new Date().toISOString();
    const existing = get().productUnitPrices.filter((p) => p.productUnitId === productUnitId);

    // Match incoming rows to existing rows by (price_level_id, shop_id) so
    // we update prices in place instead of churning ids on every save.
    const matchKey = (priceLevelId: string, shopId?: string) =>
      `${priceLevelId}::${shopId ?? "global"}`;
    const existingByKey = new Map(
      existing.map((row) => [matchKey(row.priceLevelId, row.shopId), row]),
    );

    const upserts: ProductUnitPrice[] = prices.map((input) => {
      const key = matchKey(input.priceLevelId, input.shopId);
      const prior = existingByKey.get(key);
      return {
        id: prior?.id ?? newId("pup"),
        productUnitId,
        priceLevelId: input.priceLevelId,
        shopId: input.shopId,
        priceMmk: Math.max(0, Math.trunc(input.priceMmk)),
        isActive: true,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      };
    });
    const upsertedIds = new Set(upserts.map((row) => row.id));
    const deactivated = existing
      .filter((row) => !upsertedIds.has(row.id) && row.isActive)
      .map((row) => ({ ...row, isActive: false, updatedAt: now }));

    const rows = [...upserts, ...deactivated].map((row) => ({
      id: row.id,
      product_unit_id: row.productUnitId,
      price_level_id: row.priceLevelId,
      shop_id: row.shopId ?? null,
      price_mmk: row.priceMmk,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from("product_unit_prices").upsert(rows, { onConflict: "id" });
      if (error) {
        console.error("[DB] replaceProductUnitPrices failed:", error);
        throw new Error(error.message);
      }
    }

    set((state) => ({
      productUnitPrices: state.productUnitPrices
        .filter((p) => p.productUnitId !== productUnitId)
        .concat(upserts, deactivated),
    }));
  },
});
