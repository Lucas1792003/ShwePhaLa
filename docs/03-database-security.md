# 03 · Database & Security

Business data lives in **Supabase PostgreSQL**. RLS is enabled, operational
writes are RPC-only, and `audit_logs` direct writes are blocked.

## Tables

| Group | Tables |
| --- | --- |
| Core / reference | `shops`, `users`, `categories`, `products`, `product_barcodes`, `price_tiers`, `suppliers`, `product_image_upload_sessions` |
| Inventory | `inventory` (PK `(shop_id, product_id)`), `inventory_movements` |
| Sales / POS | `shifts`, `sales`, `sale_items`, `refund_void_requests`, `reprint_logs` |
| Purchasing | `purchase_orders`, `purchase_order_items`, `supplier_payments` |
| Transfers | `stock_transfers`, `stock_transfer_items` |
| Audit | `audit_logs` |

`users.auth_id` links app staff profiles to `auth.users(id)`.
`users.granted_permissions` and `users.revoked_permissions` are the
fine-grained per-user permission overrides. `users.permissions` is a
deprecated legacy field kept only for migration safety.

## Migrations

Apply in numeric order. The current ordered list:

| File | Adds |
| --- | --- |
| `001_identity_linking.sql` | `users.auth_id` link to `auth.users` |
| `002_rbac_permissions.sql` | `granted_permissions`, `revoked_permissions`, role defaults |
| `003_identity_rls_helpers.sql` | `current_app_user()`, `app_role()`, `app_shop_id()`, `app_has_perm()`, `app_can_for_shop()` |
| `004_complete_sale_rpc.sql` | Atomic POS checkout RPC |
| `005_refund_void_rpc.sql` | Refund / void approval RPCs |
| `006_receive_purchase_order_rpc.sql` | Purchase receiving RPC |
| `007_complete_stock_transfer_rpc.sql` | Transfer completion RPC |
| `008_adjust_stock_rpc.sql` | Manual stock adjustment RPC |
| `009_shift_rpc.sql` | `open_shift`, `close_shift` RPCs |
| `010_rls_lockdown_phase_1.sql` | First direct-write lockdown |
| `011_rls_shop_scoped_reads.sql` | Shop-scoped operational reads |
| `012_operational_status_rpcs.sql` | PO / transfer / request / reprint status RPCs |
| `013_audit_write_lockdown.sql` | Final audit + status direct-write lockdown |
| `014_rbac_role_tuning.sql` | Tuned role defaults; split `inventory:read`, `report:shop`, `report:profit` |
| `015_permission_gated_select_rls.sql` | SELECT policies check a permission, not just shop scope |
| `016_product_images_storage.sql` | `product-images` Storage bucket + policies |
| `017_category_icon_key.sql` | `categories.icon_key` for icon-based categories |
| `018_supplier_debt_payments.sql` | `supplier_payments`, PO payment status, `record_supplier_payment` |
| `019_product_image_upload_sessions.sql` | Temporary QR upload sessions for phone product photos |
| `020_rbac_user_assignment_constraints.sql` | One-admin / one-active-manager-per-shop indexes + role/shop/cashier-needs-manager trigger + manager-deactivation safety + `rbac_assignment_violations` diagnostic view |
| `021_shop_id_required_rpc_guards.sql` | Explicit `Shop is required` guards on `create_purchase_order` and `create_stock_transfer` (the other shop-scoped RPCs already had them) |

> **Migration order warning.** Some later migrations depend on identity
> helpers from `003` and the audit-write lockdown from `013`. Always apply
> migrations in numeric order. After `018`, payment-related reads also need
> `015` (which `018` extends with the `supplier_payments` SELECT policy).

Live verification:
[`archive/29-live-supabase-rls-rpc-verification.md`](./archive/29-live-supabase-rls-rpc-verification.md)
and [`archive/30-rls-permission-gating-checklist.md`](./archive/30-rls-permission-gating-checklist.md).

## Transactional RPCs

All money / stock / status / audit-touching writes are `SECURITY DEFINER`
RPCs. Each validates `auth.uid()`, resolves the app user, checks granular
permissions + shop scope, performs the related table writes, and writes
the audit row — all in one transaction.

| RPC | Purpose |
| --- | --- |
| `complete_sale(...)` | POS checkout: sale + items + inventory + movements + audit |
| `create_refund_void_request(...)` | Cashier raises a refund or void request |
| `approve_refund_request(p_request_id)` | Manager approves a refund; restores stock, writes movements + audit |
| `approve_void_request(p_request_id)` | Manager approves a void; restocks all items |
| `reject_refund_void_request(p_request_id, p_reason)` | Reject a pending request |
| `receive_purchase_order(p_purchase_order_id, p_received_items)` | Receive a PO: PO status, received qty, inventory, `PURCHASE_IN` movements, audit |
| `complete_stock_transfer(p_transfer_id)` | Complete a transfer: source `TRANSFER_OUT` + destination `TRANSFER_IN` + audit |
| `adjust_stock(...)` | Manual adjustment / damage; checks `inventory:override_negative` if delta drives stock negative |
| `open_shift(p_shop_id, p_opening_cash_mmk)` | Open a shift; rejects concurrent open shifts per cashier |
| `close_shift(p_shift_id, p_closing_cash_mmk, p_variance_reason)` | Close a shift; recomputes expected cash; requires reason on non-zero variance |
| `create_purchase_order(...)`, `approve_purchase_order(p_purchase_order_id)`, `cancel_purchase_order(p_purchase_order_id, p_reason)` | PO lifecycle (non-receiving steps) |
| `create_stock_transfer(...)`, `approve_stock_transfer(p_transfer_id)`, `reject_stock_transfer(p_transfer_id, p_reason)`, `cancel_stock_transfer(p_transfer_id, p_reason)` | Transfer lifecycle (non-completion steps) |
| `record_supplier_payment(p_purchase_order_id, p_amount_mmk, p_payment_method, p_reference_no, p_notes)` | Supplier payment against a RECEIVED PO; updates `paid_mmk` + `payment_status` |
| `log_receipt_reprint(p_sale_id)` | Reprint log + audit row |
| `log_audit_event(...)` | Generic audit writer for admin/reference events; forces `actor_id` to `current_app_user()` |
| `create_product_image_upload_session(...)` + family | QR-based phone product image uploads (see migration 019) |

## RLS Model

RLS is enabled on all listed tables.

**Writes.**

- Protected operational tables (sales, sale items, inventory, movements,
  shifts, purchase orders + items, supplier payments, stock transfers +
  items, refund/void requests, reprint logs, audit logs) **block direct
  authenticated writes** after migrations `010`–`013`. The only way to
  modify them is via the RPCs above.
- Admin / reference tables (`shops`, `users`, `categories`, `products`,
  `product_barcodes`, `price_tiers`, `suppliers`) accept direct writes
  gated by RLS that checks the relevant granular permission.
- `users` additionally enforces user-assignment business rules at the DB
  layer (one admin globally, one active manager per shop, cashier requires
  active manager in its shop, manager-deactivation safety) via partial
  unique indexes and the `enforce_user_assignment_rules()` trigger from
  migration `020`. See `05-roles-permissions.md` for the full list.

**Reads.** Permission-gated SELECT (migration `015` + extensions in `018`):

| Table | Read rule |
| --- | --- |
| `sales` | ADMIN; `sale:view` + shop; or `sales:view_own_shift` for own sales/shift |
| `sale_items` | iff parent sale is readable |
| `inventory` | ADMIN; `inventory:view_stock` + shop |
| `inventory_movements` | ADMIN; `inventory:view_movements` + shop |
| `shifts` | ADMIN; `shift:manage_all` / `report:shop_sales` + shop; or own shifts |
| `purchase_orders` | ADMIN; `purchase:view` + shop |
| `purchase_order_items` | iff parent PO is readable |
| `supplier_payments` | ADMIN; `supplier:debt_view` or `purchase:view` + shop |
| `stock_transfers` | ADMIN; `transfer:view` + source or destination shop |
| `stock_transfer_items` | iff parent transfer is readable |
| `refund_void_requests` | ADMIN; `pos:refund` / `pos:void_sale` + shop; or own (`created_by`) |
| `reprint_logs` | iff parent sale is readable, or `printed_by` self |
| `audit_logs` | ADMIN; `audit:view_global`; or `audit:view_shop` + shop |

Reference / catalog tables (`shops`, `users`, `categories`, `products`,
`product_barcodes`, `price_tiers`, `suppliers`) stay globally readable —
the POS and shared UI need them.

## Audit Model

- Every operational RPC writes its own `audit_logs` row inside the
  transaction. Audit row and operational row commit or roll back together.
- Direct authenticated INSERT/UPDATE/DELETE on `audit_logs` is revoked by
  migration `013`.
- `log_audit_event(...)` is the only RPC that exists specifically to log
  admin/reference events; it forces `actor_id` to `current_app_user()` so
  authorship cannot be spoofed.
- Reads gated as in the table above.

## Storage

| Bucket | Public read | Writes gated by |
| --- | --- | --- |
| `product-images` | yes (thumbnails are not sensitive) | `app_has_perm('product:create' OR 'product:update')` |

- Migration `016_product_images_storage.sql` creates the bucket and four
  `storage.objects` policies scoped to `bucket_id = 'product-images'`.
- App-side image cap is **100 KB**; bucket file-size limit is 128 KB
  defense-in-depth. Allowed MIME types: `image/webp`, `image/jpeg`.
- Phone-upload paths: `product-images/temp/<sessionId>/...` — only
  reachable through the temporary one-time session token in migration
  `019`. The phone never needs to log in.

If `CREATE POLICY ON storage.objects` fails from the SQL editor, see the
dashboard fallback in
[`archive/31-product-images-storage-setup.md`](./archive/31-product-images-storage-setup.md).

## Permission columns on `users`

| Column | Notes |
| --- | --- |
| `auth_id` | UUID link to `auth.users(id)` |
| `granted_permissions` | additive permission grants |
| `revoked_permissions` | explicit denials; wins over defaults and grants |
| `permissions` | deprecated legacy replacement list |

The frontend registry (`src/lib/permissions.ts`) and the SQL contract
(`role_default_permissions()` in `014_rbac_role_tuning.sql`) **must be kept
in sync** — any change to one requires a matching change to the other.
