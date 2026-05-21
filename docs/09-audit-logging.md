# Audit Logging

Audit rows are stored in the Supabase `audit_logs` table and mapped to
`auditLogs` in Zustand.

## What Is Logged

- Sale completed
- Price override
- Stock override
- Refund/void requested, approved, rejected
- Purchase order created, approved, canceled, received
- Stock transfer created, approved, rejected, canceled, completed
- Manual stock adjustment and damage write-off
- Shift opened and closed
- Receipt reprint
- Selected admin/reference events through `log_audit_event`

## Write Path

Direct authenticated writes to `audit_logs` are locked down by migration `013`.
Audit rows are written inside SECURITY DEFINER RPCs:

- workflow RPCs write their own audit rows transactionally
- `log_receipt_reprint` writes reprint audit rows
- `log_audit_event` records admin/reference audit events while forcing
  `actor_id` to the authenticated app user

## Read Policy

- Admin users can read all audit logs.
- Shop users can read their shop logs only when they have `audit:view_shop`.
- Other users cannot read operational audit rows.

