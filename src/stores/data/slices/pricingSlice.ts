import type { StateCreator } from "zustand";
import type { DataState, PricingState } from "../types";
import type { PriceTier } from "../../../types";
import { dbExec } from "../../../lib/supabase";
import { writeTableRow } from "../tableWrite";

// snake_case row mapper for the price_tiers table
const priceTierRow = (t: PriceTier) => ({
  id: t.id, product_id: t.productId, shop_id: t.shopId ?? null,
  min_qty: t.minQty, max_qty: t.maxQty ?? null, price_mmk: t.priceMmk,
  is_active: t.isActive, created_at: t.createdAt, created_by: t.createdBy,
});

export const createPricingSlice: StateCreator<DataState, [], [], PricingState> = (set, get) => ({
  priceTiers: [],

  addPriceTier: async (tier: PriceTier) => {
    await dbExec(writeTableRow({ table: "price_tiers", op: "insert", id: tier.id, row: priceTierRow(tier), appRow: tier }), "Add price tier");
    set((state) => ({ priceTiers: [...state.priceTiers, tier] }));
  },

  updatePriceTier: async (tier: PriceTier) => {
    await dbExec(
      writeTableRow({
        table: "price_tiers", op: "update", id: tier.id,
        row: {
          product_id: tier.productId, shop_id: tier.shopId ?? null,
          min_qty: tier.minQty, max_qty: tier.maxQty ?? null,
          price_mmk: tier.priceMmk, is_active: tier.isActive,
        },
        appRow: tier,
      }),
      "Update price tier"
    );
    set((state) => ({
      priceTiers: state.priceTiers.map((t) => (t.id === tier.id ? tier : t)),
    }));
  },

  deletePriceTier: async (tierId: string) => {
    await dbExec(writeTableRow({ table: "price_tiers", op: "delete", id: tierId, row: {} }), "Delete price tier");
    set((state) => ({
      priceTiers: state.priceTiers.filter((t) => t.id !== tierId),
    }));
  },

  getProductPrice: (productId: string, shopId: string, qty: number) => {
    const state = get();
    const product = state.products.find((p) => p.id === productId);
    if (!product) return 0;

    // Find applicable price tiers (shop-specific first, then global)
    const tiers = state.priceTiers
      .filter((t) => t.productId === productId && t.isActive)
      .filter((t) => !t.shopId || t.shopId === shopId)
      .sort((a, b) => {
        // Prioritize shop-specific tiers
        if (a.shopId && !b.shopId) return -1;
        if (!a.shopId && b.shopId) return 1;
        // Then sort by minQty descending
        return b.minQty - a.minQty;
      });

    // Find the best matching tier for the quantity
    for (const tier of tiers) {
      const maxQty = tier.maxQty ?? Infinity;
      if (qty >= tier.minQty && qty <= maxQty) {
        return tier.priceMmk;
      }
    }

    // Fall back to base product price
    return product.priceMmk;
  },
});
