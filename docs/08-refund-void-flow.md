# Refund & Void Flow

## Request vs approve
- Cashier can request a void or partial refund from the receipt screen.
- Manager/Admin can approve and execute.

## Inventory impact
- VOID: all sale items are returned to stock.
- PARTIAL: selected items return to stock based on qty.

## Status changes
- Sale status changes to `VOID` or `REFUNDED` after approval.
- Refund record is stored with status `APPROVED`.
