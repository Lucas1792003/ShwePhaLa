import type { StateCreator } from "zustand";
import type { DataState, ShopState } from "../types";
import type { Shop, User } from "../../../types";
import { supabase, dbExec } from "../../../lib/supabase";
import { mapShopFormError, normalizeShopInput } from "../../../lib/shopValidation";
import {
  SHOP_DELETE_MESSAGES,
  countShopReferences,
  formatShopReferenceSummary,
  mapShopDeleteError,
} from "../../../lib/shopDelete";
import { useAppStore } from "../../appStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execShopWrite = async (query: PromiseLike<{ error: any }>, label: string): Promise<void> => {
  const { error } = await query;
  if (error) {
    console.error(`[DB] ${label} failed:`, error);
    throw new Error(mapShopFormError(error));
  }
};

export const createShopSlice: StateCreator<DataState, [], [], ShopState> = (set, get) => ({
  shops: [],
  users: [],

  addShop: async (shop: Shop) => {
    const normalized = normalizeShopInput(shop);
    const savedShop = { ...shop, ...normalized };
    // Persist first — only show the shop locally once the database confirms it.
    await execShopWrite(
      supabase.from("shops").insert({
        id: savedShop.id, code: savedShop.code, name: savedShop.name, address: savedShop.address,
        phone: savedShop.phone ?? null, email: savedShop.email ?? null,
        is_active: savedShop.isActive, created_at: savedShop.createdAt,
      }),
      "Add shop"
    );
    set((state) => ({ shops: [...state.shops, savedShop] }));
  },

  updateShop: async (shop: Shop) => {
    const normalized = normalizeShopInput(shop);
    const savedShop = { ...shop, ...normalized };
    await execShopWrite(
      supabase.from("shops").update({
        code: savedShop.code, name: savedShop.name, address: savedShop.address,
        phone: savedShop.phone ?? null, email: savedShop.email ?? null, is_active: savedShop.isActive,
      }).eq("id", savedShop.id),
      "Update shop"
    );
    set((state) => ({
      shops: state.shops.map((item) => (item.id === savedShop.id ? savedShop : item)),
    }));
  },

  deleteShop: async (shopId: string) => {
    // Local pre-check using already-loaded store data. ShopsPage is ADMIN-only,
    // so the store holds the full row set; the DB FK constraints on users /
    // inventory / supplier_payments / price_tiers are still the final guard
    // for anything missed (e.g. rows created since the last loadData).
    const state = get();
    const counts = countShopReferences(shopId, {
      users: state.users,
      inventory: state.inventory,
      shifts: state.shifts,
      sales: state.sales,
      purchaseOrders: state.purchaseOrders,
      supplierPayments: state.supplierPayments,
      stockTransfers: state.stockTransfers,
      priceTiers: state.priceTiers,
      refundVoidRequests: state.refundVoidRequests,
      auditLogs: state.auditLogs,
    });
    if (counts.total > 0) {
      throw new Error(
        `${SHOP_DELETE_MESSAGES.referenced} References: ${formatShopReferenceSummary(counts)}.`
      );
    }
    const { error } = await supabase.from("shops").delete().eq("id", shopId);
    if (error) {
      console.error(`[DB] Delete shop failed:`, error);
      throw new Error(mapShopDeleteError(error));
    }
    set((state) => ({ shops: state.shops.filter((s) => s.id !== shopId) }));
    const { currentShopId, setShopId } = useAppStore.getState();
    if (currentShopId === shopId) setShopId(null);
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
