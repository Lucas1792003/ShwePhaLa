import type { StateCreator } from "zustand";
import type { DataState, CategoryState } from "../types";
import type { Category } from "../../../types";
import { supabase, dbWrite } from "../../../lib/supabase";

export const createCategorySlice: StateCreator<DataState, [], [], CategoryState> = (set) => ({
  categories: [],

  addCategory: (category: Category) => {
    set((state) => ({ categories: [...state.categories, category] }));
    dbWrite(supabase.from("categories").insert({
      id: category.id, name: category.name, color: category.color,
      is_active: category.isActive, created_at: category.createdAt,
    }), "addCategory");
  },

  updateCategory: (category: Category) => {
    set((state) => ({
      categories: state.categories.map((item) => (item.id === category.id ? category : item)),
    }));
    dbWrite(supabase.from("categories").update({
      name: category.name, color: category.color, is_active: category.isActive,
    }).eq("id", category.id), "updateCategory");
  },

  deleteCategory: (categoryId: string) => {
    set((state) => ({
      categories: state.categories.map((item) =>
        item.id === categoryId ? { ...item, isActive: false } : item
      ),
    }));
    dbWrite(supabase.from("categories").update({ is_active: false }).eq("id", categoryId), "deleteCategory");
  },
});
