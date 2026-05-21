# Routing And Navigation

Routes are scoped under `/app` and protected by `RequireAuth` and
`RequireRole`. The route-to-permission source of truth is `ROUTE_PERMISSIONS`
in `src/lib/permissions.ts`.

## Core Routes

- `/login` - Login page
- `/app/dashboard` - Analytics dashboard (`report:shop`)
- `/app/pos` - Point of Sale (`pos:create_sale`)
- `/app/sales` - Sales history (`sale:view`)
- `/app/sales/:saleId` - Sale details (`sale:view`)
- `/app/shifts` - Shift management (`shift:manage_own`)
- `/app/inventory` - Stock levels and movements (`inventory:read`)
- `/app/transfers` - Inter-shop transfers (`transfer:view`)
- `/app/purchases` - Purchase orders (`purchase:view`)
- `/app/approvals` - Refund/void approvals (`approval:view`)
- `/app/reports` - Shop reports (`report:shop`)
- `/app/reports/profit` - Profit reports (`report:profit`)
- `/app/catalog` - Product catalog for buyers (`product:read`)

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

