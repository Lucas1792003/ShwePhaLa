# Project Status & Next Steps

## Completed Features

### Analytics Dashboard
- [x] Dashboard page with visual analytics (Recharts)
- [x] Summary cards: Revenue, Investment, Profit, Orders, Avg Order Value
- [x] Line chart for 7-day sales trend
- [x] Pie chart for sales by category
- [x] Top selling products list
- [x] Low stock alerts
- [x] Recent sales feed

### Internationalization (i18n)
- [x] Language switcher (English / Myanmar)
- [x] Zustand-based language store with localStorage persistence
- [x] Translation files for sidebar, dashboard, POS, common UI
- [x] `useTranslation` hook for easy component integration

### UI/UX Improvements
- [x] Redesigned POS with grid layout and product images
- [x] Sticky search and category tabs in POS
- [x] Sidebar reorganized into collapsible sections
- [x] Inventory page pagination with page size selector
- [x] Fixed sidebar height (no longer changes with page content)
- [x] Dynamic category management (add, edit, delete with color picker)
- [x] Decision-making dashboard with profit trends, goal tracking, inventory intelligence

### Code Architecture
- [x] Modular dataStore using Zustand slice pattern (10 domain slices)
- [x] Centralized type definitions in `stores/data/types.ts`
- [x] Shared utilities extracted to `stores/data/utils.ts`
- [x] Removed unnecessary re-export files (24 files deleted)
- [x] Cleaned up shared folder structure

### Multi-Shop Inventory System
- [x] Multi-shop support with isolated inventory per shop
- [x] Shop-scoped inventory levels (`InventoryLevel` per shop/product)
- [x] Shop switching for Admin users

### Permission-Based Access Control
- [x] 37 granular permissions across 10 categories
- [x] Default role permissions (Admin, Manager, Cashier, Buyer)
- [x] Custom permission overrides per user
- [x] Permission helper functions (`canUser`, `canUserAny`, `canUserAll`)

### Ledger-Based Stock Movements
- [x] 8 movement types: PURCHASE_IN, SALE_OUT, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT, DAMAGE, RETURN_IN, RETURN_OUT
- [x] Before/after quantity tracking
- [x] Reference linking to source records
- [x] Full audit trail

### Stock Transfer System
- [x] Transfer workflow: PENDING → APPROVED → COMPLETED
- [x] Source/destination shop tracking
- [x] Approval/rejection with reasons
- [x] Automatic inventory movements on completion
- [x] Transfers page with outgoing/incoming tabs

### Supplier & Purchasing Module
- [x] Supplier management (CRUD)
- [x] Purchase Order workflow: DRAFT → SUBMITTED → APPROVED → RECEIVED
- [x] Automatic stock-in on PO receive
- [x] Suppliers page
- [x] Purchases page

### Tier-Based Pricing
- [x] Quantity-based price breaks
- [x] Global and shop-specific tiers
- [x] Automatic tier selection in POS
- [x] Pricing configuration page

### Advanced Reports
- [x] Profit reports per shop
- [x] Stock valuation report
- [x] Transfer history
- [x] Movement history with filters

## Database Tables (When Moving to Supabase)

### Core Tables
- `shops` - Shop/location management
- `users` - User accounts with role and permissions
- `products` - Product catalog
- `product_barcodes` - Multiple barcodes per product

### Inventory Tables
- `inventory_levels` - Current stock per shop/product
- `inventory_movements` - Ledger of all stock changes
- `price_tiers` - Quantity-based pricing

### Sales Tables
- `shifts` - Cashier shifts
- `sales` - Sale transactions
- `sale_items` - Line items per sale
- `refunds` - Refund records

### Purchasing Tables
- `suppliers` - Vendor management
- `purchase_orders` - PO headers
- `purchase_order_items` - PO line items

### Transfer Tables
- `stock_transfers` - Transfer headers
- `stock_transfer_items` - Transfer line items

### Audit Tables
- `audit_logs` - All system actions
- `reprint_logs` - Receipt reprints

## Row Level Security (RLS) Notes

```sql
-- Admin: Full access to all shops
CREATE POLICY admin_all ON shops FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' = 'ADMIN');

-- Manager: Read/write assigned shop only
CREATE POLICY manager_shop ON inventory_levels FOR ALL TO authenticated
  USING (
    shop_id = (auth.jwt() ->> 'shop_id')::uuid
    AND auth.jwt() ->> 'role' IN ('MANAGER', 'ADMIN')
  );

-- Cashier: Read own sales and shifts
CREATE POLICY cashier_own ON sales FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR auth.jwt() ->> 'role' IN ('MANAGER', 'ADMIN')
  );
```

## Future Improvements

### High Priority
- [ ] Backend migration to Supabase/PostgreSQL
- [ ] Real-time stock updates via subscriptions
- [ ] Barcode scanner hardware integration
- [ ] Receipt printer integration (ESC/POS)

### Medium Priority
- [ ] Customer management module
- [ ] Customer loyalty/points system
- [ ] Credit sales tracking
- [ ] Multi-currency support

### Low Priority
- [ ] Mobile app (React Native)
- [ ] Offline mode with sync
- [x] Analytics dashboard *(Completed)*
- [ ] Email/SMS notifications
- [ ] API for third-party integrations

## Documentation

- [13-data-model.md](./13-data-model.md) - Entity definitions and relationships
- [01-roles-permissions.md](./01-roles-permissions.md) - Permission system
- [06-inventory-flow.md](./06-inventory-flow.md) - Stock movement tracking
- [14-stock-transfers.md](./14-stock-transfers.md) - Inter-shop transfers
- [15-suppliers-purchasing.md](./15-suppliers-purchasing.md) - Vendor & PO management
- [16-pricing-tiers.md](./16-pricing-tiers.md) - Quantity-based pricing
