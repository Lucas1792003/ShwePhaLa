import type { StateCreator } from "zustand";
import type { DataState, BrandState } from "../types";
import type { Brand } from "../../../types";
import { supabase } from "../../../lib/supabase";
import { reportError } from "../../../lib/errors";

export const createBrandSlice: StateCreator<DataState, [], [], BrandState> = (set, get) => ({
  brands: [],

  addBrand: async (brand: Brand) => {
    set((state) => ({ brands: [...state.brands, brand] }));
    const { error } = await supabase.from("brands").insert({
      id: brand.id,
      category_id: brand.categoryId,
      name: brand.name,
      color: brand.color ?? null,
      is_active: brand.isActive,
      sort_order: brand.sortOrder,
      created_at: brand.createdAt,
      updated_at: brand.updatedAt,
    });
    if (error) {
      set((state) => ({ brands: state.brands.filter((b) => b.id !== brand.id) }));
      throw new Error(reportError("addBrand", error, "Failed to add brand."));
    }
  },

  updateBrand: async (brand: Brand) => {
    const previous = get().brands.find((b) => b.id === brand.id);
    set((state) => ({
      brands: state.brands.map((b) => (b.id === brand.id ? brand : b)),
    }));
    const { error } = await supabase
      .from("brands")
      .update({
        category_id: brand.categoryId,
        name: brand.name,
        color: brand.color ?? null,
        is_active: brand.isActive,
        sort_order: brand.sortOrder,
      })
      .eq("id", brand.id);
    if (error) {
      if (previous) {
        set((state) => ({
          brands: state.brands.map((b) => (b.id === brand.id ? previous : b)),
        }));
      }
      throw new Error(reportError("updateBrand", error, "Failed to update brand."));
    }
  },

  deactivateBrand: async (brandId: string) => {
    const state = get();
    const brand = state.brands.find((b) => b.id === brandId);
    if (!brand) return;

    const stillUsed = state.products.some(
      (p) => p.brandId === brandId && p.isActive,
    );
    if (stillUsed) {
      throw new Error(
        `Cannot deactivate "${brand.name}" — it is still used by active products. Reassign or deactivate those products first.`,
      );
    }

    set((s) => ({
      brands: s.brands.map((b) =>
        b.id === brandId ? { ...b, isActive: false } : b,
      ),
    }));
    const { error } = await supabase
      .from("brands")
      .update({ is_active: false })
      .eq("id", brandId);
    if (error) {
      set((s) => ({
        brands: s.brands.map((b) =>
          b.id === brandId ? { ...b, isActive: true } : b,
        ),
      }));
      throw new Error(reportError("deactivateBrand", error, "Failed to deactivate brand."));
    }
  },
});
