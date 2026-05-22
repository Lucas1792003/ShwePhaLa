import type { StateCreator } from "zustand";
import type { DataState, CategoryState } from "../types";
import type { Category } from "../../../types";
import { supabase, dbWrite } from "../../../lib/supabase";
import { getCategoryDeleteBlockMessage } from "../../../features/categories/categoryUsage";

export const createCategorySlice: StateCreator<DataState, [], [], CategoryState> = (set, get) => ({
  categories: [],

  addCategory: (category: Category) => {
    set((state) => ({ categories: [...state.categories, category] }));
    dbWrite(supabase.from("categories").insert({
      id: category.id, name: category.name, color: category.color,
      icon_key: category.iconKey ?? null,
      is_active: category.isActive, created_at: category.createdAt,
    }), "addCategory");
  },

  updateCategory: (category: Category) => {
    set((state) => ({
      categories: state.categories.map((item) => (item.id === category.id ? category : item)),
    }));
    dbWrite(supabase.from("categories").update({
      name: category.name, color: category.color, icon_key: category.iconKey ?? null,
      is_active: category.isActive,
    }).eq("id", category.id), "updateCategory");
  },

  // Safe delete: a category is never removed while products still reference
  // it. Throws a friendly error so the caller can surface it; products are
  // never deleted or auto-reassigned.
  deleteCategory: (categoryId: string) => {
    const state = get();
    const category = state.categories.find((item) => item.id === categoryId);
    if (!category) return;

    const blockMessage = getCategoryDeleteBlockMessage(state.products, category.name);
    if (blockMessage) {
      throw new Error(blockMessage);
    }

    set((s) => ({
      categories: s.categories.map((item) =>
        item.id === categoryId ? { ...item, isActive: false } : item
      ),
    }));
    dbWrite(supabase.from("categories").update({ is_active: false }).eq("id", categoryId), "deleteCategory");
  },
});
