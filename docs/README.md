# Shwe Phala POS (Web)

## What this is
A mock-data web POS + inventory system for a multi-shop family business selling drinks. The app is frontend-only for now and uses in-memory state persisted to localStorage.

## Run locally
```bash
npm install
npm run dev
```

## Demo accounts
- Admin: Nandar (Admin)
- Manager Shop A: Ko Zaw (Manager A)
- Manager Shop B: Ma Thida (Manager B)
- Cashier Shop A: Aye Aye (Cashier A)
- Cashier Shop B: Tun Tun (Cashier B)

## Key Features

### Analytics Dashboard
- Visual analytics with Recharts (line charts, pie charts)
- Summary cards: Revenue, Investment, Profit, Orders, Avg Order Value
- Top selling products, low stock alerts, recent sales

### Internationalization
- Language switcher: English / Myanmar (မြန်မာ)
- Persistent language preference via localStorage

### POS Interface
- Grid layout with product images
- Sticky search and category filters
- Barcode scanner support (F3 toggle)
- Cart panel with quantity controls

### Sidebar Navigation
- Collapsible sections (Sales & Operations, Inventory, Settings)
- Role-based visibility
- Language switcher in footer

## Core flows
- POS: scan barcode → add to cart → checkout → print receipt
- Inventory: search products → adjust stock with reason → view movements
- Sales: view history → open details → approve void/refund → reprint
- Shift: start shift with opening cash → sell → end shift with closing cash → variance
- Dashboard: view analytics → monitor sales trends → check low stock

## Routes
- `/login`
- `/app/dashboard` - Analytics dashboard
- `/app/pos` - Point of Sale
- `/app/sales`, `/app/sales/:saleId` - Sales history
- `/app/shifts` - Shift management
- `/app/inventory` - Stock levels & movements
- `/app/transfers` - Inter-shop transfers
- `/app/purchases` - Purchase orders
- `/app/approvals` - Refund/void approvals
- `/app/catalog` - Product catalog (Buyer role)

### Admin Routes
- `/app/admin/shops` - Shop management
- `/app/admin/users` - User management
- `/app/admin/products` - Product management
- `/app/admin/barcodes` - Barcode management
- `/app/admin/suppliers` - Supplier management
- `/app/admin/pricing` - Pricing tiers
- `/app/admin/audit` - Audit logs
- `/app/admin/reports` - Global reports

## Documentation Index

### Getting Started
- [00-overview.md](./00-overview.md) - Project overview
- [03-mock-auth.md](./03-mock-auth.md) - Mock authentication
- [04-mock-data-schema.md](./04-mock-data-schema.md) - Mock data schema

### Core Systems
- [01-roles-permissions.md](./01-roles-permissions.md) - Roles & permissions
- [02-routing-navigation.md](./02-routing-navigation.md) - Routing & navigation
- [05-pos-flow.md](./05-pos-flow.md) - POS workflow
- [07-shift-flow.md](./07-shift-flow.md) - Shift management
- [08-refund-void-flow.md](./08-refund-void-flow.md) - Refunds & voids

### Inventory & Stock
- [06-inventory-flow.md](./06-inventory-flow.md) - Inventory management
- [14-stock-transfers.md](./14-stock-transfers.md) - Stock transfers
- [15-suppliers-purchasing.md](./15-suppliers-purchasing.md) - Suppliers & purchasing
- [16-pricing-tiers.md](./16-pricing-tiers.md) - Pricing tiers

### Technical
- [11-component-structure.md](./11-component-structure.md) - Component structure
- [13-data-model.md](./13-data-model.md) - Data model
- [10-localstorage-persistence.md](./10-localstorage-persistence.md) - LocalStorage persistence
- [09-audit-logging.md](./09-audit-logging.md) - Audit logging
- [17-architecture.md](./17-architecture.md) - Architecture
- [18-printing.md](./18-printing.md) - Receipt printing

### Other
- [12-future-supabase-plan.md](./12-future-supabase-plan.md) - Future Supabase migration
- [19-contributing.md](./19-contributing.md) - Contributing guidelines
- [20-todo-next.md](./20-todo-next.md) - Project status & next steps
