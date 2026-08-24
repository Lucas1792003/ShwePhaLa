import type { StateCreator } from "zustand";
import type { DataState, BrandState } from "../types";
import type { Brand } from "../../../types";
import { reportError } from "../../../lib/errors";
import { writeTableRow } from "../tableWrite";

export const createBrandSlice: StateCreator<DataState, [], [], BrandState> = (set, get) => ({
  brands: [],

  addBrand: async (brand: Brand) => {
    set((state) => ({ brands: [...state.brands, brand] }));
    const { error } = await writeTableRow({
      table: "brands", op: "insert", id: brand.id,
      row: {
        id: brand.id,
        category_id: brand.categoryId,
        name: brand.name,
        color: brand.color ?? null,
        is_active: brand.isActive,
        sort_order: brand.sortOrder,
        created_at: brand.createdAt,
        updated_at: brand.updatedAt,
      },
      appRow: brand,
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
    const { error } = await writeTableRow({
      table: "brands", op: "update", id: brand.id,
      row: {
        category_id: brand.categoryId,
        name: brand.name,
        color: brand.color ?? null,
        is_active: brand.isActive,
        sort_order: brand.sortOrder,
      },
      appRow: brand,
    });
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

    const deactivated = { ...brand, isActive: false };
    set((s) => ({
      brands: s.brands.map((b) =>
        b.id === brandId ? deactivated : b,
      ),
    }));
    const { error } = await writeTableRow({
      table: "brands", op: "update", id: brandId, row: { is_active: false }, appRow: deactivated,
    });
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
