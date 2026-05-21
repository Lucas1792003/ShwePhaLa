# Script 3C — Purchase Receiving RPC: Test Checklist

`receive_purchase_order(p_purchase_order_id text, p_received_items jsonb default null)`
— migration `006_receive_purchase_order_rpc.sql`.

These require a live Supabase database (RPC + auth context). Run them in the
SQL Editor or through the app while signed in as the relevant user.

## Happy path
- [ ] Receiving an `APPROVED` PO succeeds and returns
      `purchaseOrder`, `purchaseOrderItems`, `inventory`, `movements`, `auditLogs`.
- [ ] PO status becomes `RECEIVED`; `received_by` and `received_at` are set.
- [ ] Each `purchase_order_items.received_qty` is recorded.
- [ ] Inventory `qty_base_units` increases by the received quantity per product.
- [ ] An inventory row is **created** for a product never stocked at that shop.
- [ ] `inventory_movements` rows: `type = PURCHASE_IN`, `qty_change = received`,
      `qty_after = qty_before + received`.
- [ ] One `PO_RECEIVED` audit row is inserted.

## Partial receiving
- [ ] A line received below its ordered quantity is accepted; inventory rises by
      the received amount.
- [ ] A line received as `0` records `received_qty = 0` and creates **no**
      movement / inventory change.
- [ ] Receiving **more** than ordered is rejected.
- [ ] A negative received quantity is rejected.

## Authorization
- [ ] A user without `purchase:receive` is rejected.
- [ ] A user whose shop differs from the PO shop is rejected
      (`app_can_for_shop`).
- [ ] An ADMIN can receive a PO for any shop.

## Status guards
- [ ] An already `RECEIVED` PO is rejected ("not in a receivable status").
- [ ] A `CANCELED` PO is rejected.
- [ ] A `DRAFT` / `SUBMITTED` PO is rejected (must be approved first).
- [ ] A non-existent PO id is rejected.

## Atomicity / rollback
- [ ] If any step fails (e.g. a missing product), the **whole** transaction
      rolls back: PO status, `received_qty`, inventory, movements and the audit
      row are all left unchanged.

## Frontend behavior
- [ ] On RPC success the Purchases page reconciles PO, items, inventory,
      movements and audit logs from the RPC result.
- [ ] On RPC failure local state is **unchanged** and the receive modal stays
      open with an error alert.
- [ ] No fire-and-forget receiving writes remain in `purchaseSlice`.

