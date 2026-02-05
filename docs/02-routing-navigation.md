# Routing and Navigation

Routes are scoped under `/app` and protected by `RequireAuth` and `RequireRole`.

## Core Routes
- `/login` - Login page
- `/app/dashboard` - Analytics dashboard (VIEW_REPORTS)
- `/app/pos` - Point of Sale (VIEW_POS)
- `/app/sales` - Sales history (VIEW_SALES)
- `/app/sales/:saleId` - Sale details (VIEW_SALES)
- `/app/shifts` - Shift management (VIEW_SHIFTS)
- `/app/inventory` - Stock levels & movements (VIEW_INVENTORY)
- `/app/transfers` - Inter-shop transfers (VIEW_TRANSFERS)
- `/app/purchases` - Purchase orders (VIEW_PURCHASES)
- `/app/approvals` - Refund/void approvals (VIEW_APPROVALS)
- `/app/reports` - Shop reports (VIEW_REPORTS)
- `/app/reports/profit` - Profit reports (VIEW_PROFIT_REPORTS)
- `/app/catalog` - Product catalog for Buyers (VIEW_CATALOG)

## Admin Routes
- `/app/admin/shops` - Shop management (MANAGE_SHOPS)
- `/app/admin/users` - User management (MANAGE_USERS)
- `/app/admin/products` - Product management (MANAGE_PRODUCTS)
- `/app/admin/barcodes` - Barcode management (MANAGE_BARCODES)
- `/app/admin/suppliers` - Supplier management (VIEW_SUPPLIERS)
- `/app/admin/pricing` - Pricing tiers (MANAGE_PRICING)
- `/app/admin/reports` - Global reports (VIEW_GLOBAL_REPORTS)
- `/app/admin/audit` - Audit logs (VIEW_AUDIT)

## Sidebar Organization

The sidebar is organized into collapsible sections:

### Main Navigation (no header)
- Dashboard
- POS

### Sales & Operations
- Sales History
- Shifts
- Approvals

### Inventory
- Stock Levels
- Transfers
- Purchases

### Settings (Admin only)
- Shops
- Users
- Products
- Suppliers
- Pricing
- Audit Logs

## Sidebar Features
- Collapsible sections with expand/collapse arrows
- Role-based visibility (items hidden if user lacks permission)
- Language switcher in footer (EN / မြန်မာ)
- User info and logout button in footer
