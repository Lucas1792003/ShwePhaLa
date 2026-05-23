# 08 · Testing & QA

The codebase has Vitest unit tests for pure helpers (POS cart-stock,
supplier debt + action matrix, barcode lookup, error mapper, etc.). End-
to-end UI assertions and database-side verification live in checklists.

```bash
npm test             # Vitest (currently 19 files / 228 tests passing)
npx tsc -b           # Type check
npm run build        # Production build
npm run lint         # ESLint
```

## Vitest Coverage Today

| File | Surface |
| --- | --- |
| `src/lib/errors.test.ts` | Error classifiers + `getErrorMessage` mapping |
| `src/lib/permissions.test.ts` | Effective-permission model |
| `src/lib/utils.test.ts` | Format/parse helpers |
| `src/lib/compressProductImage.test.ts` | Image compression branches |
| `src/lib/productImageStorage.test.ts` | Storage path helper |
| `src/lib/productImagePhoneUpload.test.ts` | Phone-upload helper |
| `src/features/pos/cartStock.test.ts` | Stock guards + clamp |
| `src/features/pos/barcodeLookup.test.ts` | Barcode→SKU fallback + parity with label printer |
| `src/features/suppliers/debt.test.ts` | Debt math (debt starts on RECEIVED only) |
| `src/features/suppliers/actions.test.ts` | `getPurchaseOrderActionState(po, user)` matrix |
| `src/features/inventory/selectors.test.ts` | Per-shop stock isolation + composite PK |
| `src/features/categories/categoryIcons.test.ts` | Icon resolver |
| `src/features/categories/categoryUsage.test.ts` | Safe-delete block message |
| `src/features/barcodes/labels.test.ts` | `getPrintableBarcodeValue` precedence |
| `src/features/barcodes/labelTemplates.test.ts` | Template registry |
| `src/features/pricing/priceTierForm.test.ts` | Validation rules |
| `src/features/suppliers/phoneUploadSession.test.ts` (under productImages) | Session lifecycle |
| `src/components/products/productPickerUtils.test.ts` | ProductPicker search |
| `src/components/barcodes/BarcodePrintSheet.test.tsx` | Print sheet structure |

> No React Testing Library / DOM tests yet. Modal-behavior assertions
> ("modal stays open on failure", "double-click disabled") live in the
> manual QA checklists below.

## Live Supabase RLS / RPC Verification

Run against a real Supabase project after applying migrations
`001`–`019`. Full checklist:
[`archive/29-live-supabase-rls-rpc-verification.md`](./archive/29-live-supabase-rls-rpc-verification.md).
Key sections to verify:

- **Identity mapping.** Every active `users` row has `auth_id`. Every
  non-admin user has `shop_id`.
- **RPC happy paths.** POS checkout, refund + void approvals, purchase
  receiving, stock transfer completion, stock adjustment / damage, shift
  open + close, supplier payment.
- **RPC failure paths.** No open shift, insufficient stock, wrong shop,
  override without permission, non-zero variance without reason, supplier
  overpayment, payment on un-received PO.
- **Direct-write blocks.** `INSERT` / `UPDATE` / `DELETE` from the
  authenticated client against `sales`, `sale_items`, `inventory`,
  `inventory_movements`, `shifts`, `purchase_orders`, `purchase_order_items`,
  `supplier_payments`, `stock_transfers`, `stock_transfer_items`,
  `refund_void_requests`, `reprint_logs`, `audit_logs` all must fail.
- **Shop-scoped reads.** Manager from Shop A sees no Shop B data anywhere.
  Cashier sees own-shift sales only.

Permission-gated SELECT RLS specifics:
[`archive/30-rls-permission-gating-checklist.md`](./archive/30-rls-permission-gating-checklist.md).

Per-RPC scripts (archived but still useful):
- `archive/22-script-3a-checkout-rpc-tests.md` — `complete_sale`
- `archive/23-script-3b-refund-void-rpc-tests.md` — refund/void
- `archive/24-script-3c-receive-purchase-order-rpc-tests.md` — receiving
- `archive/24-script-3f-shift-rpc-tests.md` — shift open/close
- `archive/25-script-3d-complete-stock-transfer-rpc-tests.md` — transfers
- `archive/26-script-3e-adjust-stock-rpc-tests.md` — adjust/damage
- `archive/27-script-4a-rls-lockdown-tests.md` — write lockdown
- `archive/28-script-4b-shop-scoped-reads-tests.md` — shop-scoped reads
- `archive/33-supplier-debt-payment-rpc-tests.md` — supplier payments

## Role-Based QA

For each role (ADMIN, MANAGER, CASHIER, BUYER):

- [ ] Sidebar shows only the expected nav entries.
- [ ] Hitting a forbidden route by URL bounces / redirects.
- [ ] Action buttons that require missing permissions are hidden (not
      disabled-but-visible).
- [ ] RPCs reject any action the UI would have hidden, with a friendly
      mapped error message in the toast.

## POS Smoke Test

- [ ] Cashier scans an existing barcode → product added, toast "Added X".
- [ ] Cashier scans a label printed from SKU only → still adds.
- [ ] Cashier scans an unknown code → "Barcode not found".
- [ ] Out-of-stock product → "Only 0 in stock for this shop."
- [ ] Cashier without open shift → checkout disabled with helper.
- [ ] Pay = total → confirm enabled; payment succeeds; receipt opens at
      `/app/sales/:saleId`.
- [ ] Reprint button writes one `reprint_logs` row even on double-click.
- [ ] Cashier opens another cashier's sale URL → "Receipt not found"
      (RLS hides it).

## Supplier & Payment QA

Full coverage: [`archive/35-supplier-workflow-qa-checklist.md`](./archive/35-supplier-workflow-qa-checklist.md).
Highlights:

- [ ] Row click + "View details" both navigate to
      `/app/suppliers/:supplierId`. Row Action buttons stop propagation.
- [ ] Unknown supplier id shows the friendly "Supplier not found" card.
- [ ] DRAFT PO shows Approve (admin) or "Needs approval" hint.
- [ ] APPROVED PO shows Receive (admin / manager) or "Needs receiving".
- [ ] RECEIVED unpaid PO shows Record payment (admin / manager) or
      "Needs payment".
- [ ] RECEIVED paid PO is terminal; no action button.
- [ ] CANCELED PO is terminal; no Cancel button.
- [ ] Payment > outstanding balance → submit disabled, inline error.
- [ ] BUYER sees Create PO + Cancel-PO; no Receive / Pay buttons.
- [ ] CASHIER does not see the Suppliers menu at all.

## Barcode + Print QA

Full coverage: [`archive/18-printing.md`](./archive/18-printing.md) test
checklist. Highlights:

- [ ] Print on `/app/sales/:saleId` outputs only the 80 mm receipt — no
      sidebar, page header, or modals.
- [ ] Reprint logs exactly one `reprint_logs` row per click; double-clicks
      do not duplicate.
- [ ] `/app/barcode-labels` route is blocked for cashier/buyer.
- [ ] Compact / Standard / Price / Large templates each preview and
      print at the matching size.
- [ ] Quantity below 1 or above 200 is clamped to 1–200.
- [ ] Product without barcode rows but with SKU prints with `Using SKU as
      barcode`; product with neither shows the inline "no barcode
      available" state.
- [ ] Scan the printed label back at POS → adds the product.

## Responsive QA

Full coverage: [`archive/32-responsive-testing-checklist.md`](./archive/32-responsive-testing-checklist.md).
Quick spot-checks at the three target sizes:

- [ ] **1024 × 768** — sidebar 220 px; POS product grid 2 cols; cart 320 px;
      Supplier Detail page tabs render without horizontal scroll.
- [ ] **1366 × 768** — sidebar 270 px; POS grid 3 cols; payment modal
      breakdown wraps cleanly.
- [ ] **1920 × 1080** — sidebar 270 px; POS grid 4 cols; Supplier Detail
      summary cards on one row.
- [ ] Viewport < 768 px renders `SmallScreenGuard` instead of the app.

## Error Handling QA

Full coverage: [`archive/34-error-handling-qa-checklist.md`](./archive/34-error-handling-qa-checklist.md).
Critical scenarios:

- [ ] **Offline app load** — `loadData` shows "Couldn't load your data" +
      Retry button. After re-enabling the network, Retry succeeds.
- [ ] **RLS denial on bootstrap** — retry screen shows the friendly
      "You do not have permission to perform this action." (not a blank
      app).
- [ ] **Expired session** — friendly "Your session expired. Please log in
      again." toast; route guard bounces to login on next protected
      navigation.
- [ ] **Modal save failure** (any of: product, category, supplier, PO,
      payment, shift close, supplier payment) — modal stays open, form
      values preserved, save button re-enables, friendly toast.
- [ ] **Double-submit prevention** — clicking Save / Confirm / Record
      twice fast triggers only one request.
- [ ] **Render-time crash** — the top-level ErrorBoundary shows
      "Something went wrong" with Try again / Reload. Stack trace visible
      only in dev.

## Recommended Playwright Smoke Tests

Not yet implemented. Recommended coverage when the harness lands:

| Suite | Scenarios |
| --- | --- |
| Auth | First-admin bootstrap; normal login; expired session bounce. |
| POS | Scan + checkout (CASH and OTHER); Print + Reprint logs once; cashier blocked without open shift; out-of-stock blocked. |
| Shifts | Open + close with zero variance; close with non-zero variance requires reason. |
| Purchasing | Create PO → approve → receive → record payment (PARTIAL then full); supplier debt updates after each step. |
| Transfers | Create + approve + complete; insufficient source stock blocked. |
| Refund/Void | Cashier requests refund + void; manager approves; inventory restock visible. |
| Roles | Cashier cannot reach `/app/suppliers/*`; manager cannot approve a PO; buyer cannot record a payment. |
| Errors | Network drop during `loadData` shows Retry; failed payment keeps cart intact. |
