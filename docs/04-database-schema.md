# Database Schema

Shwe Phala POS stores business data in **Supabase PostgreSQL**. The base schema
is in `supabase/schema.sql`; production changes are applied through ordered SQL
migrations in `supabase/migrations/`.

The old frontend-only data layer and localStorage data persistence are no
longer the source of truth.

## Tables

### Core / Reference
- `shops`
- `users` - staff profiles linked to Supabase Auth through `auth_id`
- `categories`
- `products` - includes `sku`
- `product_barcodes` - optional scan-code mappings for products
- `price_tiers`
- `suppliers`

### Inventory
- `inventory` - current stock per `shop_id + product_id`
- `inventory_movements` - immutable stock movement ledger

Older stock-level references mean the current `inventory` table.

### Sales / POS
- `shifts`
- `sales`
- `sale_items`
- `refund_void_requests`
- `reprint_logs`

Refund and void workflow state lives in `refund_void_requests`; sale status is
reflected on `sales`.

### Purchasing
- `purchase_orders`
- `purchase_order_items`
- `supplier_payments`

### Transfers
- `stock_transfers`
- `stock_transfer_items`

### Audit
- `audit_logs`

## Product Codes

Current model:

- `products.sku` is the primary human-visible product code and is required in
  the product admin UI.
- `product_barcodes` still exists and is loaded by the app.
- POS barcode scan looks up `product_barcodes.value`.
- The product admin UI can search by SKU or existing barcode values, but the
  main product form currently edits SKU, not barcode mappings.
- `/app/admin/barcodes` remains the barcode mapping view.

So SKU is not a replacement for the `product_barcodes` table; SKU is the primary
catalog code, and `product_barcodes` is the optional scan-code mapping table.

## Migrations

Apply migrations in numeric order. Current security-relevant migrations:

| File | Adds |
|------|------|
| `001_identity_linking.sql` | `users.auth_id` identity link to `auth.users` |
| `002_rbac_permissions.sql` | `granted_permissions`, `revoked_permissions`, role defaults |
| `003_identity_rls_helpers.sql` | `current_app_user()`, `app_role()`, `app_shop_id()`, `app_has_perm()`, `app_can_for_shop()` |
| `004_complete_sale_rpc.sql` | Atomic POS checkout RPC |
| `005_refund_void_rpc.sql` | Refund/void approval RPCs |
| `006_receive_purchase_order_rpc.sql` | Purchase receiving RPC |
| `007_complete_stock_transfer_rpc.sql` | Transfer completion RPC |
| `008_adjust_stock_rpc.sql` | Manual stock adjustment RPC |
| `009_shift_rpc.sql` | Shift open/close RPCs |
| `010_rls_lockdown_phase_1.sql` | First direct-write lockdown |
| `011_rls_shop_scoped_reads.sql` | Shop-scoped operational reads |
| `012_operational_status_rpcs.sql` | PO/transfer/request/reprint status RPCs |
| `013_audit_write_lockdown.sql` | Final audit/status direct-write lockdown |
| `018_supplier_debt_payments.sql` | Supplier payment table, PO payment status, supplier debt RPC |

## Transactional RPC Source Of Truth

Critical business writes go through `SECURITY DEFINER` RPCs:

- `complete_sale(...)`
- `approve_refund_request(p_request_id text)`
- `approve_void_request(p_request_id text)`
- `reject_refund_void_request(p_request_id text, p_reason text default null)`
- `receive_purchase_order(p_purchase_order_id text, p_received_items jsonb default null)`
- `complete_stock_transfer(p_transfer_id text)`
- `adjust_stock(...)`
- `open_shift(p_shop_id text, p_opening_cash_mmk integer)`
- `close_shift(p_shift_id text, p_closing_cash_mmk integer, p_variance_reason text default null)`
- `create_purchase_order(...)`
- `approve_purchase_order(p_purchase_order_id text)`
- `cancel_purchase_order(p_purchase_order_id text, p_reason text default null)`
- `record_supplier_payment(p_purchase_order_id text, p_amount_mmk integer, p_payment_method text, p_reference_no text default null, p_notes text default null)`
- `create_stock_transfer(...)`
- `approve_stock_transfer(p_transfer_id text)`
- `reject_stock_transfer(p_transfer_id text, p_reason text default null)`
- `cancel_stock_transfer(p_transfer_id text, p_reason text default null)`
- `create_refund_void_request(...)`
- `log_receipt_reprint(p_sale_id text)`
- `log_audit_event(...)`

These functions use Supabase Auth identity and the SQL helper functions from
migration `003`. They keep related status, inventory, ledger, and audit writes
inside database transactions.

## RLS Status

RLS is enabled. The current policy model is:

- Protected operational writes are blocked from direct authenticated clients.
- Protected writes must use the RPCs above.
- Operational reads are shop-scoped for manager/cashier users.
- Admin can read operational data across shops.
- `audit_logs` direct insert/update/delete is revoked from authenticated users.
- Reference/admin tables still allow permission-gated direct writes:
  `shops`, `users`, `categories`, `products`, `product_barcodes`,
  `price_tiers`, and `suppliers`.

See [29-live-supabase-rls-rpc-verification.md](./29-live-supabase-rls-rpc-verification.md)
for live verification steps.

## `users` Permission Columns

| Column | Notes |
|--------|-------|
| `auth_id` | UUID link to `auth.users(id)` |
| `granted_permissions` | additive permission grants |
| `revoked_permissions` | explicit denials; wins over defaults and grants |
| `permissions` | deprecated legacy list kept for migration safety |

The central permission registry is `src/lib/permissions.ts`; domain types live
in `src/types/domain.ts`; row mapping lives in `src/stores/data/index.ts`.
