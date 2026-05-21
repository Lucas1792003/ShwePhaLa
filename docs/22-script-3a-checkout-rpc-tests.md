# Script 3A Checkout RPC Test Checklist

Run after applying `supabase/migrations/004_complete_sale_rpc.sql`.

## Happy Path

- Sign in as an active user with `pos:create_sale` for the selected shop.
- Start a shift for that same cashier and shop.
- Add one in-stock item to POS.
- Complete checkout.
- Confirm the cart clears only after checkout succeeds.
- Confirm the receipt page opens only after checkout succeeds.
- Confirm `sales`, `sale_items`, `inventory`, `inventory_movements`, and `audit_logs` all contain the expected rows.
- Confirm the movement has `qty_before`, negative `qty_change`, and `qty_after` matching the inventory deduction.

## Failure Cases

- Try checkout without an open shift. Expected: RPC fails with `No open shift for this cashier and shop`; cart remains intact.
- Try checkout as a cashier assigned to another shop. Expected: RPC fails with `You are not permitted to create sales in this shop`; cart remains intact.
- Try checkout with insufficient stock and no `pos:override_stock`. Expected: RPC fails with `Insufficient stock`; no sale/items/inventory/movement/audit rows are committed.
- Try checkout with a price override and no `pos:override_price`. Expected: RPC fails with `You are not permitted to override prices`; no rows are committed.
- Try calling the RPC directly with a lower `unit_price_mmk` but `price_overridden: false`. Expected: RPC still treats it as a price override and rejects without `pos:override_price`.
- Try checkout with a missing inventory row. Expected: RPC fails with `Inventory row not found`; no rows are committed.

## Override Cases

- Grant `pos:override_stock` to the cashier or test manager.
- Complete a sale that sends stock below zero.
- Confirm the sale succeeds.
- Confirm `sale_items.stock_override_by` is set.
- Confirm a `STOCK_OVERRIDE` audit log exists for the sale.
- Grant `pos:override_price`, perform a manual price override, and confirm a `PRICE_OVERRIDE` audit log exists.

## Rollback Probe

- In a transaction or throwaway database, force an error after sale insert conditions are met, for example by temporarily adding a failing constraint on `inventory_movements.reason`.
- Run checkout.
- Confirm no partial rows remain in `sales`, `sale_items`, `inventory_movements`, or `audit_logs`, and inventory quantity is unchanged.

