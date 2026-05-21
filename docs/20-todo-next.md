# Project Status And Next Steps

## Current Status

Shwe Phala POS is now a Supabase-backed app:

- Supabase Auth handles login.
- `users.auth_id` links staff profiles to Auth users.
- Business data persists in Supabase PostgreSQL.
- localStorage is limited to UI preferences and the Supabase Auth session.
- Granular permission strings are the only authorization model.
- RLS is enabled and operational writes are locked behind RPCs.

## Completed Backend Hardening

- [x] Identity linking and awaited persistence.
- [x] Granular RBAC with `granted_permissions` and `revoked_permissions`.
- [x] SQL identity/permission helpers:
  `current_app_user()`, `app_role()`, `app_shop_id()`, `app_has_perm()`,
  `app_can_for_shop()`.
- [x] Atomic POS checkout: `complete_sale`.
- [x] Atomic refund/void approval: `approve_refund_request`,
  `approve_void_request`.
- [x] Atomic purchase receiving: `receive_purchase_order`.
- [x] Atomic transfer completion: `complete_stock_transfer`.
- [x] Atomic stock adjustment/damage: `adjust_stock`.
- [x] Atomic shift open/close: `open_shift`, `close_shift`.
- [x] PO/transfer/request/reprint status RPCs.
- [x] Direct write lockdown for protected operational/audit tables.
- [x] Shop-scoped operational reads.
- [x] Live verification checklist: [29-live-supabase-rls-rpc-verification.md](./29-live-supabase-rls-rpc-verification.md).

## Database Tables

See [04-database-schema.md](./04-database-schema.md) for the source of truth.

Key current names:

- Current stock table: `inventory`
- Movement ledger: `inventory_movements`
- Refund/void requests: `refund_void_requests`
- Product scan-code mappings: `product_barcodes`
- Product catalog code: `products.sku`

Use these names in docs and code; avoid legacy table aliases.

## RLS Status

Current RLS model:

- Direct writes to protected operational tables are revoked.
- Protected writes must go through `SECURITY DEFINER` RPCs.
- Operational reads are shop-scoped for non-admin users.
- Admin can read all operational data.
- `audit_logs` direct insert/update/delete is revoked.
- Admin/reference tables still use direct, permission-gated writes:
  `shops`, `users`, `categories`, `products`, `product_barcodes`,
  `price_tiers`, and `suppliers`.

## Permission Model

Use granular permission strings from `src/lib/permissions.ts`, for example:

- `pos:create_sale`
- `sale:view`
- `product:create`
- `barcode:manage`
- `inventory:read`
- `inventory:adjust`
- `purchase:view`
- `purchase:create`
- `transfer:view`
- `approval:view`
- `report:shop`
- `report:global`

Old coarse permission names are deprecated and should not appear in new docs or
code.

## Next Recommended Work

### High Priority

- [ ] Run the live Script 4D verification checklist against the target Supabase project.
- [ ] Move `src/data/seedSupabase.ts` out of browser source into service-role or SQL seed tooling.
- [ ] Add Playwright smoke tests for POS checkout, shift close, refund/void,
  purchase receiving, and transfer completion.
- [ ] Add code splitting for large route chunks.

### Medium Priority

- [ ] Customer management module.
- [ ] Customer loyalty/points system.
- [ ] Credit sales tracking.
- [ ] Receipt printer integration (ESC/POS).
- [ ] Real-time stock updates via Supabase subscriptions.

### Low Priority

- [ ] Mobile app.
- [ ] Offline mode with sync.
- [ ] Email/SMS notifications.
- [ ] API for third-party integrations.

## Useful Docs

- [01-roles-permissions.md](./01-roles-permissions.md)
- [04-database-schema.md](./04-database-schema.md)
- [10-localstorage-persistence.md](./10-localstorage-persistence.md)
- [12-supabase-setup.md](./12-supabase-setup.md)
- [17-architecture.md](./17-architecture.md)
- [29-live-supabase-rls-rpc-verification.md](./29-live-supabase-rls-rpc-verification.md)
