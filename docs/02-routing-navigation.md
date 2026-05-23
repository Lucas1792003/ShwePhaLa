# Routing And Navigation

Routes are scoped under `/app` and protected by `RequireAuth` and
`RequireRole`. The route-to-permission source of truth is `ROUTE_PERMISSIONS`
in `src/lib/permissions.ts`.

## Core Routes

- `/login` - Login page
- `/app/dashboard` - Analytics dashboard (`report:shop_sales`)
- `/app/pos` - Point of Sale (`pos:create_sale`)
- `/app/sales` - Sales history (`sales:view_own_shift`)
- `/app/sales/:saleId` - Sale / receipt details (`sales:view_own_shift`)
- `/app/shifts` - Shift management (`shift:manage_own`)
- `/app/inventory` - Stock levels and movements (`inventory:view_stock`)
- `/app/transfers` - Inter-shop transfers (`transfer:view`)
- `/app/purchases` - Purchase orders (`purchase:view`)
- `/app/approvals` - Refund/void approvals (`approval:view`)
- `/app/reports` - Shop sales reports (`report:shop_sales`)
- `/app/reports/profit` - Profit & analytics, ADMIN-only (`report:shop_profit`)
- `/app/catalog` - Product catalog for buyers (`product:read`)

> The `/app/sales` **list** is gated by `sales:view_own_shift`, which a cashier
> already holds. Row scope is still enforced by the `sales_sel` RLS
> (migration `015`): a caller without `sale:view` only sees sales they rang
> up or sales in shifts they own. `SalesPage` mirrors that on the client —
> when the caller lacks `sale:view` it narrows the rows to
> `cashierId === currentUserId`, hides the cashier filter, swaps "Void sale"
> for "Request void", and hides approve buttons (those are gated on
> `pos:refund` / `pos:void_sale`). Managers/admins keep the full shop history.
> Inside `/app/inventory`, the Movements tab and the Adjust action are
> additionally gated by `inventory:view_movements` / `inventory:adjust`. On
> `/app/dashboard` the profit/cost cards require `report:shop_profit`.

## Admin Routes

- `/app/admin/shops` - Shop management (`shop:create`)
- `/app/admin/users` - User management (`user:create`)
- `/app/admin/products` - Product management (`product:create`)
- `/app/admin/barcodes` - Barcode mappings (`barcode:manage`)
- `/app/admin/suppliers` - Supplier management (`supplier:read`)
- `/app/admin/pricing` - Pricing tiers (`pricing:manage`)
- `/app/admin/reports` - Global reports (`report:global`)
- `/app/admin/audit` - Audit logs (`audit:view_global`)

## Sidebar Organization

The sidebar is organized into collapsible sections:

- Main: Dashboard, POS
- Sales & Operations: Sales History, Shifts, Approvals
- Inventory: Stock Levels, Transfers, Purchases
- Settings: Shops, Users, Products, Barcodes, Suppliers, Pricing, Audit Logs

Sidebar entries are hidden when the active user lacks the required granular
permission.

