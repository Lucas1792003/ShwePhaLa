# 09 · Roadmap & TODO

Open work, grouped by area.

## High Priority

- [ ] **Live Supabase RLS/RPC verification.** Run the full
      [`archive/29-live-supabase-rls-rpc-verification.md`](./archive/29-live-supabase-rls-rpc-verification.md)
      checklist against the production project. Required after every
      migration that touches RLS or RPCs.
- [ ] **Permission-gated SELECT verification.** Run
      [`archive/30-rls-permission-gating-checklist.md`](./archive/30-rls-permission-gating-checklist.md)
      to confirm migration `015` + `018`'s SELECT policies block
      cross-shop and cross-permission reads.
- [ ] **System-wide error-handling polish.** Central utility is in place
      (`src/lib/errors.ts`, `useAsyncAction`, ErrorBoundary, loadData
      Retry). Remaining: migrate the rest of the modals to
      `useAsyncAction`; surface per-detail-page error states (sale detail
      drawer, supplier detail page) when a single fetch fails after
      bootstrap.
- [ ] **Supplier workflow polish.** Move supplier `INSERT`/`UPDATE` to a
      dedicated RPC for audit-row consistency (today they're direct
      `dbExec` writes with friendly toasts). Add a confirmation step
      before deactivating a supplier with outstanding RECEIVED POs.
- [ ] **User-management RPCs (`create_app_user` / `update_app_user` /
      `deactivate_app_user`).** Migration `020` enforces the
      assignment rules at the DB level, but creates/updates are still
      direct table writes. Wrapping them in `SECURITY DEFINER` RPCs would
      give us atomic validation + per-call audit rows + a place to plug in
      a `replace_manager(shop_id, new_user_id)` flow that swaps managers
      atomically (today the operator has to deactivate cashiers first if
      the shop already has cashiers — see `05-roles-permissions.md`).
- [ ] **Seed tooling cleanup.** Move `src/data/seedSupabase.ts` out of
      `src/` so it cannot accidentally ship in the browser bundle. Keep a
      service-role / SQL-seed variant for local dev.
- [ ] **Code splitting.** Production bundle is ~1.3 MB (gzip ~365 KB).
      Add Vite `manualChunks` or convert heavier routes (admin, reports)
      to `React.lazy` + dynamic imports.

## Medium Priority

- [ ] **Playwright smoke tests** for the workflows enumerated in
      [08-testing-qa.md](./08-testing-qa.md).
- [ ] **Print + barcode hardware QA.** Test ESC/POS thermal printers at
      80 mm; test CODE128 labels at each of the four template sizes on
      real label paper.
- [ ] **Storage object orphan cleanup.** Scheduled job that prunes
      `product-images` objects with no referencing `products.image_url`
      and `product-images/temp/*` from expired/canceled QR sessions.
- [ ] **Customer management module** + loyalty/points.
- [ ] **Credit sales tracking** (customer-side payable).
- [ ] **Real-time stock + sales updates** via Supabase Realtime
      subscriptions (currently the app loads on bootstrap).

## Low Priority

- [ ] **Future desktop wrapper** (Electron / Tauri) for native
      ESC/POS / OPOS hardware and offline POS with sync.
- [ ] **Email / SMS notifications** (e.g. low stock, shift variance,
      pending approvals).
- [ ] **Public API** for third-party integrations.
- [ ] **Mobile app** (read-only catalog + receipts initially).
- [ ] **Audit row prune / archive** for very long-lived deployments.

## Completed Backend Hardening (for reference)

These were the headline backend hardening milestones; details are in
[03-database-security.md](./03-database-security.md) and
[`archive/21-recent-changes.md`](./archive/21-recent-changes.md).

- [x] Identity linking via `users.auth_id` (migration `001`).
- [x] Granular RBAC with `granted_permissions` / `revoked_permissions`
      (migration `002`).
- [x] SQL identity / permission helpers (migration `003`).
- [x] Atomic POS checkout RPC `complete_sale` (migration `004`).
- [x] Atomic refund / void approval RPCs (migration `005`).
- [x] Atomic purchase receiving RPC `receive_purchase_order`
      (migration `006`).
- [x] Atomic transfer completion RPC `complete_stock_transfer`
      (migration `007`).
- [x] Atomic stock adjustment / damage RPC `adjust_stock`
      (migration `008`).
- [x] Atomic shift lifecycle RPCs `open_shift` + `close_shift`
      (migration `009`).
- [x] RLS write lockdown on operational tables (migrations `010`, `011`,
      `013`).
- [x] PO / transfer / request / reprint status RPCs (migration `012`).
- [x] RBAC role tuning + permission split (migration `014`).
- [x] Permission-gated SELECT RLS (migrations `015`, `018`).
- [x] Product images in Supabase Storage (migration `016`); icon-based
      categories (migration `017`).
- [x] Supplier debt + `record_supplier_payment` (migration `018`).
- [x] QR phone product image uploads (migration `019`).
- [x] RBAC user-assignment constraints — one admin globally, one active
      manager per shop, cashier-needs-manager, manager-deactivation
      safety (migration `020`).

## Completed Frontend Hardening (for reference)

- [x] Receipt + Sales drawer unified through `ReceiptDetail`.
- [x] Shift summary parity (cashier card + manager modal) via
      `buildShiftBreakdown`.
- [x] Cashier sales history scope.
- [x] Tablet/desktop responsive overhaul + `SmallScreenGuard`.
- [x] Barcode label preview + template registry.
- [x] POS barcode scan SKU fallback + scan UX (success toast, refocus).
- [x] Supplier detail moved to full-page route at
      `/app/suppliers/:supplierId`.
- [x] System-wide error utility + `useAsyncAction` + top-level
      ErrorBoundary + `loadData` retry surface.
