# 09 · Roadmap & TODO

Open work, grouped by area.

## High Priority

- [x] **Admin 2FA — shipped (different design than originally scoped).**
      After the password check, ADMIN sign-in requires a second factor on a
      `/verify` page: an **authenticator-app (TOTP) code** if one is enrolled,
      otherwise a **6-digit emailed code** (10-min expiry). Built on Supabase
      native TOTP MFA (`supabase.auth.mfa.*`) for the app path and a service-
      role `admin-2fa` edge function + `admin_login_codes` table (migration
      `042`) for the email path. **No backup codes** — the email path is the
      recovery route ("Use email code instead"). Verified once per browser
      session (`adminVerified` = session `aal2` OR email flag). Admins manage
      devices (enroll / add a second phone / remove) on the in-app **Security**
      page, which is itself behind a fresh re-verify gate. `verifyTotpLogin`
      accepts **any** enrolled factor, so multiple phones work. Enrolled
      issuer is set to the brand. **Remaining (optional):** if session-level
      MFA enforcement on sensitive RLS writes is ever needed, add an `aal`
      claim check (today the gate is UI-level; the Supabase session is still
      live for an unverified admin).
- [x] **Auto-create inventory rows.** Migration `046` adds `AFTER INSERT OR
      UPDATE OF is_active` triggers on `products` and `shops` that
      SECURITY DEFINER-insert a qty-0 `inventory` row (`ON CONFLICT DO
      NOTHING`, so real stock is never touched) for every active
      product × active shop combination — covers new-product creation,
      new-shop creation, AND reactivation of either, uniformly for every
      insert path (UI, CSV import, seed script) since it lives at the DB
      level, not one call site. Verified live in a rolled-back transaction:
      inserting a test shop created rows for all 540 existing active
      products; inserting a test product created rows for every active
      shop with no duplicate for the pair reachable via both triggers.
      One-off backfill for pre-existing gaps:
      [`supabase/backfill_inventory_rows.sql`](../supabase/backfill_inventory_rows.sql)
      (run separately if not already done).
- [x] **Weekly sales report (auto-email) — shipped.** New
      `weekly-sales-report` Edge Function (mirrors `rotate-audit-log`'s
      cron-auth pattern and `dailySalesReport.ts`'s CSV column shape) plus
      a `pg_cron` job (`supabase/schedule_weekly_sales_report.sql`) firing
      Sunday 17:30 UTC == Monday 00:00 Asia/Yangon, matching what
      `WeeklyReportCountdown` already promised. Recomputes the exact MMT
      week boundary from a real calendar Monday every run (not "7 days
      before whenever cron happened to fire"), so a few minutes of cron
      jitter can't shift sales into the wrong week. Email-only, no delete.
      **Also found and fixed while wiring this up**: the *existing*
      `rotate-audit-log` cron job had never actually worked —
      `schedule_audit_rotation.sql` was run with its `<SERVICE_ROLE_KEY>`
      and `<PROJECT_REF>` placeholders never filled in, so every 5-minute
      run had been failing silently since it was first scheduled. Fixed
      and confirmed succeeding on its next real run.
- [ ] **Live Supabase RLS/RPC verification.** Run the full
      [`archive/29-live-supabase-rls-rpc-verification.md`](./archive/29-live-supabase-rls-rpc-verification.md)
      checklist against the production project. Required after every
      migration that touches RLS or RPCs.
- [ ] **Permission-gated SELECT verification.** Run
      [`archive/30-rls-permission-gating-checklist.md`](./archive/30-rls-permission-gating-checklist.md)
      to confirm migration `015` + `018`'s SELECT policies block
      cross-shop and cross-permission reads.
- [x] **System-wide error-handling polish.** Central utility is in place
      (`src/lib/errors.ts`, ErrorBoundary, `loadData` Retry). **Note:**
      `useAsyncAction` never actually existed as a hook — it was only
      mentioned in two code comments as an aspirational pattern. The real
      remaining gap was blocking `alert()` popups for async-action errors
      in `InventoryPage.tsx`, `TransfersPage.tsx` (5 sites),
      `PricingPage.tsx` (2 sites), and `ProductsManagePage.tsx` (3 sites) —
      all now route through the same `useToast()` + `getErrorMessage()`
      pattern already used in `SupplierDetailPage.tsx`/`ProductFormPage.tsx`.
      Also fixed a genuine leftover raw-error leak the earlier security
      pass missed: `ProductsManagePage.tsx`'s delete-category handler was
      showing `e.message` directly instead of routing through
      `getErrorMessage()`. Synchronous validation `alert()`s (duplicate
      name, no-stock, delete-blocked, etc.) were left as-is — not part of
      this item. Checked the two named detail-page fetch-error gaps and
      neither exists today: `SaleDetailPage.tsx` has no separate fetch (all
      data comes from the bootstrap-loaded store), and
      `SupplierDetailPage.tsx`'s action handlers already used
      `toast()`/`getErrorMessage()`, not `alert()`.
- [x] **Supplier workflow polish.** `create_supplier`/`update_supplier`
      (migration `048`, applied to production) are now `SECURITY DEFINER`
      RPCs — permission check, the write, and a `SUPPLIER_CREATED`/
      `SUPPLIER_UPDATED` audit row (with a per-field change list, e.g.
      "Changed: name, notes, deactivated") all in one transaction, global
      entity so `shop_id` is `NULL`. `purchaseSlice.ts`/
      `SupplierFormModal.tsx` call the RPCs directly (server now mints the
      id). Verified end-to-end against a rolled-back production
      transaction before applying — caught and fixed two real bugs in the
      process: a `text[] || 'literal'` operator-ambiguity crash in the
      change-tracking logic (fixed with `array_append`), and a reference to
      `suppliers.updated_at`, a column migration `044` was supposed to add
      but was never actually applied to this production project (the
      column doesn't exist yet — flagged separately, not fixed here to
      keep this migration scoped). `SuppliersPage.tsx`'s deactivate flow
      now warns with the outstanding balance/PO count
      (`getSupplierPurchaseOrders`/`getPurchaseOrderBalanceMmk` from
      `debt.ts`) before deactivating a supplier with unpaid RECEIVED POs;
      reactivating never prompts.
- [x] **User-management RPCs + atomic manager replacement.** Migration
      `049` (applied to production) adds `create_app_user`/
      `update_app_user`/`deactivate_app_user` as `SECURITY DEFINER` RPCs
      — permission check, the write, and a `USER_CREATED`/`USER_UPDATED`
      (with a per-field change list)/`USER_ACTIVATED`/`USER_DEACTIVATED`
      audit row, mirroring migration `048`'s supplier RPCs. These do
      **not** touch Supabase Auth signup (`supabase.auth.signUp` stays
      client-side in `UsersPage.tsx` — a SQL function can't call the
      GoTrue API); `create_app_user` is called after signup succeeds,
      same as the old `addUser()` was.
      Also ships `replace_manager(shop_id, new_manager_id)`, closing the
      gap `05-roles-permissions.md` flagged. The real blocker turned out
      deeper than expected — verified empirically against a rolled-back
      production transaction before writing the migration: (1)
      `users_one_active_manager_per_shop` was a **partial** unique index,
      which Postgres won't let you convert straight to a deferrable
      constraint (`ADD CONSTRAINT ... USING INDEX` rejects partial
      indexes) — fixed by replacing it with an equivalent `DEFERRABLE
      INITIALLY DEFERRED` `EXCLUDE` constraint instead, which does support
      a `WHERE` predicate; (2) a single multi-row `UPDATE` that swaps both
      the old and new manager in one statement does **not** work, because
      migration `020`'s safety trigger does a live `EXISTS` check that
      can't see another row's change from later in the *same* statement —
      `replace_manager()` does it as two separate statements instead (new
      manager first, old manager second), which a real test confirmed
      works correctly. The pre-existing protection (blocking a *plain*
      deactivate of a shop's sole manager while active cashiers remain,
      outside of `replace_manager`) was re-verified unchanged.
      `users_one_active_manager_per_shop`'s violation code changed from
      `23505` to `23P01` (unique → exclusion constraint) —
      `userFormErrors.ts` updated to still map it.
      `UsersPage.tsx` gained a "Replace manager" button, shown when
      editing an existing user into MANAGER for a shop that already has a
      different active manager.
- [x] **Seed tooling cleanup.** `src/data/seed.ts`/`seedSupabase.ts` (both
      previously unreferenced anywhere in the app) moved to `scripts/seed/`
      — outside `tsconfig.app.json`'s `src` include, so they can never be
      pulled into the browser bundle even by an accidental future import.
      Split into `seedData.ts` (data), `seedRun.ts` (shared insert
      sequence, parameterized on the Supabase client), `seedBrowser.ts`
      (the original guarded anon-key variant), and a new
      `seedServiceRole.ts` (`npm run seed:service-role`) that seeds via a
      service-role key from the environment — no dev server or browser
      opt-in flag needed. Added `tsx` as a devDependency to run it.
- [x] **Code splitting.** `src/app/routes/AppRouter.tsx`'s admin pages
      (Shops, Users, Products, UnitTypes, Barcodes, Suppliers, Pricing,
      AuditLog, SyncConflicts), reports (Shop/Global/Profit), and the
      Product Form page now load via `React.lazy` + a single `<Suspense>`
      wrapper around the route tree. Main entry chunk dropped from
      1,768 KB to ~1,566 KB (gzip ~432 KB), with 12 routes split into
      their own on-demand chunks. POS, Dashboard, and Login stay eager.

## Security (from 2026-08-24 full-codebase audit)

Findings from a defensive security pass across the Supabase backend, client
auth/session/offline layer, general app hygiene, and the Electron desktop
app. Ordered by severity; each was independently verified with a concrete
exploit/failure path, not speculative. See the audit conversation for full
per-area detail if more context is needed before fixing.

- [ ] **Deactivated/revoked staff can keep completing real offline sales for
      up to 24h.** `authStore.ts`'s offline session-trust window (built for
      the offline-login fix) isn't just a stale-read risk — `saleSlice.ts`'s
      `createSaleOffline()` runs full checkout (stock validation, totals,
      receipt print) locally with no live permission check; only the
      eventual outbox sync re-validates server-side. A cashier deactivated
      mid-shift on an offline till can keep ringing up sales and taking cash
      for up to 24h before the sync finally rejects — by which point goods/
      cash are already gone. Consider shortening the trust window for
      write-eligible offline sessions specifically, or requiring a
      reconnect-and-revalidate before allowing further offline checkouts
      past some threshold.
- [x] **Fixed — `users_upd`/`users_ins` privilege-escalation gap.**
      Migration `047` adds a `BEFORE INSERT OR UPDATE ON users` trigger
      (`guard_user_privilege_columns()`) that rejects any change to
      `role`, `granted_permissions`, `revoked_permissions`, or the
      deprecated legacy `permissions` column unless the caller is
      genuinely ADMIN (`app_role()`) — covers both the originally-flagged
      UPDATE path (a delegated `user:update` holder self-escalating) and a
      second vector found while fixing it: `users_ins`'s `WITH CHECK` has
      the same shape, so a delegated `user:create` holder (a much more
      plausible grant — "let this manager onboard staff") could otherwise
      INSERT a brand new row with `role='ADMIN'` outright. `is_active` is
      deliberately NOT guarded — deactivating/reactivating doesn't grant
      capability, and a deactivated caller's own permission checks already
      fail immediately (see the migration's own comment for the full
      reasoning). The first-ever user (bootstrap) is exempted, mirroring
      `users_ins`'s existing escape hatch. A genuine ADMIN is unaffected
      either way. Verified live in a rolled-back transaction: an UPDATE
      attempting `role='ADMIN'` from a non-admin context raised "Only an
      ADMIN can change role or permission overrides." exactly as designed.
- [ ] **Offline outbox can misattribute actions on a shared till.** Queued
      offline writes (stock adjustments, transfer dispatch/receive,
      supplier payments) resolve the acting user at *sync* time via
      `current_app_user()`, not at queue time. If Cashier A queues an
      action offline and logs out before reconnecting, Cashier B logging in
      next can trigger the replay under B's identity/audit trail.
      (`complete_sale` is already safe — it independently checks shift
      ownership.) Consider stamping the queued actor id at enqueue time and
      having the RPCs verify it matches, or blocking outbox drain across a
      user switch until the previous user's queue is empty.
- [ ] **`log_audit_event` RPC lets any authenticated user forge audit
      entries for any shop** (`supabase/migrations/012_operational_status_rpcs.sql:586-611`).
      No permission check, no verification that `p_shop_id` matches the
      caller's shop. Gate on a real permission and cross-check the shop, or
      restrict to a fixed allow-list of legitimate action types.
- [ ] **`logout()` doesn't clear the shared Zustand/Dexie data mirror.** On
      a shared till, a user logging in right after another logs out (no
      connectivity gap in between) can briefly render the previous user's
      cached cross-shop data until the next background refresh. Force a
      `loadData({force:true})` (or at least a store reset) on every login,
      not just on offline→online transitions.
- [x] **Fixed — raw Postgres/Supabase error text shown to cashier-level
      users.** `PosPage.tsx` checkout, `InventoryPage.tsx` stock
      adjustment, `TransfersPage.tsx` (create/approve/reject/dispatch/
      cancel), `PricingPage.tsx` (save/delete/toggle), and
      `PhoneProductImageUploadPage.tsx` (session load + upload) all now
      route through `reportError()`/`getErrorMessage()` from
      `src/lib/errors.ts` instead of dumping `error.message` straight
      into an alert/toast — schema/constraint details stay in the
      console; the user sees a friendly mapped message, or the original
      text only when it already reads like a clean business-rule message
      (e.g. an RPC's own "Open a shift before checkout.").
- [x] **Fixed — Electron's `shell.openExternal` now scheme-restricted to
      `https:`** (`electron/main.cjs`'s `setWindowOpenHandler`). A
      malformed URL is caught and simply not opened rather than passed to
      the OS opener.
- [x] **Fixed — CSV export formula injection.** `src/lib/csv.ts`'s
      `toCsv()` (and the equivalent `csvCell()` helpers duplicated in the
      `rotate-audit-log` and `weekly-sales-report` Edge Functions — Deno
      functions can't import from `src/`) now prefix a **string** cell
      starting with `=`/`+`/`-`/`@`/tab/CR with a `'`, forcing Excel/Sheets
      to treat it as text instead of a formula. Scoped to `typeof value
      === "string"` specifically so real negative numbers (prices,
      quantity deltas) are never touched. Tests: `src/lib/csv.test.ts`.
- [ ] **No max-length on product name/SKU** (`ProductFormPage.tsx:173`) —
      low severity, but unbounded storage/CSV export. Add a reasonable
      client + DB constraint.
- [ ] **`printers:print-receipt`'s `deviceName` isn't validated against the
      real printer list** before being passed to `webContents.print()`
      (`electron/main.cjs:179`) — low risk (print() doesn't touch the
      filesystem), but should check against `getPrintersAsync()` output
      first.
- [ ] **No Content-Security-Policy for the Electron-loaded content.**
      Defense-in-depth gap only (contextIsolation + narrow preload bridge
      already limit the blast radius), but worth adding a meta-tag CSP.
- [ ] **Legacy `complete_stock_transfer` RPC still executable**, bypassing
      the newer two-step `dispatch_stock_transfer` →
      `receive_stock_transfer` maker-checker flow it was meant to replace
      (migration `038`). `REVOKE EXECUTE ... FROM authenticated` on the old
      function.
- [ ] **A manager can approve their own refund/void request** — no
      independent second-approver check in `approve_refund_request` /
      `approve_void_request` (`supabase/migrations/005_refund_void_rpc.sql`).
      Within their existing authority either way, but undermines the
      maker-checker UI framing; consider requiring a different approver id
      than the requester for MANAGER-level approvals.
- [ ] **Confirm intentional: full `users` table (roles, shop, active flag,
      permission overrides) is readable by any authenticated user**, not
      just via the admin-gated UI — `users_sel USING (true)` per
      migrations `010`/`015`, deliberately kept as "global reference data."
      A CASHIER/BUYER with devtools can call `supabase.from('users').select('*')`
      directly. Low severity (read-only), but confirm this is the intended
      tradeoff before treating it as settled.

## Medium Priority

- [x] **Flexible sellable units (per-product).** Migration 026 adds
      `product_units`, unit-linked barcodes, sale item unit snapshots, and
      POS deduction by base units. `products.pack_size` remains legacy-only.
      Follow-up: deeper refund UX for mixed units of the same product and
      full browser/real-scanner QA.
- [x] **Unit-aware purchase receiving + stock adjustment.** Migration
      `028` extends `receive_purchase_order` and `adjust_stock` to accept
      `{product_unit_id, unit_qty}`; server validates the unit belongs to
      the product, computes `base_qty = unit_qty × unit.base_quantity`,
      and writes a snapshot (`product_unit_id`, `unit_name_snapshot`,
      `unit_base_quantity_snapshot`, `selected_unit_quantity`) onto the
      `*_items` row and the `inventory_movements` row. Inventory writes
      remain in base units. UI: Purchase Receive modal + Adjust Stock
      modal both render a Unit dropdown with a base-quantity preview.
- [x] **Unit-aware stock transfer creation.** Migration `029` updates
      `create_stock_transfer` to accept `{product_unit_id,
      selected_unit_quantity}` per line, validate active unit ownership,
      compute base requested quantity server-side, store unit snapshots on
      `stock_transfer_items`, and validate combined source stock in base
      units. Transfer completion from migration `028` propagates those
      snapshots into both movement rows.
- [x] **Unit-aware barcode label printing.** Barcode Labels can select a
      Product Unit, print unit name + price, use unit-specific barcodes,
      and fall back to SKU for default-unit labels only.
- [x] **Product Units & Prices form UX.** Product create/edit no longer
      exposes duplicate top-level Selling Price / Cost Price inputs. Pricing
      lives on unit cards: Purchase Cost, Retail (Sale 1), Wholesale
      (Sale 2), Special (Sale 3), barcode, and base-unit conversion.
      Legacy `products.price_mmk` / `cost_mmk` stay synced from the default
      unit for fallback compatibility.
- [x] **Brands + product quick fields.** Brands are category-scoped catalog
      rows; products now carry alias code, short name, max quantity,
      Open Price, Non Stock, and purchase type.
- [x] **Open Price + Non Stock POS behavior.** POS prompts for Open Price
      unit prices, bypasses stock guards for Non Stock products, and
      `complete_sale` enforces both flags server-side.
- [x] **Product CSV import/export.** Product Management exports the current
      product data with active price-level columns and imports through a
      validation + dry-run preview before writes.
- [x] **POS Bills polish.** Bills has line-level price-level selection,
      icon-only delete, stacked quantity controls, separate name/unit lines,
      and an `All` modal for the full cart.
- [~] **Flow tests (store + mocked Supabase) added; Playwright still open.**
      Critical flows now have integration-style tests that drive the data-store
      actions with the Supabase client mocked: POS checkout (`complete_sale`
      payload/price branches/reconcile), PO receive, transfer
      dispatch/receive, and refund/void approval. A full browser-level
      Playwright suite for the workflows in
      [08-testing-qa.md](./08-testing-qa.md) is still the remaining piece.
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

- [x] **Desktop wrapper (Electron) + offline POS with sync.** Shipped —
      native Windows/Mac app (installers via a sidebar Download button,
      GitHub Releases + auto-update), silent ESC/POS-compatible printing,
      and a full offline-first sync layer (local IndexedDB mirror, write
      outbox, delta sync) covering the floor-critical flows — POS
      checkout, stock adjustments, shift open/close, refund/void requests,
      PO receiving, supplier payments, transfer dispatch/receive, and
      simple catalog edits. See
      [06-ui-printing-hardware.md](./06-ui-printing-hardware.md#desktop-wrapper-electron)
      and [10-offline-desktop-known-issues.md](./10-offline-desktop-known-issues.md)
      for the full scope map (what's still online-only and why), known
      gaps (no cash-drawer support, no code signing), and verification
      status. OPOS/JavaPOS native hardware drivers remain undone — no
      hardware available to build against.
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
- [x] Brand registry (migration `031`), product quick fields
      (migration `032`), and Open Price / Non Stock `complete_sale`
      enforcement (migration `033`).
- [x] Multi-line checkout stock fix (running per-product tally, migration
      `034`).
- [x] Unique supplier code + supplier⇄product catalog (migrations `035`,
      `036`).
- [x] Receive-at-received-value PO billing (migration `037`).
- [x] Two-step transfers — `dispatch_stock_transfer` →
      `receive_stock_transfer` (migration `038`, supersedes
      `complete_stock_transfer`).
- [x] Void supplier payment + lump-sum supplier payment (migrations `039`,
      `040`).
- [x] Captured COGS — `sale_items.unit_cost_mmk_snapshot` written by
      `complete_sale` so profit uses historical cost (migration `041`).
- [x] Admin email-code 2FA table + `admin-2fa` edge function (migration
      `042`); authenticator-app TOTP via Supabase native MFA.
- [x] Business profile (brand name/logo/contacts) singleton (migration
      `043`).
- [x] `updated_at` + triggers on the 6 tables offline delta-sync needed
      (migration `044`).
- [x] `resolve_event_time()` + `p_created_at` param on every
      offline-eligible RPC, so a write queued offline keeps its real
      timestamp instead of recording as whenever it happened to sync
      (migration `045` — see
      [10-offline-desktop-known-issues.md](./10-offline-desktop-known-issues.md)).
- [x] Auto-create qty-0 inventory rows for every active product × active
      shop, via triggers on `products`/`shops` (migration `046`).
- [x] `guard_user_privilege_columns()` trigger blocks a non-admin from
      changing `role`/`granted_permissions`/`revoked_permissions`/
      `permissions` on any `users` row, closing a privilege-escalation
      gap in `users_upd`/`users_ins` (migration `047`).

## Completed Frontend Hardening (for reference)

- [x] **Full-app theme system.** System / Light / Dark covers POS,
      dashboards, tables, forms, modals, semantic status surfaces, and chart
      labels/grids. System is the persisted default and follows live OS
      changes; `index.html` resolves it before first paint. Receipts, barcode
      labels, and QR paper surfaces remain print-safe on white.
- [x] **Windows updater "cannot be closed" — real root cause found and
      fixed (v1.0.10).** v1.0.7 and v1.0.9 both hardened the app-running
      pre-check (single-instance lock, hard-exit timer, external
      `taskkill` watchdog) and a real v1.0.7 → v1.0.9 test still
      reproduced the exact same dialog — both were fixing the wrong NSIS
      code path. The actual failure is a separate, non-customizable
      5-second file-copy retry loop in electron-builder's own
      `extractAppPackage.nsh`. v1.0.10's `build/installer.nsh` now
      loop-verifies the old process is gone (via `tasklist`) instead of a
      flat sleep, giving that retry window far more real margin. See
      document 10 for the full diagnosis. Real-hardware confirmation of
      an older-version → v1.0.10 update remains in document 10's testing
      gaps.
- [x] **Sidebar footer action layout (v1.0.8).** Update and logout controls now
      use full-width stacked rows so labels and dynamic updater states cannot
      overlap in the expanded desktop sidebar.
- [x] Receipt + Sales drawer unified through `ReceiptDetail`.
- [x] Shift summary parity (cashier card + manager modal) via
      `buildShiftBreakdown`.
- [x] Cashier sales history scope.
- [x] Tablet/desktop responsive overhaul + `SmallScreenGuard`.
- [x] Barcode label preview + template registry.
- [x] POS barcode scan SKU fallback + scan UX (success toast, refocus).
- [x] Collapsible sidebar with persisted icon-only rail.
- [x] Supplier detail moved to full-page route at
      `/app/suppliers/:supplierId`.
- [x] System-wide error utility + `useAsyncAction` + top-level
      ErrorBoundary + `loadData` retry surface.
- [x] **Product CRUD moved to dedicated routes.** `/app/admin/products/new`
      and `/app/admin/products/:productId/edit` replace the cramped modal
      with a 2-column page (Identity / Classification / Stock & Status on
      the left, Units & Prices on the right). Manager Products gate fixed
      (`adminProducts` route now `product:read`; Add / Delete / Add
      Category / Add Brand buttons gated individually).
- [x] **Shift detail moved to a dedicated page.** `/app/shifts/:shiftId`
      renders the breakdown, an items-sold rollup (NORMAL sales only),
      an iStock-style per-sale table with expandable line items, and
      the inline Close-shift card. Replaces the previous modal.
- [x] **POS checkout split into F2 (Place Order) / F3 (Print).** After
      checkout the cashier stays on POS; F3 prints inline via a
      hidden React portal to `<body>` so no POS ancestor breaks the
      absolute-receipt positioning. Barcode toggle moved to F4. Enter
      on the payment Amount field confirms.
- [x] **POS Adjust Price tabs.** Per-line price-level picker is now
      tab buttons (Retail / Wholesale / Special) plus a manual price
      input; editing the input flags the line as a manual override.
- [x] **Receipt redesign.** 4-column items table (Description / Qty /
      Price / Amount), grid meta block with aligned colons, brand line
      `Shwe PhaLar` above the per-shop name, single-level price moved
      to the meta block when every line shares a level, Burmese
      thank-you footer.
- [x] **Inventory admin shop picker.** Pill row above the
      Stock/Movements tabs (emerald active state) so admins can switch
      shops without leaving the page. Inventory Product + Category
      cells now match the Products admin styling.
- [x] **Category UX improvements.** Brand list moved to a popup modal
      per category card; icon+color uniqueness surfaced in the colour
      picker (greys out conflicting swatches in real time). POS
      category row is horizontally scrollable with click-and-drag
      support and a hidden scrollbar.
- [x] **Daily sales email report** for admins. `Email today's CSV`
      button on Sales calls the `email-sales-report` Supabase edge
      function which emails per-shop CSVs via Resend. Open shifts are
      surfaced as an in-email "data may be incomplete" notice instead
      of blocking the send. See
      [04-features-workflows.md](./04-features-workflows.md#daily-sales-email-report)
      and [07-setup-deployment.md](./07-setup-deployment.md#daily-sales-email-function).
- [x] **Full English / Myanmar i18n** across the app (sidebar already had it;
      now suppliers, supplier detail, POS + cart/payment/finder, products
      management + form, login, inventory, purchases, transfers, profile,
      security). `useTranslation().t(section, key, vars?)` gained
      `{placeholder}` interpolation.
- [x] **Reports uncapped to the selected range.** Profit/COGS reports use
      `useRangedSales` to fetch sales + items for the chosen `[from, to]`
      straight from Supabase (id-batched), bypassing the 1000-row store cache
      cap, and prefer `unit_cost_mmk_snapshot` for cost.
- [x] **Admin Profile + Security sidebar pages** (under Administration);
      Products moved to "Inventory & Catalog". Sidebar header + receipts now
      render the editable business brand.
- [x] **Convenience-store category icon set** + smarter name→icon aliases.
- [x] **Dashboard cards** — unified Low Stock (single + all-shops) with
      "View all", and a Transfers-status card in the admin Action Queue.
