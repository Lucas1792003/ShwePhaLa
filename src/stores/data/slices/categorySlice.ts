import type { StateCreator } from "zustand";
import type { DataState, CategoryState } from "../types";
import type { Category } from "../../../types";
import { supabase } from "../../../lib/supabase";

export const createCategorySlice: StateCreator<DataState, [], [], CategoryState> = (set) => ({
  categories: [],

  addCategory: (category: Category) => {
    set((state) => ({ categories: [...state.categories, category] }));
    void supabase.from("categories").insert({
      id: category.id, name: category.name, color: category.color,
      is_active: category.isActive, created_at: category.createdAt,
    });
  },

  updateCategory: (category: Category) => {
    set((state) => ({
      categories: state.categories.map((item) => (item.id === category.id ? category : item)),
    }));
    void supabase.from("categories").update({
      name: category.name, color: category.color, is_active: category.isActive,
    }).eq("id", category.id);
  },

  deleteCategory: (categoryId: string) => {
    set((state) => ({
      categories: state.categories.map((item) =>
        item.id === categoryId ? { ...item, isActive: false } : item
      ),
    }));
    void supabase.from("categories").update({ is_active: false }).eq("id", categoryId);
  },
});
