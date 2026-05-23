# Refund & Void Flow

## Request vs approve
- Cashier can request a void or partial refund from the receipt screen.
- Manager/Admin can approve and execute.

## Inventory impact
- VOID: all sale items are returned to stock.
- PARTIAL: selected items return to stock based on qty.

## Status changes
- Sale status changes to `VOID` or `REFUNDED` after approval.
- Request state is stored in `refund_void_requests` with status `APPROVED`.

## Transactional safety
- Approval runs through the `approve_refund_request` / `approve_void_request`
  RPCs (rejection through `reject_refund_void_request`). Each is a single atomic,
  permission-checked transaction — the request status, sale status, inventory
  restock, movements, and audit row commit or roll back together.


