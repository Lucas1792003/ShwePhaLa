import type { StateCreator } from "zustand";
import type { DataState, ShopState } from "../types";
import type { Shop, User } from "../../../types";
import { supabase, dbExec } from "../../../lib/supabase";

export const createShopSlice: StateCreator<DataState, [], [], ShopState> = (set) => ({
  shops: [],
  users: [],

  addShop: async (shop: Shop) => {
    // Persist first — only show the shop locally once the database confirms it.
    await dbExec(supabase.from("shops").insert({
      id: shop.id, code: shop.code, name: shop.name, address: shop.address,
      phone: shop.phone ?? null, email: shop.email ?? null,
      is_active: shop.isActive, created_at: shop.createdAt,
    }), "Add shop");
    set((state) => ({ shops: [...state.shops, shop] }));
  },

  updateShop: async (shop: Shop) => {
    await dbExec(supabase.from("shops").update({
      code: shop.code, name: shop.name, address: shop.address,
      phone: shop.phone ?? null, email: shop.email ?? null, is_active: shop.isActive,
    }).eq("id", shop.id), "Update shop");
    set((state) => ({
      shops: state.shops.map((item) => (item.id === shop.id ? shop : item)),
    }));
  },

  addUser: async (user: User) => {
    // Persist first so a failed insert never leaves a phantom user in the UI.
    // auth_id is stored at creation so the new user is RLS-identifiable from
    // their first login (no reliance on the email self-heal).
    await dbExec(supabase.from("users").insert({
      id: user.id, name: user.name, email: user.email, role: user.role,
      shop_id: user.shopId ?? null, auth_id: user.authId ?? null,
      permissions: user.permissions ?? null,
      granted_permissions: user.grantedPermissions ?? null,
      revoked_permissions: user.revokedPermissions ?? null,
      is_active: user.isActive, created_at: user.createdAt,
    }), "Add user");
    set((state) => ({ users: [...state.users, user] }));
  },

  updateUser: async (user: User) => {
    await dbExec(supabase.from("users").update({
      name: user.name, email: user.email, role: user.role,
      shop_id: user.shopId ?? null, permissions: user.permissions ?? null,
      granted_permissions: user.grantedPermissions ?? null,
      revoked_permissions: user.revokedPermissions ?? null,
      is_active: user.isActive,
    }).eq("id", user.id), "Update user");
    set((state) => ({
      users: state.users.map((item) => (item.id === user.id ? user : item)),
    }));
  },
});
