# Script 3B Refund / Void RPC Test Checklist

Run after applying `supabase/migrations/005_refund_void_rpc.sql`.

## Refund Approval

- Create a normal sale.
- Create a partial refund request for one sale item.
- Approve as a user with `pos:refund` in the sale shop.
- Confirm request status becomes `APPROVED`.
- Confirm sale status becomes `REFUNDED`.
- Confirm inventory increases by the refunded quantity.
- Confirm `inventory_movements` has `RETURN_IN` with correct `qty_before`, `qty_change`, and `qty_after`.
- Confirm a `REFUND` audit row exists.
- Try approving the same request again. Expected: rejected because the request is not pending.
- Try refunding more than the original item quantity. Expected: rejected.
- Try a second refund that would push cumulative refunded quantity over the original sale quantity. Expected: rejected.
- Try a direct RPC call with refund amount greater than the sale item line total. Expected: rejected.

## Void Approval

- Create a normal sale.
- Create a void request.
- Approve as a user with `pos:void_sale` in the sale shop.
- Confirm request status becomes `APPROVED`.
- Confirm sale status becomes `VOID`.
- Confirm inventory is restored for every sale item.
- Confirm each movement has correct before/after quantities.
- Confirm a `VOID_SALE` audit row exists.
- Try approving the same void request again. Expected: rejected because the request is not pending.
- Try voiding an already voided or refunded sale. Expected: rejected.

## Authorization

- Try refund approval without `pos:refund`. Expected: rejected and frontend state remains unchanged.
- Try void approval without `pos:void_sale`. Expected: rejected and frontend state remains unchanged.
- Try approving a request for a shop outside the approver's scope. Expected: rejected and frontend state remains unchanged.

## Rollback Probe

- In a throwaway database, force an error after the request is locked, for example by temporarily adding a failing constraint on `inventory_movements.reason`.
- Approve a refund or void request.
- Confirm request status, sale status, inventory, movements, and audit logs all roll back together.

## Frontend

- Approval buttons await RPC success.
- On RPC failure, an error toast is shown.
- Request, sale, inventory, movement, and audit state do not change on RPC failure.
- On RPC success, local state reconciles from the RPC response.


