import type { StateCreator } from "zustand";
import type { DataState, ShopState } from "../types";
import type { Shop, User } from "../../../types";
import { supabase } from "../../../lib/supabase";

export const createShopSlice: StateCreator<DataState, [], [], ShopState> = (set) => ({
  shops: [],
  users: [],

  addShop: (shop: Shop) => {
    set((state) => ({ shops: [...state.shops, shop] }));
    void supabase.from("shops").insert({
      id: shop.id, code: shop.code, name: shop.name, address: shop.address,
      phone: shop.phone, email: shop.email, is_active: shop.isActive, created_at: shop.createdAt,
    });
  },

  updateShop: (shop: Shop) => {
    set((state) => ({
      shops: state.shops.map((item) => (item.id === shop.id ? shop : item)),
    }));
    void supabase.from("shops").update({
      code: shop.code, name: shop.name, address: shop.address,
      phone: shop.phone, email: shop.email, is_active: shop.isActive,
    }).eq("id", shop.id);
  },

  addUser: (user: User) => {
    set((state) => ({ users: [...state.users, user] }));
    void supabase.from("users").insert({
      id: user.id, name: user.name, email: user.email, role: user.role,
      shop_id: user.shopId, permissions: user.permissions,
      is_active: user.isActive, created_at: user.createdAt,
    });
  },

  updateUser: (user: User) => {
    set((state) => ({
      users: state.users.map((item) => (item.id === user.id ? user : item)),
    }));
    void supabase.from("users").update({
      name: user.name, email: user.email, role: user.role,
      shop_id: user.shopId, permissions: user.permissions, is_active: user.isActive,
    }).eq("id", user.id);
  },
});
