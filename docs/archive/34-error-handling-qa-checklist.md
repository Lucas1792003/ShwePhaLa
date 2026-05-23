# Error Handling QA Checklist

Manual scenarios to spot-check before each release. Every item should produce a
clear, friendly user-facing message — never a silent failure or a raw
Postgres/JS stack trace. Run them across both an ADMIN and a CASHIER session
unless noted.

## Bootstrap & connectivity

- [ ] **Offline app load.** Disable the network in DevTools, hard reload `/app`.
      Expected: "Couldn't load your data" screen with the friendly network
      message and a working **Retry** button (in `AppLayout`). After re-enabling
      the network and pressing Retry the app loads normally.
- [ ] **RLS denial on bootstrap.** Sign in as a user whose `users` row is
      `is_active = false` (or who lacks read access to any required table).
      Expected: Retry screen with "You do not have permission to perform this
      action." — not an empty/blank app.
- [ ] **Expired session.** Manually expire the JWT (or wait it out) and trigger
      any action. Expected: toast "Your session expired. Please log in again."
      and bounce back to login on next protected route.

## Authentication

- [ ] **Wrong password login.** Expected: inline form error "Invalid email or
      password." No toast spam, no crash.
- [ ] **First-admin signup with weak password.** Expected: friendly error from
      Supabase reasons surface clearly; no double user row created.
- [ ] **Logout while offline.** Expected: clears local session even when
      Supabase signOut fails (user is bounced to login).

## POS

- [ ] **Scan unknown barcode.** Expected: toast "Barcode not found".
- [ ] **Add product at max stock.** Expected: toast "Only X in stock for this
      shop." Cart quantity is not changed.
- [ ] **Out-of-stock add.** Expected: toast "Out of stock"; cart unchanged.
- [ ] **Checkout without an open shift.** Expected: button disabled, helper
      reads "Open a shift before checkout." Confirm action blocked.
- [ ] **Failed `complete_sale` (e.g., simulated 500).** Expected: payment modal
      stays open, error toast, cart is NOT cleared, navigation does NOT happen.
- [ ] **Receipt reprint without permission.** Expected: toast with friendly
      permission message; no log row written.

## Shifts

- [ ] **Open shift while another is open.** Expected: friendly RPC message;
      local shift state does not pretend it opened.
- [ ] **Close shift with bad variance reason.** Expected: modal stays open,
      shift remains open until success.
- [ ] **Shift summary load failure.** Expected: error message in panel, not a
      crash; existing data continues to show.

## Inventory / Stock Movements

- [ ] **Stock adjustment with insufficient stock.** Expected: friendly
      "Not enough stock available for this product." toast; local inventory
      is not decremented.
- [ ] **Damage write-off without permission.** Expected: permission toast; no
      movement row appears optimistically.
- [ ] **Inventory page initial load failure.** Expected: error state, not
      empty state.

## Products / Categories / Barcodes

- [ ] **Create product with duplicate SKU.** Expected: modal stays open, friendly
      "This record already exists." message; form values preserved.
- [ ] **Delete category that still has products.** Expected: friendly block
      message; category remains active.
- [ ] **Product image upload when bucket is missing.** Expected: friendly
      storage-bucket message; product save itself can still proceed without
      an image (or fails cleanly if image was required).
- [ ] **Image upload blocked by storage RLS.** Expected: "Upload was blocked by
      storage permissions." toast.
- [ ] **Print labels for a product with no SKU and no barcode.** Expected:
      friendly "No barcode available for this product." state — not a blank
      label sheet.

## Suppliers / Purchases / Supplier Debt

- [ ] **Create supplier with duplicate code.** Expected: modal stays open,
      duplicate message.
- [ ] **Receive a purchase order with bad quantities (over ordered).** Expected:
      RPC error surfaces, PO not marked received.
- [ ] **Record supplier payment exceeding outstanding balance.** Expected:
      friendly RPC message; supplier balance not mutated.
- [ ] **Supplier detail drawer load failure (network or RLS).** Expected:
      inline error in drawer; rest of page still works.

## Transfers

- [ ] **Create transfer with insufficient source stock.** Expected: friendly
      stock message; transfer is not optimistically inserted into list.
- [ ] **Approve / reject / cancel transfer race (already-decided).** Expected:
      friendly conflict message; UI re-syncs.
- [ ] **Complete transfer when destination is offline.** Expected: caller sees
      the failure and may retry; inventory totals do not double-count.

## Reports / Dashboard / Sales History

- [ ] **Open a sale detail with an invalid id (or RLS-blocked).** Expected:
      friendly not-found / no-permission state in the drawer/page; no crash.
- [ ] **Reports query with empty data.** Expected: empty-state message, not
      "Loading…" forever and not NaN charts.
- [ ] **Network blip mid-report.** Expected: error state with Retry; previously
      shown data does not get half-overwritten.

## Global behaviors

- [ ] **Modal save failure.** For Product / Category / Supplier / PO / Transfer
      / Payment / Shift Close / Supplier Payment modals: simulate a failure
      and confirm the modal stays open, form values are preserved, the save
      button re-enables, and a friendly toast is shown.
- [ ] **Double-submit prevention.** Click Save twice fast on any modal.
      Expected: only one request goes out; button is disabled during flight.
- [ ] **Top-level render error.** Throw from a component in dev to verify the
      ErrorBoundary fallback ("Something went wrong" + Try again / Reload).
      Stack trace appears only in dev.

## Verifying friendly mappings

The `src/lib/errors.ts` mapper covers the common cases. When a new RPC adds
domain-specific error text, add it to the appropriate phrase list there (with
a unit test) rather than catching the raw message in the calling component.
