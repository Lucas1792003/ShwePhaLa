# Script 3E — Inventory Adjustment RPC: Test Checklist

`adjust_stock(p_shop_id text, p_product_id text, p_adjustment_type text,
p_quantity_delta integer, p_reason text)` — migration `008_adjust_stock_rpc.sql`.

These require a live Supabase database (RPC + auth context). Run them through
the Inventory → Adjust Stock modal while signed in as the relevant user.

## Happy path
- [ ] A positive `ADJUSTMENT` (Add to stock) succeeds; inventory increases by
      the delta; returns `inventory`, `movement`, `auditLog`.
- [ ] A negative `ADJUSTMENT` (Remove from stock) succeeds; inventory decreases.
- [ ] A `DAMAGE` write-off succeeds; inventory decreases by the quantity.
- [ ] `PURCHASE_IN` (manual stock-in) and `RETURN_IN` (customer return) succeed
      and increase inventory.
- [ ] An inventory row is **created** for a product never stocked at that shop.
- [ ] The `inventory_movements` row: `qty_change` = signed delta,
      `qty_after = qty_before + delta`, `type` matches the adjustment type.
- [ ] One `STOCK_<TYPE>` audit row is inserted with the reason.

## Validation guards
- [ ] A blank / whitespace-only reason is rejected.
- [ ] A zero quantity change is rejected.
- [ ] An unsupported adjustment type is rejected.
- [ ] `DAMAGE` with a positive delta is rejected ("must reduce stock").
- [ ] `PURCHASE_IN` / `RETURN_IN` with a negative delta is rejected.
- [ ] A non-existent product is rejected.

## Authorization
- [ ] A user without `inventory:adjust` is rejected for ADJUSTMENT / stock-in.
- [ ] A user without `inventory:damage` is rejected for DAMAGE.
- [ ] A user whose shop differs from the target shop is rejected
      (`app_can_for_shop`).
- [ ] An ADMIN can adjust inventory for any shop.

## Negative stock
- [ ] An adjustment that would drive stock below zero is rejected when the user
      lacks `pos:override_stock`.
- [ ] The same adjustment **succeeds** for a user who holds `pos:override_stock`
      (ADMIN / MANAGER), and the negative level is recorded accurately.

## Atomicity / rollback
- [ ] If any step fails, the **whole** transaction rolls back — inventory, the
      movement and the audit row are all left unchanged.

## Frontend behavior
- [ ] On RPC success the Inventory page reconciles inventory, movements and
      audit logs from the RPC result, and the modal closes.
- [ ] On RPC failure local state is **unchanged**, an error alert is shown, and
      the modal stays open.
- [ ] No fire-and-forget adjustment writes remain in `inventorySlice`.

