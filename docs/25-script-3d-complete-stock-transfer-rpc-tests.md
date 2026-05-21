# Script 3D — Stock Transfer Completion RPC: Test Checklist

`complete_stock_transfer(p_transfer_id text)` — migration
`007_complete_stock_transfer_rpc.sql`.

These require a live Supabase database (RPC + auth context). Run them through
the app while signed in as the relevant user, or in the SQL Editor.

## Happy path
- [ ] Completing an `APPROVED` transfer succeeds and returns
      `stockTransfer`, `stockTransferItems`, `inventory`, `movements`, `auditLogs`.
- [ ] Transfer status becomes `COMPLETED`; `completed_at` is set.
- [ ] Each `stock_transfer_items.transferred_qty` is recorded.
- [ ] **Source** inventory decreases by the transferred quantity per product.
- [ ] **Destination** inventory increases by the transferred quantity.
- [ ] A destination inventory row is **created** if the product was never
      stocked at the destination shop.
- [ ] Two movements per item: a `TRANSFER_OUT` (source) and a `TRANSFER_IN`
      (destination).
- [ ] `TRANSFER_OUT`: `qty_change` negative, `qty_after = qty_before − qty`.
- [ ] `TRANSFER_IN`: `qty_change` positive, `qty_after = qty_before + qty`.
- [ ] One `TRANSFER_COMPLETED` audit row is inserted.

## Authorization
- [ ] A user without `transfer:approve` is rejected.
- [ ] A user whose shop is neither the transfer's source shop (nor ADMIN) is
      rejected (`app_can_for_shop` on the source shop).
- [ ] An ADMIN can complete a transfer for any shop.

## Status / input guards
- [ ] A `PENDING` transfer is rejected ("not in a completable status").
- [ ] An already `COMPLETED` transfer is rejected.
- [ ] A `CANCELED` / `REJECTED` transfer is rejected.
- [ ] A non-existent transfer id is rejected.
- [ ] A transfer whose source and destination shop are the same is rejected.

## Stock guard
- [ ] Insufficient **source** stock for any item is rejected
      ("Insufficient stock … at the source shop").
- [ ] A product with no inventory row at the source shop is rejected.

## Atomicity / rollback
- [ ] If any item fails (e.g. insufficient stock on the 2nd item), the **whole**
      transaction rolls back: transfer status, `transferred_qty`, both shops'
      inventory, all movements and the audit row are left unchanged.

## Frontend behavior
- [ ] On RPC success the Transfers page reconciles transfer, items, inventory,
      movements and audit logs from the RPC result.
- [ ] On RPC failure local state is **unchanged** and an error alert is shown.
- [ ] No fire-and-forget transfer-completion writes remain in `transferSlice`.

