import { describe, it, expect } from "vitest";
import type { User, Sale, StockTransfer, PurchaseOrder, PriceTier, Permission } from "../types";
import {
  ALL_PERMISSIONS,
  ROUTE_PERMISSIONS,
  getRolePermissions,
  getEffectivePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canAccessShop,
  hasShopPermission,
  canVoidSale,
  canRefundSale,
  canAdjustInventory,
  canCompleteTransfer,
  canReceivePurchaseOrder,
  canApprovePurchaseOrder,
  canManagePriceTier,
} from "./permissions";

// ---- builders -------------------------------------------------------------

const makeUser = (over: Partial<User> = {}): User => ({
  id: "u-1",
  name: "Test User",
  role: "CASHIER",
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

const makeSale = (shopId: string): Sale => ({
  id: "sale-1", shopId, shiftId: "shift-1", receiptNo: "R-1", cashierId: "c-1",
  status: "NORMAL", subtotalMmk: 0, discountMmk: 0, totalMmk: 0,
  paymentMethod: "CASH", paidMmk: 0, changeMmk: 0, createdAt: "2026-01-01T00:00:00Z",
});

const makeTransfer = (fromShopId: string): StockTransfer => ({
  id: "t-1", transferNo: "TRF-1", fromShopId, toShopId: "shop-other",
  status: "APPROVED", createdBy: "u", createdAt: "2026-01-01T00:00:00Z",
});

const makePO = (shopId: string): PurchaseOrder => ({
  id: "po-1", orderNo: "PO-1", shopId, supplierId: "sup-1", status: "APPROVED",
  subtotalMmk: 0, totalMmk: 0, createdBy: "u", createdAt: "2026-01-01T00:00:00Z",
});

// ---- role defaults --------------------------------------------------------

describe("role default permissions", () => {
  it("ADMIN holds every permission in the registry", () => {
    const admin = makeUser({ role: "ADMIN" });
    for (const p of ALL_PERMISSIONS) {
      expect(hasPermission(admin, p)).toBe(true);
    }
    expect(getRolePermissions("ADMIN")).toHaveLength(ALL_PERMISSIONS.length);
  });

  it("MANAGER has shop-level permissions but not admin-only ones", () => {
    const manager = makeUser({ role: "MANAGER", shopId: "shop-a" });
    expect(hasPermission(manager, "inventory:adjust")).toBe(true);
    expect(hasPermission(manager, "transfer:approve")).toBe(true);
    expect(hasPermission(manager, "sale:view")).toBe(true);
    expect(hasPermission(manager, "shop:create")).toBe(false);
    expect(hasPermission(manager, "report:global")).toBe(false);
    expect(hasPermission(manager, "pricing:manage")).toBe(false);
    expect(hasPermission(manager, "purchase:approve")).toBe(false);
  });

  it("CASHIER has POS permissions but not management ones", () => {
    const cashier = makeUser({ role: "CASHIER", shopId: "shop-a" });
    expect(hasPermission(cashier, "pos:create_sale")).toBe(true);
    expect(hasPermission(cashier, "sale:view")).toBe(true);
    expect(hasPermission(cashier, "report:shop")).toBe(true);
    expect(hasPermission(cashier, "inventory:read")).toBe(true);
    expect(hasPermission(cashier, "pos:void_sale")).toBe(false);
    expect(hasPermission(cashier, "inventory:adjust")).toBe(false);
  });

  it("BUYER has only catalog read access", () => {
    const buyer = makeUser({ role: "BUYER" });
    expect(hasPermission(buyer, "product:read")).toBe(true);
    expect(hasPermission(buyer, "pos:create_sale")).toBe(false);
    expect(getRolePermissions("BUYER")).toEqual(["product:read"]);
  });
});

// ---- grant / revoke model -------------------------------------------------

describe("grant / revoke model", () => {
  it("a granted permission adds access beyond the role default", () => {
    const cashier = makeUser({ role: "CASHIER", grantedPermissions: ["inventory:adjust"] });
    expect(hasPermission(cashier, "inventory:adjust")).toBe(true);
  });

  it("a revoked permission removes a role default", () => {
    const manager = makeUser({ role: "MANAGER", revokedPermissions: ["pos:void_sale"] });
    expect(hasPermission(manager, "pos:void_sale")).toBe(false);
  });

  it("revoke wins over grant", () => {
    const user = makeUser({
      role: "CASHIER",
      grantedPermissions: ["inventory:adjust"],
      revokedPermissions: ["inventory:adjust"],
    });
    expect(hasPermission(user, "inventory:adjust")).toBe(false);
  });

  it("revoke wins over a role default", () => {
    const manager = makeUser({ role: "MANAGER", revokedPermissions: ["transfer:approve"] });
    expect(getEffectivePermissions(manager)).not.toContain("transfer:approve");
  });

  it("effective set = roleDefaults ∪ granted − revoked", () => {
    const cashier = makeUser({
      role: "CASHIER",
      grantedPermissions: ["pos:void_sale"],
      revokedPermissions: ["report:shop"],
    });
    const eff = getEffectivePermissions(cashier);
    expect(eff).toContain("pos:create_sale"); // role default kept
    expect(eff).toContain("pos:void_sale");   // granted
    expect(eff).not.toContain("report:shop"); // revoked
  });
});

// ---- legacy compatibility -------------------------------------------------

describe("legacy permissions fallback", () => {
  it("a pre-migration user with replacement `permissions` keeps exactly that set", () => {
    const legacy = makeUser({ role: "CASHIER", permissions: ["product:read"] });
    expect(getEffectivePermissions(legacy)).toEqual(["product:read"]);
    expect(hasPermission(legacy, "pos:create_sale")).toBe(false); // role default NOT re-added
  });

  it("once grant/deny data exists, legacy `permissions` is ignored", () => {
    const migrated = makeUser({
      role: "CASHIER",
      permissions: ["product:read"],
      grantedPermissions: [],
      revokedPermissions: [],
    });
    expect(hasPermission(migrated, "pos:create_sale")).toBe(true); // role default applies
  });
});

// ---- inactive / missing user ---------------------------------------------

describe("inactive and missing users", () => {
  it("an inactive user has no permissions", () => {
    const admin = makeUser({ role: "ADMIN", isActive: false });
    expect(hasPermission(admin, "pos:create_sale")).toBe(false);
  });

  it("null / undefined user is denied", () => {
    expect(hasPermission(null, "pos:create_sale")).toBe(false);
    expect(hasPermission(undefined, "pos:create_sale")).toBe(false);
    expect(hasAnyPermission(null, ["pos:create_sale"])).toBe(false);
  });
});

// ---- hasAny / hasAll ------------------------------------------------------

describe("hasAnyPermission / hasAllPermissions", () => {
  it("hasAnyPermission is true when at least one matches", () => {
    const cashier = makeUser({ role: "CASHIER" });
    expect(hasAnyPermission(cashier, ["pos:void_sale", "pos:create_sale"])).toBe(true);
  });

  it("hasAllPermissions is false when one is missing", () => {
    const cashier = makeUser({ role: "CASHIER" });
    expect(hasAllPermissions(cashier, ["pos:create_sale", "pos:void_sale"])).toBe(false);
  });
});

// ---- shop-aware checks ----------------------------------------------------

describe("shop-aware access", () => {
  it("a manager can access only their assigned shop", () => {
    const manager = makeUser({ role: "MANAGER", shopId: "shop-a" });
    expect(canAccessShop(manager, "shop-a")).toBe(true);
    expect(canAccessShop(manager, "shop-b")).toBe(false);
  });

  it("an ADMIN can access every shop", () => {
    const admin = makeUser({ role: "ADMIN" });
    expect(canAccessShop(admin, "shop-a")).toBe(true);
    expect(canAccessShop(admin, "shop-zzz")).toBe(true);
  });

  it("hasShopPermission requires both the permission and shop access", () => {
    const manager = makeUser({ role: "MANAGER", shopId: "shop-a" });
    expect(hasShopPermission(manager, "inventory:adjust", "shop-a")).toBe(true);
    expect(hasShopPermission(manager, "inventory:adjust", "shop-b")).toBe(false);
  });

  it("permission alone is not enough without shop access", () => {
    const cashier = makeUser({ role: "CASHIER", shopId: "shop-a" });
    // cashier has no inventory:adjust at all
    expect(hasShopPermission(cashier, "inventory:adjust", "shop-a")).toBe(false);
  });
});

// ---- workflow helpers -----------------------------------------------------

describe("workflow helpers", () => {
  it("canVoidSale: manager only for sales in their shop", () => {
    const manager = makeUser({ role: "MANAGER", shopId: "shop-a" });
    expect(canVoidSale(manager, makeSale("shop-a"))).toBe(true);
    expect(canVoidSale(manager, makeSale("shop-b"))).toBe(false);
  });

  it("canVoidSale / canRefundSale: cashier never can", () => {
    const cashier = makeUser({ role: "CASHIER", shopId: "shop-a" });
    expect(canVoidSale(cashier, makeSale("shop-a"))).toBe(false);
    expect(canRefundSale(cashier, makeSale("shop-a"))).toBe(false);
  });

  it("canVoidSale: admin can for any shop", () => {
    const admin = makeUser({ role: "ADMIN" });
    expect(canVoidSale(admin, makeSale("shop-anything"))).toBe(true);
  });

  it("canAdjustInventory respects shop scope", () => {
    const manager = makeUser({ role: "MANAGER", shopId: "shop-a" });
    expect(canAdjustInventory(manager, "shop-a")).toBe(true);
    expect(canAdjustInventory(manager, "shop-b")).toBe(false);
  });

  it("canCompleteTransfer checks the source shop", () => {
    const manager = makeUser({ role: "MANAGER", shopId: "shop-a" });
    expect(canCompleteTransfer(manager, makeTransfer("shop-a"))).toBe(true);
    expect(canCompleteTransfer(manager, makeTransfer("shop-b"))).toBe(false);
  });

  it("canReceivePurchaseOrder checks the PO shop", () => {
    const manager = makeUser({ role: "MANAGER", shopId: "shop-a" });
    expect(canReceivePurchaseOrder(manager, makePO("shop-a"))).toBe(true);
    expect(canReceivePurchaseOrder(manager, makePO("shop-b"))).toBe(false);
  });

  it("canApprovePurchaseOrder: manager cannot, admin can", () => {
    const manager = makeUser({ role: "MANAGER", shopId: "shop-a" });
    const admin = makeUser({ role: "ADMIN" });
    expect(canApprovePurchaseOrder(manager, makePO("shop-a"))).toBe(false);
    expect(canApprovePurchaseOrder(admin, makePO("shop-a"))).toBe(true);
  });

  it("canManagePriceTier: admin yes, manager no", () => {
    const admin = makeUser({ role: "ADMIN" });
    const manager = makeUser({ role: "MANAGER", shopId: "shop-a" });
    const globalTier = { shopId: undefined } as PriceTier;
    const shopTier = { shopId: "shop-a" } as PriceTier;
    expect(canManagePriceTier(admin, globalTier)).toBe(true);
    expect(canManagePriceTier(admin, shopTier)).toBe(true);
    expect(canManagePriceTier(manager, shopTier)).toBe(false);
  });
});

// ---- registry / coarse system removed ------------------------------------

describe("permission registry", () => {
  it("old coarse permission names are not part of the registry", () => {
    const coarse = ["VIEW_POS", "VIEW_SALES", "MANAGE_PRODUCTS", "VIEW_REPORTS", "MANAGE_SHOPS"];
    for (const name of coarse) {
      expect((ALL_PERMISSIONS as readonly string[]).includes(name)).toBe(false);
    }
  });

  it("every route guard maps to a real granular permission", () => {
    for (const perm of Object.values(ROUTE_PERMISSIONS)) {
      expect((ALL_PERMISSIONS as readonly Permission[]).includes(perm)).toBe(true);
    }
  });

  it("route guards resolve through the granular permission system", () => {
    const cashier = makeUser({ role: "CASHIER", shopId: "shop-a" });
    const admin = makeUser({ role: "ADMIN" });
    // POS route — cashier allowed
    expect(hasPermission(cashier, ROUTE_PERMISSIONS.pos)).toBe(true);
    // Admin-only route — cashier denied, admin allowed
    expect(hasPermission(cashier, ROUTE_PERMISSIONS.adminShops)).toBe(false);
    expect(hasPermission(admin, ROUTE_PERMISSIONS.adminShops)).toBe(true);
  });
});
