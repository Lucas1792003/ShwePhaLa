import type { StateCreator } from "zustand";
import type { DataState, CategoryState } from "../types";
import type { Category } from "../../../types";

export const createCategorySlice: StateCreator<DataState, [], [], CategoryState> = (set) => ({
  categories: [],

  addCategory: (category: Category) =>
    set((state) => ({ categories: [...state.categories, category] })),

  updateCategory: (category: Category) =>
    set((state) => ({
      categories: state.categories.map((item) => (item.id === category.id ? category : item)),
    })),

  deleteCategory: (categoryId: string) =>
    set((state) => ({
      categories: state.categories.map((item) =>
        item.id === categoryId ? { ...item, isActive: false } : item
      ),
    })),
});
