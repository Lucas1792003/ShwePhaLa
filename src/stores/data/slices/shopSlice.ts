import type { StateCreator } from "zustand";
import type { DataState, ShopState } from "../types";
import type { Shop, User } from "../../../types";

export const createShopSlice: StateCreator<DataState, [], [], ShopState> = (set) => ({
  shops: [],
  users: [],

  addShop: (shop: Shop) =>
    set((state) => ({ shops: [...state.shops, shop] })),

  updateShop: (shop: Shop) =>
    set((state) => ({
      shops: state.shops.map((item) => (item.id === shop.id ? shop : item)),
    })),

  addUser: (user: User) =>
    set((state) => ({ users: [...state.users, user] })),

  updateUser: (user: User) =>
    set((state) => ({
      users: state.users.map((item) => (item.id === user.id ? user : item)),
    })),
});
