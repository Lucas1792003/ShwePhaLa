# Shift Flow

## Start shift
- Cashier enters opening cash.
- `open_shift` RPC (`009_shift_rpc.sql`) writes `opening_cash_mmk` and
  `started_at`. `expected_cash_mmk`, `closing_cash_mmk` and `variance_mmk`
  remain `NULL` until the shift is closed.
- A shift is required for POS checkout (`complete_sale` rejects a missing or
  closed shift).

## End shift
- Cashier enters closing cash.
- `close_shift` RPC recomputes everything server-side:
  - `expected_cash = opening_cash + CASH sales (status<>VOID) - approved
    PARTIAL refunds against this shift's CASH sales`
  - `variance = closing_cash - expected_cash`
- A non-zero variance requires a written reason or the RPC rejects the close.

## Summary UI

Both the cashier card (`components/shifts/ShiftSummary.tsx`) and the manager
modal (`components/shifts/ShiftDetail.tsx`) render the **same two cards**.

Inputs are computed once per render by the shared helper
`buildShiftBreakdown(shift, shiftSales, refundRequests)` in
`features/shifts/service.ts`. The helper mirrors the `close_shift` formula
exactly, so the live preview converges with whatever the RPC will write at
close time. The cashier-page close handler also runs its variance prompt
against `breakdown.expectedCash` — there is one calculation site for both
display and close.

### Payment breakdown card
- Cash sales count + total (sum of `totalMmk` for NORMAL CASH sales)
- Other (non-cash) sales count + total
- Approved cash refunds (only shown when > 0; subtracted from expected cash)
- Voided sales count (only shown when > 0)
- Total sales count (NORMAL + VOID)

### Cash reconciliation card
- Opening cash
- Expected cash — live for open shifts (label reads `Expected cash (live)`),
  server-stored once the shift is closed
- Closing cash — `—` while open, real value once closed
- Variance — `—` while open, real value once closed
- A hint appears when an open shift has only non-cash sales:
  *"Non-cash sales don't increase expected cash. Closing cash should match
  opening cash."*

### Why the manager modal used to show "Expected cash: MMK 0" with sales > 0

`expected_cash_mmk` is only written by `close_shift`. The old `ShiftDetail`
read the column directly with `?? 0`, so an open shift always rendered zeros
for expected/closing/variance. The fix is purely UI: open shifts compute
expected cash live with the shared helper; closing cash and variance render
as `—` until the shift is actually closed.
