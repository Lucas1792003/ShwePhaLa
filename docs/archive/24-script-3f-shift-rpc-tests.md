# Script 3F Shift RPC Test Checklist

Run after applying `supabase/migrations/009_shift_rpc.sql`.

## Open Shift

- Sign in as an active cashier with `shift:manage_own` for the selected shop.
- Open a shift with non-negative opening cash.
- Confirm the created shift appears in the app with `endedAt` empty.
- Confirm a `SHIFT_OPENED` audit log exists.
- Try opening with negative opening cash. Expected: rejected; frontend state unchanged.
- Try opening as a user without shift permission. Expected: rejected; frontend state unchanged.
- Try opening for the wrong shop. Expected: rejected; frontend state unchanged.
- Try opening a second shift for the same cashier/shop. Expected: rejected by RPC or unique index.
- Try opening another shift for the same cashier in another shop. Expected: rejected by global open-shift check.

## Close Shift

- Close the cashier's own open shift with matching counted cash.
- Confirm `endedAt`, `closingCashMmk`, `expectedCashMmk`, and `varianceMmk` are updated from the RPC result.
- Confirm expected cash is computed server-side as opening cash + committed cash sales - approved cash partial refunds.
- Confirm voided cash sales do not count toward expected cash.
- Confirm a `SHIFT_CLOSED` audit log exists.
- Close with non-zero variance and provide a reason. Expected: succeeds and saves `varianceReason`.
- Close with non-zero variance and no reason. Expected: rejected; frontend state unchanged.
- Try closing an already closed shift. Expected: rejected.
- Try closing with negative closing cash. Expected: rejected.
- If business rules allow, sign in as manager/admin and close an accessible shop shift. Expected: succeeds.
- Try manager/admin closing a wrong-shop shift. Expected: rejected.

## Rollback Probe

- In a throwaway database, force an audit insert failure during close.
- Confirm the shift row remains open and unchanged after the RPC error.


