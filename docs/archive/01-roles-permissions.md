# Roles & Permissions

## Overview

The system uses **granular permission-based access control**. Each user has a
role that provides a set of default permissions; individual users may also have
**grant** and **revoke** overrides for fine-grained control.

The granular permissions (e.g. `pos:create_sale`) are the **single source of
truth**. The old coarse permission system has been removed. The central
registry lives in `src/lib/permissions.ts`, and the permission list + role
defaults in `src/types/domain.ts`. The SQL half of the contract is
`role_default_permissions()` in the latest RBAC migration — it MUST be kept in
sync with `DEFAULT_ROLE_PERMISSIONS`.

## Roles

| Role | Description | Shop Scope |
|------|-------------|------------|
| **ADMIN** | Full system access, every permission, all shops | Multi-shop access |
| **MANAGER** | Shop-level management and operations | Assigned shop only |
| **CASHIER** | POS operations and own-shift views only | Assigned shop only |
| **BUYER** | Per-shop catalog browsing + purchase-order creation | Assigned shop only |

> **BUYER is a per-shop role.** Its `purchase:create` / `purchase:view`
> permissions are shop-scoped by RLS, so a BUYER **must be assigned a `shopId`**.
> The Users page enforces this (every non-admin role requires a shop). A
> shopless BUYER is a misconfiguration and has no operational access.

## Permission Categories

### Shop Management
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `shop:create` | Create new shops | ✅ | ❌ | ❌ | ❌ |
| `shop:read` | View shop details | ✅ | ✅ | ❌ | ❌ |
| `shop:update` | Edit shop settings | ✅ | ❌ | ❌ | ❌ |
| `shop:delete` | Delete shops | ✅ | ❌ | ❌ | ❌ |

### User Management
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `user:create` | Create new users | ✅ | ❌ | ❌ | ❌ |
| `user:read` | View user list | ✅ | ✅ | ❌ | ❌ |
| `user:update` | Edit user details | ✅ | ❌ | ❌ | ❌ |
| `user:delete` | Delete users | ✅ | ❌ | ❌ | ❌ |

### Product Management
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `product:create` | Add new products | ✅ | ❌ | ❌ | ❌ |
| `product:read` | View product catalog | ✅ | ✅ | ✅ | ✅ |
| `product:update` | Edit product details | ✅ | ✅ | ❌ | ❌ |
| `product:delete` | Delete products | ✅ | ❌ | ❌ | ❌ |
| `product:edit_price` | Change product prices | ✅ | ✅ | ❌ | ❌ |
| `barcode:manage` | Manage product barcodes | ✅ | ❌ | ❌ | ❌ |

### Inventory Management
`inventory:view_stock` and `inventory:view_movements` replace the old broad
`inventory:read`. A cashier can see **current stock** but **not** movement
history.

| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `inventory:view_stock` | View current on-hand stock | ✅ | ✅ | ✅ | ❌ |
| `inventory:view_movements` | View stock movement / ledger history | ✅ | ✅ | ❌ | ❌ |
| `inventory:adjust` | Manual stock adjustments | ✅ | ✅ | ❌ | ❌ |
| `inventory:damage` | Record damaged stock | ✅ | ✅ | ❌ | ❌ |
| `inventory:override_negative` | Allow a manual adjustment to drive stock negative | ✅ | ✅ | ❌ | ❌ |

### Stock Transfers
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `transfer:create` | Create transfer requests | ✅ | ✅ | ❌ | ❌ |
| `transfer:approve` | Approve / reject / complete transfers | ✅ | ✅ | ❌ | ❌ |
| `transfer:cancel` | Cancel pending transfers | ✅ | ❌ | ❌ | ❌ |
| `transfer:view` | View transfer history | ✅ | ✅ | ❌ | ❌ |

### POS / Sales
`request_*` permissions raise an approval request (cashier-level); `refund` /
`void_sale` approve them (manager-level). `sale:view` is the full shop sales
history; `sales:view_own_shift` is the narrow cashier scope (own sales only,
enough for the receipt page and shift summary).

| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `pos:create_sale` | Create sales transactions | ✅ | ✅ | ✅ | ❌ |
| `pos:apply_discount` | Apply discounts to sales | ✅ | ✅ | ✅ | ❌ |
| `pos:override_price` | Override item prices | ✅ | ✅ | ❌ | ❌ |
| `pos:override_stock` | Sell without stock check | ✅ | ✅ | ❌ | ❌ |
| `pos:request_refund` | Raise a refund request | ✅ | ✅ | ✅ | ❌ |
| `pos:request_void` | Raise a void request | ✅ | ✅ | ✅ | ❌ |
| `pos:refund` | Approve refund requests | ✅ | ✅ | ❌ | ❌ |
| `pos:void_sale` | Approve void requests | ✅ | ✅ | ❌ | ❌ |
| `sale:view` | View full shop sales history | ✅ | ✅ | ❌ | ❌ |
| `sales:view_own_shift` | View own-shift sales (receipt access) | ✅ | ✅ | ✅ | ❌ |
| `receipt:reprint` | Reprint a receipt | ✅ | ✅ | ✅ | ❌ |

### Suppliers & Purchasing
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `supplier:create` | Add new suppliers | ✅ | ❌ | ❌ | ❌ |
| `supplier:read` | View supplier list | ✅ | ✅ | ❌ | ✅ |
| `supplier:update` | Edit supplier details | ✅ | ❌ | ❌ | ❌ |
| `supplier:delete` | Delete suppliers | ✅ | ❌ | ❌ | ❌ |
| `supplier:debt_view` | View supplier debt, payments, and received-purchase records | ✅ | ✅ | ❌ | ✅ |
| `supplier:payment_create` | Record supplier payments | ✅ | ✅ | ❌ | ❌ |
| `purchase:create` | Create purchase orders | ✅ | ✅ | ❌ | ✅ |
| `purchase:approve` | Approve purchase orders | ✅ | ❌ | ❌ | ❌ |
| `purchase:receive` | Receive stock from PO | ✅ | ✅ | ❌ | ❌ |
| `purchase:view` | View purchase orders | ✅ | ✅ | ❌ | ✅ |

### Pricing
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `pricing:manage` | Manage tier pricing | ✅ | ❌ | ❌ | ❌ |

### Approvals
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `approval:view` | View the approvals queue | ✅ | ✅ | ❌ | ❌ |

### Shifts
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `shift:manage_own` | Start / end own shifts | ✅ | ✅ | ✅ | ❌ |
| `shift:manage_all` | Manage all shifts | ✅ | ✅ | ❌ | ❌ |
| `shift:verify` | Verify shift cash counts | ✅ | ✅ | ❌ | ❌ |

### Reports
The broad `report:shop` / `report:profit` are split. **Profit, cost and margin
reporting is ADMIN-only by default** — a manager sees operational sales and
inventory reports but not profit unless explicitly granted `report:shop_profit`.

| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `report:own_shift` | View own shift summary | ✅ | ✅ | ✅ | ❌ |
| `report:shop_sales` | View shop sales reports / dashboard | ✅ | ✅ | ❌ | ❌ |
| `report:shop_inventory` | View shop inventory reports | ✅ | ✅ | ❌ | ❌ |
| `report:shop_profit` | View profit / cost / margin reports | ✅ | ❌ | ❌ | ❌ |
| `report:global` | View cross-shop reports | ✅ | ❌ | ❌ | ❌ |

### Audit
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `audit:view_shop` | View shop audit log | ✅ | ✅ | ❌ | ❌ |
| `audit:view_global` | View global audit log | ✅ | ❌ | ❌ | ❌ |

## What Changed In RBAC Role Tuning (migrations 014–015)

- **CASHIER narrowed.** Lost broad shop reports, full sales history, movement
  history, transfer/purchase/audit visibility. Keeps: POS sales, own shift,
  current stock, request (not approve) refund/void, reprint, own-shift sales.
- **MANAGER — no profit by default.** Operational sales/inventory reports only;
  `report:shop_profit` and the Profit & Analytics page are ADMIN-only unless a
  manager is explicitly granted `report:shop_profit`.
- **BUYER — per-shop purchasing role.** Gains `supplier:read`,
  `supplier:debt_view`, `purchase:view`, `purchase:create`. Must be assigned a
  shop. Cannot record supplier payments by default.
- **`inventory:view_stock` vs `inventory:view_movements`.** Current stock vs
  movement history are now separate grants.
- **`report:shop_sales` vs `report:shop_profit`.** Operational sales vs
  sensitive profit/cost are now separate grants.
- **Permission-gated RLS reads (migration 015).** SELECT policies on sensitive
  tables now check a permission, not just shop scope (see below).

## Effective Permissions — Grant / Revoke Model

A user's permissions are no longer a flat replacement list. The effective set is
computed as:

```
effective = roleDefaults  ∪  grantedPermissions  −  revokedPermissions
```

- **Role defaults** come from `DEFAULT_ROLE_PERMISSIONS`.
- **`grantedPermissions`** add access on top of the role default.
- **`revokedPermissions`** remove access — **a revoke always wins** over a role
  default and over a grant.

```typescript
interface User {
  role: Role;
  grantedPermissions?: Permission[]; // additive
  revokedPermissions?: Permission[]; // explicit denials (win over grant + default)
  permissions?: Permission[];        // @deprecated legacy replacement list
  // ...
}
```

This allows, for example, granting one Cashier `transfer:approve` without
changing their role, or granting a specific Manager `report:shop_profit`.

> **Legacy note:** the old `permissions` field used *replacement* semantics. It
> is kept only for migration safety — `002_rbac_permissions.sql` converts any
> existing `permissions` into `granted`/`revoked` values, and
> `014_rbac_role_tuning.sql` remaps renamed permissions inside those arrays.

## Shop Scoping

A matching permission is **not sufficient** for a shop-scoped action — the user
must also be allowed to act within the target shop.

- **Admin**: spans all shops; can switch shop from the top bar.
- **Manager / Cashier / Buyer**: locked to their assigned `shopId`.

## Permission Helper Functions

Helpers live in `src/lib/permissions.ts` (the central registry):

```typescript
import { hasPermission, hasShopPermission, canVoidSale } from "@/lib/permissions";

hasPermission(user, "pos:void_sale");                 // permission only
hasShopPermission(user, "inventory:adjust", shopId);  // permission + shop scope
canVoidSale(user, sale);                              // workflow helper
```

**Core:** `getRolePermissions`, `getEffectivePermissions`, `hasPermission`,
`hasAnyPermission`, `hasAllPermissions`

**Shop-aware:** `canAccessShop(user, shopId)`,
`hasShopPermission(user, permission, shopId)`

**Workflow:** `canVoidSale`, `canRefundSale`, `canAdjustInventory`,
`canCompleteTransfer`, `canReceivePurchaseOrder`, `canApprovePurchaseOrder`,
`canManagePriceTier`

**Registry:** `ALL_PERMISSIONS`, `ROUTE_PERMISSIONS` (route → permission map
used by the router guard and the sidebar).

## SQL Helpers And RLS

`003_identity_rls_helpers.sql` adds identity-aware SQL functions:
`current_app_user()`, `app_role()`, `app_shop_id()`, `app_has_perm(perm)`,
`app_can_for_shop(perm, shop_id)`. `015_permission_gated_select_rls.sql` adds
`app_user_id()`.

### Permission-gated SELECT RLS (migration 015)

SELECT policies on sensitive tables check a **permission**, not just shop scope.
A same-shop user can no longer read rows the UI hides:

| Table | Read rule |
|-------|-----------|
| `sales` | ADMIN; `sale:view` + shop; or `sales:view_own_shift` for own sales/shift |
| `sale_items` | iff parent sale is readable |
| `inventory` | ADMIN; `inventory:view_stock` + shop |
| `inventory_movements` | ADMIN; `inventory:view_movements` + shop |
| `shifts` | ADMIN; `shift:manage_all`/`report:shop_sales` + shop; or own shifts |
| `purchase_orders` | ADMIN; `purchase:view` + shop |
| `purchase_order_items` | iff parent PO is readable |
| `supplier_payments` | ADMIN; `supplier:debt_view` or `purchase:view` + shop |
| `stock_transfers` | ADMIN; `transfer:view` + source/destination shop |
| `stock_transfer_items` | iff parent transfer is readable |
| `refund_void_requests` | ADMIN; `pos:refund`/`pos:void_sale` + shop; or own (`created_by`) |
| `reprint_logs` | iff parent sale is readable, or `printed_by` self |
| `audit_logs` | ADMIN; `audit:view_global`; or `audit:view_shop` + shop |

Reference/catalog tables (`shops`, `users`, `categories`, `products`,
`product_barcodes`, `price_tiers`, `suppliers`) stay globally readable — the POS
and shared UI need them. Direct authenticated writes to operational tables
remain blocked; those workflows use SECURITY DEFINER RPCs.

## Permission Count Summary

| Role | Total Permissions |
|------|-------------------|
| Admin | 56 (full access) |
| Manager | 38 |
| Cashier | 10 |
| Buyer | 5 |
