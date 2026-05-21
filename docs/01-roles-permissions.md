# Roles & Permissions

## Overview

The system uses **granular permission-based access control**. Each user has a
role that provides a set of default permissions; individual users may also have
**grant** and **revoke** overrides for fine-grained control.

The granular permissions (e.g. `pos:create_sale`) are the **single source of
truth**. The old coarse permission system has been removed. The central registry lives in `src/lib/permissions.ts`, and
the permission list + role defaults in `src/types/domain.ts`.

## Roles

| Role | Description | Shop Scope |
|------|-------------|------------|
| **ADMIN** | Full system access, every permission, all shops | Multi-shop access |
| **MANAGER** | Shop-level management and operations | Assigned shop only |
| **CASHIER** | POS operations and basic views | Assigned shop only |
| **BUYER** | Read-only catalog access | N/A |

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
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `inventory:read` | View stock levels | ✅ | ✅ | ✅ | ❌ |
| `inventory:adjust` | Manual stock adjustments | ✅ | ✅ | ❌ | ❌ |
| `inventory:damage` | Record damaged stock | ✅ | ✅ | ❌ | ❌ |

### Stock Transfers
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `transfer:create` | Create transfer requests | ✅ | ✅ | ❌ | ❌ |
| `transfer:approve` | Approve / reject / complete transfers | ✅ | ✅ | ❌ | ❌ |
| `transfer:cancel` | Cancel pending transfers | ✅ | ❌ | ❌ | ❌ |
| `transfer:view` | View transfer history | ✅ | ✅ | ✅ | ❌ |

### POS / Sales
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `pos:create_sale` | Create sales transactions | ✅ | ✅ | ✅ | ❌ |
| `pos:apply_discount` | Apply discounts to sales | ✅ | ✅ | ✅ | ❌ |
| `pos:override_price` | Override item prices | ✅ | ✅ | ❌ | ❌ |
| `pos:override_stock` | Sell without stock check | ✅ | ✅ | ❌ | ❌ |
| `pos:void_sale` | Void completed sales | ✅ | ✅ | ❌ | ❌ |
| `pos:refund` | Process refunds | ✅ | ✅ | ❌ | ❌ |
| `sale:view` | View sales history | ✅ | ✅ | ✅ | ❌ |

### Suppliers & Purchasing
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `supplier:create` | Add new suppliers | ✅ | ❌ | ❌ | ❌ |
| `supplier:read` | View supplier list | ✅ | ✅ | ❌ | ❌ |
| `supplier:update` | Edit supplier details | ✅ | ❌ | ❌ | ❌ |
| `supplier:delete` | Delete suppliers | ✅ | ❌ | ❌ | ❌ |
| `purchase:create` | Create purchase orders | ✅ | ✅ | ❌ | ❌ |
| `purchase:approve` | Approve purchase orders | ✅ | ❌ | ❌ | ❌ |
| `purchase:receive` | Receive stock from PO | ✅ | ✅ | ❌ | ❌ |
| `purchase:view` | View purchase orders | ✅ | ✅ | ❌ | ❌ |

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
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `report:shop` | View shop-level reports | ✅ | ✅ | ✅ | ❌ |
| `report:global` | View cross-shop reports | ✅ | ❌ | ❌ | ❌ |
| `report:profit` | View profit reports | ✅ | ✅ | ❌ | ❌ |

### Audit
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `audit:view_shop` | View shop audit log | ✅ | ✅ | ❌ | ❌ |
| `audit:view_global` | View global audit log | ✅ | ❌ | ❌ | ❌ |

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
changing their role, or revoking `pos:void_sale` from a specific Manager.

> **Legacy note:** the old `permissions` field used *replacement* semantics
> (if set, it replaced the role defaults entirely). It is kept only for
> migration safety — `migrations/002_rbac_permissions.sql` converts any existing
> `permissions` into equivalent `granted`/`revoked` values.

## Shop Scoping

A matching permission is **not sufficient** for a shop-scoped action — the user
must also be allowed to act within the target shop.

- **Admin**: spans all shops; can switch shop from the top bar.
- **Manager / Cashier**: locked to their assigned `shopId`.
- **Buyer**: no shop assignment; read-only catalog.

Server-side, `requirePermission(users, actorId, permission, shopId?)` enforces
the shop scope when `shopId` is supplied (used by the transfer and purchase
slices).

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

**Workflow** (check permission *and* the relevant shop scope):
`canVoidSale`, `canRefundSale`, `canAdjustInventory`, `canCompleteTransfer`,
`canReceivePurchaseOrder`, `canApprovePurchaseOrder`, `canManagePriceTier`

**Registry:** `ALL_PERMISSIONS` (every permission), `ROUTE_PERMISSIONS` (route to permission map used by the router guard and the sidebar).

## SQL Helpers And RLS

`migrations/003_identity_rls_helpers.sql` adds identity-aware SQL functions that
mirror this model for Row Level Security policies and SECURITY DEFINER RPCs:
`current_app_user()`, `app_role()`, `app_shop_id()`, `app_has_perm(perm)`,
`app_can_for_shop(perm, shop_id)`.

RLS is now active for protected operational tables. Direct authenticated writes to sales, inventory, shifts, audit logs, purchase/transfer status rows, refund/void requests, and reprint logs are blocked; those workflows use RPCs.

## Permission Count Summary

| Role | Total Permissions |
|------|-------------------|
| Admin | 46 (full access) |
| Manager | 29 |
| Cashier | 8 |
| Buyer | 1 |


