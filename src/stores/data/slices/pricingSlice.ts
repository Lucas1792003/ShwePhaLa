import type { StateCreator } from "zustand";
import type { DataState, PricingState } from "../types";
import type { PriceTier } from "../../../types";

export const createPricingSlice: StateCreator<DataState, [], [], PricingState> = (set, get) => ({
  priceTiers: [],

  addPriceTier: (tier: PriceTier) =>
    set((state) => ({ priceTiers: [...state.priceTiers, tier] })),

  updatePriceTier: (tier: PriceTier) =>
    set((state) => ({
      priceTiers: state.priceTiers.map((t) => (t.id === tier.id ? tier : t)),
    })),

  deletePriceTier: (tierId: string) =>
    set((state) => ({
      priceTiers: state.priceTiers.filter((t) => t.id !== tierId),
    })),

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
