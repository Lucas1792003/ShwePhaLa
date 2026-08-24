# 10 · Offline-First & Desktop — Known Issues & TODO

Status snapshot of the offline-first sync layer (local Dexie/IndexedDB
mirror, write outbox, RPC + table-write reconciliation) and the Electron
desktop wrapper. Read this before touching any of `stores/data/outbox.ts`,
`stores/data/tableWrite.ts`, `lib/localDb.ts`, or `electron/`.

## ✅ Fixed — offline login (was: 🔴 critical bug)

**`src/stores/authStore.ts`'s `restoreSession()`** used to always require the
network (`resolveAppUser()` queries the `users` table, and for ADMIN
`readMfaState()` calls `supabase.auth.mfa.*`). If the device was offline at
app boot, `resolveAppUser()` failed, the error was only `console.error`'d,
and the store logged the user out — even though
`supabase.auth.getSession()` had already proven they had a valid, unexpired
local session. Net effect: closing and reopening the app while offline
locked the cashier out entirely.

**Fixed**, per the original 24-hour offline-trust-window decision:
- `restoreSession()` now catches a network-classified failure from
  `resolveAppUser()` (via `isNetworkError()` from `lib/errors.ts`, which
  checks `navigator.onLine` first) and falls back to a **locally cached
  copy of the resolved app user** — role, shop, active flag, `hasTotp` —
  instead of treating it as "not logged in." A genuine non-network error
  (RLS/data problem) still does **not** fall back and still logs out, since
  that's not a connectivity issue.
- The cache (`lib/localDb.ts`'s `authCache` table, keyed by Supabase auth
  id) is written every time `resolveAppUser()` succeeds — in
  `restoreSession()` and in `login()` (including the first-admin-signup
  path) — and cleared on `logout()`.
- A cache entry older than 24h (`OFFLINE_SESSION_TRUST_MS` in
  `authStore.ts`) is not honored — falls back to the pre-fix "log out"
  behavior rather than trusting a potentially-stale role/active flag
  indefinitely.
- An ADMIN restored from cache does **not** get an automatic `aal2`
  step-up (no network means no way to actually re-verify TOTP) — they fall
  through to `isVerifiedThisSession()` exactly as before, so a fresh
  offline session for an admin still lands on `/verify`, while a
  mid-session reload (already verified this browser session) keeps working.
- Tests: `src/stores/authStore.offline.test.ts` (fresh cache used, no
  cache logs out, stale cache logs out, genuine error doesn't use cache,
  cached ADMIN doesn't get a fake step-up, online path refreshes the cache).

**Also fixed along the way:** `stores/data/tableWrite.ts`'s `writeTableRow()`
was firing its local-cache mirror write (`mirrorLocally()`) without awaiting
it, so the function's returned promise could resolve before the local
IndexedDB write actually finished — a caller depending on the local mirror
being up to date immediately after `writeTableRow()` resolves could
occasionally read stale data. Found via a newly-flaky test, not a code
review — now awaited in both the online-success and queued-for-later paths.

## Deliberately out of scope (not bugs)

These were explicit, discussed decisions during the build — documented here
so they don't get mistaken for oversights, and so whoever picks up further
offline work knows exactly what's covered vs. not.

| Area | Stays online-only | Why |
| --- | --- | --- |
| Sales | `voidSale`, `requestVoid`, `requestRefund` approval (`approveRefund`) | Only the *request* creation (`create_refund_void_request`) is offline; approving is a manager desk action with its own permission/state checks. |
| Purchasing | `createPurchaseOrder`, `approvePurchaseOrder`, `cancelPurchaseOrder`, `paySupplierLumpSum`, `voidSupplierPayment` | Desk/admin operations. Only `receivePurchaseOrder` (loading-dock, time-critical) and `recordSupplierPayment` are offline. |
| Transfers | `createTransfer`, `approveTransfer`, `rejectTransfer`, `cancelTransfer` | Desk/planning operations. Only `dispatchTransfer` and `receiveTransfer` (both physical, at-the-shop actions) are offline. |
| Catalog | `products` (+ `product_barcodes`, `product_units`, `supplier_products`), `product_unit_prices` (`priceLevelSlice.ts`) | Multi-row batch writes (delete-then-reinsert, upsert-many) — a materially different shape than the single-row `writeTableRow()` helper Phase 4 built. Product catalog editing is back-office work, not floor-critical. |
| Admin | `business_profile` singleton update | Keyed `"default"`, not `id` — doesn't fit the generic table-write helper's shape. Rare, low-urgency edit. |

If any of these need offline support later, the *pattern* to follow is
already established:
- Single-row CRUD with no server invariants → extend `tableWrite.ts`'s
  `LOCAL_TABLES` map and swap the slice's raw `supabase.from(...)` call for
  `writeTableRow(...)` (see `categorySlice.ts` / `brandSlice.ts` for the two
  variants: fire-and-forget vs. optimistic-with-rollback).
- Server-computed / atomic RPC → mirror the pattern in `saleSlice.ts` /
  `purchaseSlice.ts`'s `receivePurchaseOrder`: a `*Online` / `*Offline` pair,
  a `reconcile*` function registered via `registerOutboxReconciler`, and —
  if the offline write can reference something else created offline in the
  same session (e.g. a sale referencing a shift opened offline) — an
  `enqueueOutbox({ refs: [...] })` entry so `outbox.ts` waits for the
  dependency's real id before replaying. See `shiftSlice.ts` +
  `recordIdMapping()` for the concrete example.

## Known gaps / polish TODO

- [x] **Pending-sync badges.** Now on `SalesTable.tsx`, `MovementsTable.tsx`,
      `TransfersPage.tsx`, `PurchasesPage.tsx`,
      `features/shifts/pages/ShiftsPage.tsx`, and the payment history table
      on `SupplierDetailPage.tsx` — every entity that carries `pendingSync`
      now shows it somewhere in its list view.
- [x] **Sync Conflicts page labels.** `pages/SyncConflictsPage.tsx`'s
      `describeEntry()` now also formats `table_write` entries (e.g.
      `categories.insert` → "Category Added") via `TABLE_LABELS`/`OP_LABELS`,
      not just the RPC-backed flows.
- [x] **Delta pull-sync — wired up**, with a real, deliberate limitation.
      `stores/data/deltaSync.ts` pulls only rows changed since the last
      cursor for the 11 tables with reliable `updated_at` tracking
      (`categories`, `brands`, `unit_types`, `products`, `product_units`,
      `price_levels`, `product_unit_prices`, `suppliers`, `purchase_orders`,
      `stock_transfers`, `shifts`). `stores/data/index.ts`'s `loadData()`
      now calls `bootstrapDeltaCursors()` after every full load to seed/
      refresh the cursors; `AppLayout.tsx`'s routine background refresh
      (30s-throttled focus regain + 120s interval) now calls the new
      `pullDeltas()` store action instead of a full `loadData({force:true})`.
      **The reconnect-after-offline path and cold boot still do a full
      reload on purpose** — delta pull can't detect a hard-deleted row (only
      `products` supports a real hard delete, via the `delete_product` RPC;
      everything else is soft-delete via `is_active`, which delta *does*
      catch correctly since it's just an UPDATE). Every other table (shops,
      users, inventory, movements, sales, sale_items,
      purchase_order_items, stock_transfer_items, supplier_payments,
      supplier_products, price_tiers, product_barcodes,
      refund_void_requests, reprint_logs, audit_logs, business_profile)
      still has no reliable change-tracking column and keeps being fully
      reloaded — extending delta sync to any of them needs another
      migration first (add `updated_at` + trigger, following 044's pattern).
      Tests: `stores/data/deltaSync.test.ts`.
- [x] **Stuck outbox entries are now flagged.** `outbox.ts`'s `drainOutbox()`
      marks any entry that's had unresolved `refs` for more than 24h
      (`STUCK_ENTRY_MAX_AGE_MS`) as a `conflict` with an explanatory
      message, instead of leaving it silently `pending` forever — it now
      shows up on the Sync Conflicts page like any other conflict.
- [x] **`provisionalIdMap` is now pruned.** `recordIdMapping()` stamps a
      `createdAt`; `drainOutbox()` sweeps out anything older than 7 days
      (`PROVISIONAL_MAP_MAX_AGE_MS`) at the start of every drain pass.
- [ ] **Bundle size.** `npm run build` warns the main chunk is ~1.76 MB
      (~481 KB gzipped) — pre-existing, not caused by this work, but the
      new Dexie/outbox/delta-sync code adds to it. `vite.config.ts` has no
      `manualChunks` split yet (see `09-roadmap-todo.md`'s existing
      "Code splitting" item — deliberately left there, not duplicated here,
      since it isn't specific to the offline work).

## Electron desktop wrapper

- [x] **Build pipeline verified end-to-end on real hardware.** `npm run
      electron:build:mac` / `:win` (run directly on the user's own Mac, not
      this dev sandbox) produced real, working installers — Mac (arm64 +
      x64 `.dmg`), Windows (x64 `.exe`) — published to a GitHub Release and
      installed via the in-app Download button (`DownloadAppModal.tsx`).
      `npm run electron:dev` (the live-reload dev flow) is still unverified,
      as is actually opening/using the packaged app post-install.
- [ ] **No cash-drawer support.** `electron/main.cjs` only wires silent
      receipt printing (`webContents.print()` to a system printer). Kicking
      a cash drawer needs either a drawer-kick ESC/POS command embedded in
      the print job (printer-model-specific) or direct USB/serial access —
      both need real hardware to implement and verify.
- [ ] **No printer-picker UI.** `preload.cjs` exposes `listPrinters()` (via
      `webContents.getPrintersAsync()`) but nothing in the app calls it —
      `printReceipt()` always uses the OS default printer, which is fine for
      most single-printer tills. Deliberately not built yet: it's a
      per-device preference (belongs in `localStorage`, not the synced
      `business_profile`), there's no existing "device settings" page it
      naturally fits (`ProfilePage.tsx` is business-brand identity, not
      hardware), and it's UI that can't be visually/functionally verified
      without a real Electron window and real printers. Natural next step
      once there's a real device to test against.
- [ ] **No app icon.** `package.json`'s `build` (electron-builder) config
      has no `icon` set for `mac`/`win` — packaged builds use Electron's
      default icon until one is added.
- [x] **Auto-update wired up, with a real caveat.** `electron/main.cjs`
      checks GitHub Releases via `electron-updater` on launch and every 4h,
      downloads in the background, and prompts to restart via a native
      dialog. `package.json`'s `build.publish` points at this repo; a new
      version ships via `electron-builder --mac --win --publish always`
      (with `GH_TOKEN` set — `export GH_TOKEN=$(gh auth token)` works if
      you're logged in via `gh`), **then `gh release edit v<version>
      --draft=false`** — electron-builder publishes releases as drafts by
      default, which are not publicly downloadable, easy to miss.
      **The real caveat**: on macOS, electron-updater's install step
      (Squirrel.Mac) requires the app to be code-signed. Our builds aren't
      (no Apple Developer certificate) — an update will likely be detected
      and downloaded but may fail to actually apply. Windows (NSIS) has no
      such requirement and should auto-update fine even unsigned.
      `mac.target` now includes `zip` alongside `dmg` — electron-updater's
      Mac update mechanism needs the zip artifact even though the dmg is
      what a fresh install uses.
- [ ] **Barcode label printing was deliberately left on `window.print()`**
      (`pages/BarcodeLabelsPage.tsx`) — per `06-ui-printing-hardware.md`,
      operators currently rely on the OS print dialog to pick matching
      label stock; switching it to silent printing would remove that choice.

## Testing gaps

- **No real Supabase project was ever exercised.** This repo has no
  `.env.local` configured, so nothing above has been clicked through in an
  actual browser or Electron window against live data — only via `npm run
  build`, `npm run test` (Vitest + `fake-indexeddb`), and `npm run lint`.
  Before trusting this in production: set up a project, run through a full
  offline → reconnect cycle for each flow in this doc's "deliberately in
  scope" list, and watch the Sync Conflicts page.
- **No browser-level E2E** (Playwright) for any offline flow — matches the
  pre-existing gap noted in `08-testing-qa.md` for the rest of the app.
- **`AppLayout.tsx`'s offline/syncing badges have no test coverage** — they're
  simple enough (`!isOnline` / `isOnline && isLoading`) that this is low
  risk, but untested.

## Where the tests that do exist live

| Area | Test file |
| --- | --- |
| Offline login / auth-cache fallback | `stores/authStore.offline.test.ts` |
| Local cache round-trip | `stores/data/localSync.test.ts` |
| Delta pull-sync (cursor fetch, merge-by-id, bootstrap, error isolation) | `stores/data/deltaSync.test.ts` |
| Outbox drain / conflict / refs / concurrency / stuck entries / id-map pruning | `stores/data/outbox.test.ts` |
| Generic table-write helper | `stores/data/tableWrite.test.ts` |
| POS checkout offline | `stores/data/slices/saleSlice.offline.test.ts` |
| Refund/void request offline | `stores/data/slices/saleSlice.refundVoid.offline.test.ts` |
| Stock adjustment offline | `stores/data/slices/inventorySlice.offline.test.ts` |
| Shift open/close offline | `stores/data/slices/shiftSlice.offline.test.ts` |
| PO receive / supplier payment offline | `stores/data/slices/purchaseSlice.offline.test.ts` |
| Transfer dispatch/receive offline | `stores/data/slices/transferSlice.offline.test.ts` |
| Catalog (category/brand/shop) offline | `stores/data/slices/catalogSlices.offline.test.ts` |
| Collision-safe id generation | `lib/id.test.ts` |
