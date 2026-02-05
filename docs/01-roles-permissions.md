# Roles & Permissions

## Overview

The system uses a **permission-based access control** model. Each user has a role that provides default permissions, but individual users can have **custom permission overrides** for fine-grained control.

## Roles

| Role | Description | Shop Scope |
|------|-------------|------------|
| **ADMIN** | Full system access, can manage all shops | Multi-shop access |
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
| `transfer:approve` | Approve/reject transfers | ✅ | ✅ | ❌ | ❌ |
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

### Shifts
| Permission | Description | Admin | Manager | Cashier | Buyer |
|------------|-------------|:-----:|:-------:|:-------:|:-----:|
| `shift:manage_own` | Start/end own shifts | ✅ | ✅ | ✅ | ❌ |
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

## Shop Scoping

- **Admin**: Can switch between shops from the top navigation bar. Has access to global views and reports.
- **Manager**: Locked to their assigned shop. All views and operations are shop-scoped.
- **Cashier**: Locked to their assigned shop. Limited to POS and basic inventory views.
- **Buyer**: No shop assignment. Read-only access to the product catalog.

## Custom Permissions

Individual users can have **custom permission overrides** that grant or restrict access beyond their default role:

```typescript
interface User {
  id: string;
  role: Role;
  permissions?: Permission[]; // Optional custom permissions
  // ...
}
```

When checking permissions:
1. If `user.permissions` array exists and has items, use those permissions
2. Otherwise, fall back to default role permissions

This allows:
- Promoting a Cashier to approve specific transfers without changing their role
- Restricting a Manager from voiding sales in specific cases
- Creating custom roles with specific permission sets

## Permission Helper Functions

The system provides helper functions for permission checks:

```typescript
import { canUser, canUserAny, canUserAll } from "@/lib/permissions";

// Check single permission
if (canUser(user, "pos:void_sale")) { ... }

// Check if user has ANY of these permissions
if (canUserAny(user, ["pos:void_sale", "pos:refund"])) { ... }

// Check if user has ALL of these permissions
if (canUserAll(user, ["inventory:adjust", "inventory:damage"])) { ... }
```

Quick check helpers are also available:
- `canCreateSale(user)` - Check `pos:create_sale`
- `canApplyDiscount(user)` - Check `pos:apply_discount`
- `canOverridePrice(user)` - Check `pos:override_price`
- `canVoidSale(user)` - Check `pos:void_sale`
- `canRefund(user)` - Check `pos:refund`
- `canAdjustInventory(user)` - Check `inventory:adjust`
- `canRecordDamage(user)` - Check `inventory:damage`
- `canCreateTransfer(user)` - Check `transfer:create`
- `canApproveTransfer(user)` - Check `transfer:approve`
- `canViewTransfers(user)` - Check `transfer:view`
- `canEditPrice(user)` - Check `product:edit_price`
- `canViewProfit(user)` - Check `report:profit`
- `canViewGlobalReports(user)` - Check `report:global`
- `canViewAudit(user)` - Check `audit:view_shop` or `audit:view_global`

## Permission Count Summary

| Role | Total Permissions |
|------|-------------------|
| Admin | 37 (full access) |
| Manager | 24 |
| Cashier | 7 |
| Buyer | 1 |
