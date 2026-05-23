# Script 4E: Supplier Debt And Payment RPC Tests

This checklist verifies supplier debt tracking, supplier purchase records,
receiving confirmation, and supplier payment writes after migration
`018_supplier_debt_payments.sql`.

Run these against a live Supabase project with real authenticated users and RLS
enabled. Use the app UI where possible. For direct RPC calls, use an
authenticated non-service client so `auth.uid()`, `current_app_user()`, RLS, and
permission helpers are exercised.

## Migration Preflight

- [ ] Migration `018_supplier_debt_payments.sql` is applied.
- [ ] `supplier_payments` exists and RLS is enabled.
- [ ] `purchase_orders` has `paid_mmk`, `payment_status`,
      `supplier_invoice_no`, `delivery_note_no`, `received_by`, and
      `received_at`.
- [ ] `record_supplier_payment(...)` exists and is executable by
      `authenticated`.
- [ ] Direct table grants do not allow authenticated users to insert, update,
      delete, or upsert `supplier_payments`.

Useful SQL:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'supplier_payments';

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'purchase_orders'
  and column_name in (
    'paid_mmk',
    'payment_status',
    'supplier_invoice_no',
    'delivery_note_no',
    'received_by',
    'received_at'
  )
order by column_name;

select proname
from pg_proc
where proname = 'record_supplier_payment';
```

## Debt Calculation

- [ ] A created but unreceived PO does not add supplier debt.
- [ ] A canceled PO does not add supplier debt.
- [ ] A received unpaid PO appears with `payment_status = 'UNPAID'`,
      `paid_mmk = 0`, and balance equal to `total_mmk`.
- [ ] A partial payment changes `payment_status` to `PARTIAL`.
- [ ] A full payment changes `payment_status` to `PAID`.
- [ ] Supplier debt equals the sum of received PO balances:
      `sum(total_mmk - paid_mmk)` for `RECEIVED` POs only.

Useful SQL:

```sql
select
  supplier_id,
  sum(total_mmk) filter (where status = 'RECEIVED') as received_total_mmk,
  sum(paid_mmk) filter (where status = 'RECEIVED') as paid_mmk,
  sum(greatest(total_mmk - paid_mmk, 0)) filter (where status = 'RECEIVED') as debt_mmk
from purchase_orders
group by supplier_id;
```

## Payment RPC

RPC signature:

```sql
record_supplier_payment(
  p_purchase_order_id text,
  p_amount_mmk integer,
  p_payment_method text,
  p_reference_no text default null,
  p_notes text default null
) returns jsonb
```

Expected happy path:

- [ ] Authorized `ADMIN` can record a payment for a received PO.
- [ ] Authorized assigned-shop `MANAGER` can record a payment for a received PO
      in their shop.
- [ ] RPC returns the updated purchase order, payment row, and audit row.
- [ ] `supplier_payments` row is inserted with `supplier_id`,
      `purchase_order_id`, `shop_id`, `amount_mmk`, `payment_method`,
      `created_by`, and `paid_at`.
- [ ] `purchase_orders.paid_mmk` increases by the payment amount.
- [ ] `purchase_orders.payment_status` recalculates to `UNPAID`, `PARTIAL`, or
      `PAID`.
- [ ] A supplier payment audit row is written.

Expected rejected cases:

- [ ] Payment amount `<= 0` is rejected.
- [ ] Payment greater than outstanding balance is rejected.
- [ ] Payment against an unreceived PO is rejected.
- [ ] Payment against a canceled PO is rejected.
- [ ] Wrong-shop `MANAGER` is rejected.
- [ ] `BUYER` can view assigned-shop supplier purchase records by default but
      cannot record payment without an explicit permission grant.
- [ ] `CASHIER` cannot view supplier debt and cannot record payment.

## RLS And Direct Writes

Use an authenticated non-service Supabase client:

```ts
await supabase.from("supplier_payments").insert({ ... });
await supabase.from("supplier_payments").update({ amount_mmk: 1 }).eq("id", paymentId);
await supabase.from("supplier_payments").delete().eq("id", paymentId);
```

Expected:

- [ ] Direct insert/update/delete fails with a permission or RLS error.
- [ ] No payment row is created, changed, or deleted by direct table writes.
- [ ] `ADMIN` can read all supplier payments.
- [ ] Assigned-shop `MANAGER` can read only assigned-shop supplier payments.
- [ ] Assigned-shop `BUYER` can read supplier payment records only when their
      permissions allow supplier debt or purchase viewing.
- [ ] `CASHIER` cannot read supplier payments.

## Supplier Detail UI

- [ ] Supplier table shows total received purchases, paid amount, outstanding
      debt, and debt status.
- [ ] Supplier detail shows supplier info and financial summary.
- [ ] Purchase records table shows PO number, shop, status, received date,
      received by, total, paid, balance, and payment status.
- [ ] Received confirmation shows ordered items, ordered qty, received qty,
      received status, `received_at`, `received_by`, supplier invoice number,
      and delivery note number when present.
- [ ] Payment history shows date, PO, amount, method, reference, recorded by,
      and notes.
- [ ] `Record payment` appears only for received POs with a positive balance
      and a user allowed to create supplier payments.
- [ ] The payment modal validates amount `> 0` and `<= balance` before calling
      the RPC.
- [ ] Successful payment refreshes supplier debt, PO payment status, and
      payment history without changing POS, sales, inventory, or shift flows.
