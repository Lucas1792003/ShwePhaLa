# 05 · Roles & Permissions

Granular permission strings (e.g. `pos:create_sale`) are the **single source
of truth**. The old coarse permissions are gone.

- Frontend registry: `src/lib/permissions.ts` (+ `ALL_PERMISSIONS` and
  `DEFAULT_ROLE_PERMISSIONS` in `src/types/domain.ts`).
- SQL contract: `role_default_permissions()` in
  `014_rbac_role_tuning.sql`. The two **must be kept in sync**.

## Roles

| Role | Description | Shop scope |
| --- | --- | --- |
| **ADMIN** | Full system access, every permission, all shops | Multi-shop |
| **MANAGER** | Shop management + operations | Assigned shop only |
| **CASHIER** | POS + own shift only | Assigned shop only |
| **BUYER** | Catalog browse + purchase-order creation | Assigned shop only |

> **BUYER is per-shop.** A shopless BUYER is a misconfiguration. The Users
> page requires a `shopId` for every non-admin role.

## Effective Permissions: Grant / Revoke Model

```
effective = roleDefaults  ∪  grantedPermissions  −  revokedPermissions
```

A revoke always wins over a role default and over a grant.

```ts
interface User {
  role: Role;
  grantedPermissions?: Permission[]; // additive
  revokedPermissions?: Permission[]; // explicit denials
  permissions?: Permission[];        // @deprecated legacy replacement list
}
```

This lets you, for example, grant one cashier `transfer:approve` without
changing their role, or grant a specific manager `report:shop_profit`.

> The deprecated `permissions` field used replacement semantics. It is
> kept only for migration safety — `002_rbac_permissions.sql` converts
> existing values into `grantedPermissions` / `revokedPermissions`, and
> `014_rbac_role_tuning.sql` remaps renamed permissions inside those
> arrays.

## Shop Scope

A matching permission is **not sufficient** for a shop-scoped action. The
user must also be allowed to act within the target shop. The helper
`hasShopPermission(user, perm, shopId)` checks both. ADMIN spans all
shops; MANAGER / CASHIER / BUYER are locked to their assigned `shopId`.

## Permission Matrix (defaults)

ADMIN holds every permission. Per-role defaults for the others below; see
the legacy detail in
[`archive/01-roles-permissions.md`](./archive/01-roles-permissions.md) for
column-by-column coverage.

### Shop / User / Audit

| Permission | M | C | B |
| --- | :-: | :-: | :-: |
| `shop:read` | ✅ | ❌ | ❌ |
| `user:read` | ✅ | ❌ | ❌ |
| `audit:view_shop` | ✅ | ❌ | ❌ |

### Products / Barcodes / Pricing

| Permission | M | C | B |
| --- | :-: | :-: | :-: |
| `product:read` | ✅ | ✅ | ✅ |
| `product:update` | ✅ | ❌ | ❌ |
| `product:edit_price` | ✅ | ❌ | ❌ |
| `barcode:manage` | ❌ | ❌ | ❌ |
| `pricing:manage` | ❌ | ❌ | ❌ |

### Inventory & Transfers

| Permission | M | C | B |
| --- | :-: | :-: | :-: |
| `inventory:view_stock` | ✅ | ✅ | ❌ |
| `inventory:view_movements` | ✅ | ❌ | ❌ |
| `inventory:adjust` | ✅ | ❌ | ❌ |
| `inventory:damage` | ✅ | ❌ | ❌ |
| `inventory:override_negative` | ✅ | ❌ | ❌ |
| `transfer:view` | ✅ | ❌ | ❌ |
| `transfer:create` | ✅ | ❌ | ❌ |
| `transfer:approve` | ✅ | ❌ | ❌ |
| `transfer:cancel` | ❌ | ❌ | ❌ |

### POS, Sales, Receipts

| Permission | M | C | B |
| --- | :-: | :-: | :-: |
| `pos:create_sale` | ✅ | ✅ | ❌ |
| `pos:apply_discount` | ✅ | ✅ | ❌ |
| `pos:override_price` | ✅ | ❌ | ❌ |
| `pos:override_stock` | ✅ | ❌ | ❌ |
| `pos:request_refund` / `pos:request_void` | ✅ | ✅ | ❌ |
| `pos:refund` / `pos:void_sale` | ✅ | ❌ | ❌ |
| `sale:view` | ✅ | ❌ | ❌ |
| `sales:view_own_shift` | ✅ | ✅ | ❌ |
| `receipt:reprint` | ✅ | ✅ | ❌ |

### Suppliers & Purchasing

| Permission | M | C | B |
| --- | :-: | :-: | :-: |
| `supplier:read` | ✅ | ❌ | ✅ |
| `supplier:update` / `supplier:create` / `supplier:delete` | ❌ | ❌ | ❌ |
| `supplier:debt_view` | ✅ | ❌ | ✅ |
| `supplier:payment_create` | ✅ | ❌ | ❌ |
| `purchase:view` | ✅ | ❌ | ✅ |
| `purchase:create` | ✅ | ❌ | ✅ |
| `purchase:receive` | ✅ | ❌ | ❌ |
| `purchase:approve` | ❌ | ❌ | ❌ |

### Shifts & Reports

| Permission | M | C | B |
| --- | :-: | :-: | :-: |
| `shift:manage_own` | ✅ | ✅ | ❌ |
| `shift:manage_all` / `shift:verify` | ✅ | ❌ | ❌ |
| `report:own_shift` | ✅ | ✅ | ❌ |
| `report:shop_sales` / `report:shop_inventory` | ✅ | ❌ | ❌ |
| `report:shop_profit` | ❌ | ❌ | ❌ |
| `report:global` | ❌ | ❌ | ❌ |

### Approvals

| Permission | M | C | B |
| --- | :-: | :-: | :-: |
| `approval:view` | ✅ | ❌ | ❌ |

## Permission count

| Role | Count |
| --- | --- |
| ADMIN | 56 (full access) |
| MANAGER | 38 |
| CASHIER | 10 |
| BUYER | 5 |

## Route / Sidebar Access (summary)

The router and sidebar both consult `ROUTE_PERMISSIONS`. Sidebar entries
are filtered by the same permission; a user with no `supplier:read` will
not see the Suppliers nav item.

| Route | Permission |
| --- | --- |
| `/app/dashboard` | `report:shop_sales` |
| `/app/pos` | `pos:create_sale` |
| `/app/sales`, `/app/sales/:saleId` | `sales:view_own_shift` |
| `/app/shifts` | `shift:manage_own` |
| `/app/inventory` | `inventory:view_stock` |
| `/app/transfers` | `transfer:view` |
| `/app/purchases` | `purchase:view` |
| `/app/suppliers`, `/app/suppliers/:supplierId` | `supplier:read` |
| `/app/approvals` | `approval:view` |
| `/app/reports`, `/app/reports/profit` | `report:shop_sales` / `report:shop_profit` |
| `/app/catalog` | `product:read` |
| `/app/barcode-labels` | `product:read` + ADMIN/MANAGER role gate |
| `/app/admin/*` | each gated by its admin permission |

## Helpers

```ts
import {
  hasPermission, hasAnyPermission, hasAllPermissions,
  hasShopPermission, canAccessShop,
  canVoidSale, canRefundSale, canAdjustInventory, canCompleteTransfer,
  canReceivePurchaseOrder, canApprovePurchaseOrder, canRecordSupplierPayment,
  canManagePriceTier,
  getEffectivePermissions, getRolePermissions,
  ALL_PERMISSIONS, ROUTE_PERMISSIONS,
} from "@/lib/permissions";
```

SQL counterparts (used by RLS and RPCs):
`current_app_user()`, `app_role()`, `app_shop_id()`, `app_user_id()`,
`app_has_perm(perm)`, `app_can_for_shop(perm, shop_id)`.

## What CASHIER specifically cannot do

This is a frequent source of bugs in role-based UIs. CASHIER's narrowed
defaults (post `014`) explicitly **lack**:

- `inventory:view_movements` (Movements tab + ledger reads)
- `inventory:adjust`, `inventory:damage`, `inventory:override_negative`
- `transfer:*`, `purchase:*`, `supplier:*`
- `pos:override_price`, `pos:override_stock`
- `pos:refund`, `pos:void_sale` (can only *request*)
- `sale:view` (only `sales:view_own_shift`)
- `report:shop_sales`, `report:shop_profit`, `report:shop_inventory`,
  `report:global`
- `audit:view_shop`, `audit:view_global`
- `pricing:manage`, `barcode:manage`, `approval:view`
- `shift:manage_all`, `shift:verify`
