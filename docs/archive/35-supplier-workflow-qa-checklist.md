# Supplier Workflow QA Checklist

Manual scenarios for the end-to-end supplier workspace:
Supplier → Purchase Order → Receive → Inventory + Debt → Payment.

The supplier debt rule stays unchanged: debt starts only when a PO is RECEIVED.
The Suppliers page drawer is the supplier account workspace; the Purchases
page is the cross-supplier PO list. Both pages call the same store actions
(`createPurchaseOrder`, `approvePurchaseOrder`, `receivePurchaseOrder`,
`cancelPurchaseOrder`, `recordSupplierPayment`) which call the same RPCs.

## Navigation

The supplier detail workspace is now a full route at
`/app/suppliers/:supplierId`. The old side drawer is removed.

- [ ] **Click a supplier row** on `/app/suppliers` → navigates to
      `/app/suppliers/<id>`. "View details" button in the row Actions cell
      also navigates. Row keyboard activation (Enter / Space) navigates.
- [ ] **Action buttons in the row** (Edit, Deactivate) do NOT navigate —
      they stop propagation so the row click does not fire.
- [ ] **Detail page Back button** and the breadcrumb "Suppliers" link both
      return to `/app/suppliers` without losing search state? (Search state
      is local to the list page and resets — acceptable.)
- [ ] **Direct URL.** Pasting `/app/suppliers/<id>` into a fresh tab loads
      the detail page (after login + RequireRole(`supplier:read`) check).
- [ ] **Unknown supplier id.** `/app/suppliers/does-not-exist` shows the
      "Supplier not found or you do not have access." card with a working
      Back to Suppliers button — does not crash.
- [ ] **RLS-hidden supplier.** If a manager opens a URL for a supplier whose
      only POs/payments live in another shop, the page still loads (the
      `suppliers` row itself is globally readable per current RLS) but the
      financial summary and PO/payment tabs render zeros / empty states. If
      the supplier row itself is hidden by future RLS, the same "not found"
      state covers it.

## Supplier state coverage

For each scenario, open the supplier via `/app/suppliers/:supplierId` and
confirm the page renders correctly. Switch between the **Overview**,
**Purchase Orders**, and **Payments** tabs as relevant.

- [ ] **Supplier with no POs.** Drawer shows profile + zeroed financial summary
      + "No purchase records for this supplier yet." Create-PO header button
      visible to users with `purchase:create` for the current shop.
- [ ] **Supplier with a DRAFT PO.** PO card shows DRAFT badge + "Not received"
      + UNPAID. Action area: Approve (admin) or "Needs approval" hint (others).
      Cancel-PO button visible to anyone with `purchase:create`.
- [ ] **Supplier with an APPROVED PO.** Action area: Receive (admin / manager
      for that shop) or "Needs receiving" hint. Cancel-PO still visible.
- [ ] **Supplier with a RECEIVED unpaid PO.** Receiving confirmation section
      populates with received qty, received by, received at, supplier invoice,
      delivery note. Action area: Record payment (admin / manager for that
      shop) or "Needs payment" hint (BUYER). Cancel-PO is NOT visible
      (received POs are non-cancelable).
- [ ] **Supplier with a PARTIAL payment.** Payment status badge = PARTIAL,
      balance > 0, payment history shows the prior partial payment, Record
      payment still available with quick-fill set to remaining balance.
- [ ] **Supplier with a fully PAID PO.** Status = RECEIVED, payment = PAID,
      no action button — terminal.
- [ ] **Supplier with a CANCELED PO.** Status = CANCELED, no actions, no
      cancel button.
- [ ] **Mixed supplier with several POs.** Click a PO card → receiving
      confirmation refreshes to that PO. The first-PO default still works.

## Actions from supplier detail

- [ ] **Create PO from supplier detail.** Header button opens the modal with
      the supplier pre-selected and not changeable. After success, the new PO
      appears at the top of the supplier's PO list and becomes the selected PO.
- [ ] **Approve PO from supplier detail.** Button shows on DRAFT/SUBMITTED PO,
      ADMIN only by default. Clicking flips status to APPROVED, "Needs
      approval" hint disappears, Receive button takes its place for users
      with `purchase:receive`.
- [ ] **Receive PO from supplier detail.** Button shows on APPROVED PO. Modal
      opens with each line's received qty defaulted to ordered qty (cashier-
      friendly), allows partial receiving. After success, PO moves to RECEIVED,
      inventory and supplier debt update, receiving confirmation populates.
- [ ] **Cancel PO from supplier detail.** Confirmation dialog appears. Cannot
      cancel RECEIVED or CANCELED POs (button hidden).
- [ ] **Record payment from supplier detail.** Amount input defaults to 0;
      "Pay outstanding" button quick-fills the balance. Outstanding balance
      is shown below the amount field. Disabled when amount ≤ 0 or > balance.

## Permission matrix

For each row, sign in as the listed role and verify the listed behavior.

| Role     | View suppliers | Create PO | Approve PO | Receive PO | Record payment |
|----------|----------------|-----------|------------|------------|----------------|
| ADMIN    | yes (all)      | yes       | yes        | yes        | yes            |
| MANAGER  | yes (own shop) | yes       | NO (hint)  | yes        | yes            |
| BUYER    | yes (own shop) | yes       | NO (hint)  | NO         | NO (hint)      |
| CASHIER  | NO (no menu)   | NO        | NO         | NO         | NO             |

- [ ] **ADMIN** can act on a PO in any shop.
- [ ] **MANAGER on shop A** sees POs only for shop A; receive/pay buttons
      hidden for any PO from a different shop (RPC also enforces).
- [ ] **MANAGER** sees "Needs approval" hint on DRAFT POs — no Approve button.
- [ ] **BUYER** sees Create PO + Cancel-PO buttons; sees no Receive or
      Record-payment buttons — replaced with the relevant hint badge.
- [ ] **CASHIER** does not see the Suppliers menu in the sidebar at all.

## Error / failure paths

All error paths must keep the modal open with form values preserved and show
a clear, friendly message (no Postgres dumps).

- [ ] **Payment over balance.** Set amount > outstanding balance → button
      disabled, inline message "Amount must be between MMK 1 and …".
- [ ] **Payment on unreceived PO.** Cannot happen via the UI (button only
      visible on RECEIVED with balance > 0). RPC also rejects if called
      directly.
- [ ] **Manager wrong-shop receive (simulated).** The RPC rejects; UI shows
      a toast with `getErrorMessage`'s friendly mapping (typically
      "You do not have permission to perform this action.").
- [ ] **Duplicate supplier code on create.** Modal stays open, inline error
      reads "This record already exists.", values preserved.
- [ ] **Network failure mid-action.** Action shows loading state ("Approving…",
      "Receiving…", "Recording…"), then surfaces the friendly network error.
      No optimistic state change is applied.
- [ ] **Double-click action buttons.** Per-PO Approve/Cancel buttons disable
      while one is in flight via `busyPoId`; modal Save/Record buttons
      disable while submitting.

## Layout and accessibility

- [ ] **Full-page layout** at 1024 × 768, 1366 × 768, and 1920 × 1080. Header
      (Back / Edit / Create PO), summary card grid, and tab strip all sit
      within the page card with no horizontal scrollbars in the page body.
      The expanded PO detail table is the only place a horizontal scrollbar
      may appear (line items), and only at very narrow widths.
- [ ] **Status badges** legible on RECEIVED + partial-receiving rows
      (status, received, payment, plus next-step hint when relevant).
- [ ] **Cards over tables** for the PO list (responsive at 1024).
- [ ] **Empty states.** "No purchase records for this supplier yet." (with
      a "Create purchase order" CTA when allowed) and "No supplier payments
      recorded yet." render instead of empty tables.
- [ ] **Money formatting.** All amounts use `formatMmk` (e.g. `MMK 12,345`).
- [ ] **Tabs are sticky to the page card.** Switching tabs preserves the
      expanded-PO selection.

## Reconciliation

- [ ] **Receive then check inventory.** Receiving a PO increases the
      inventory rows shown in /app/inventory by the received qty for the
      target shop. Stock movements page shows the corresponding PURCHASE row.
- [ ] **Receive then check supplier summary.** "Received purchases" and
      "Outstanding debt" cards both rise by the PO total. "Paid" stays the
      same until a payment is recorded.
- [ ] **Record payment then check supplier summary.** "Paid" rises, "Outstanding
      debt" falls, payment status badge transitions UNPAID → PARTIAL → PAID.
- [ ] **Cancel a DRAFT PO.** Removes it from the active PO list; debt and
      inventory unaffected.

## Reference: workflow rules enforced

| Rule | Where enforced |
|------|----------------|
| Supplier debt starts only on RECEIVED PO | `getPurchaseOrderBalanceMmk` in `features/suppliers/debt.ts`; `record_supplier_payment` RPC re-checks status |
| Cannot pay an unreceived PO | UI: button only shown when `nextAction === "pay"`; RPC enforces |
| Cannot exceed outstanding balance | UI: disabled when `amount > balance`; RPC re-checks |
| Cannot cancel a RECEIVED PO | UI: `canCancel` is false for RECEIVED; RPC enforces |
| Manager shop scope | `hasShopPermission(user, perm, po.shopId)` everywhere; RLS re-checks on RPC |
| Approval stays ADMIN by default | `DEFAULT_ROLE_PERMISSIONS` registry — MANAGER lacks `purchase:approve` |
