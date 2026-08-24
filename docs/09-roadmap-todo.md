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
- [ ] **Auto-create inventory rows.** A product only gets an
      `inventory (shop_id, product_id, qty_base_units)` row the first time
      it's stocked (purchase receive / adjust). Never-stocked products
      therefore have no row, which makes them show "0 in stock" in POS but
      stay invisible to the dashboard's all-shops Low Stock card (it scans
      existing rows only — see `04-features-workflows.md`). Create a qty-0
      row for every active product × active shop on **product creation** and
      **shop creation** so POS and the dashboard always agree. One-off
      backfill for existing data: [`supabase/backfill_inventory_rows.sql`](../supabase/backfill_inventory_rows.sql).
- [ ] **Weekly sales report (auto-email).** The Sales page already shows an
      admin countdown to next Monday (`WeeklyReportCountdown`). Build the
      backend: a Monday `pg_cron` job + `weekly-sales-report` Edge Function
      that emails the previous week's (Mon–Sun) per-shop CSVs to all active
      admins via Resend — **email-only, no delete** (sales are kept so the
      monthly Sales view + dashboard stay complete). Mirror the
      `email-sales-report` / `rotate-audit-log` patterns. Until built, the
      countdown is cosmetic.
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

## Completed Frontend Hardening (for reference)

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
