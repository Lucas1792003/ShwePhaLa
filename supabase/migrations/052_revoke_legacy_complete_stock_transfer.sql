-- ============================================================
-- Migration 052: Revoke legacy complete_stock_transfer
--
-- Flagged in docs/09-roadmap-todo.md: migration 038 replaced the one-step
-- complete_stock_transfer with the two-step dispatch_stock_transfer ->
-- receive_stock_transfer maker-checker flow, but left the old function's
-- EXECUTE grant to `authenticated` in place (038's own comment says it was
-- "left in place but unused by the client" — the client stopped calling
-- it, but nothing stopped a direct RPC call from bypassing the
-- maker-checker split it was meant to replace).
-- Run AFTER 001-051.
-- ============================================================

REVOKE EXECUTE ON FUNCTION complete_stock_transfer(text) FROM authenticated;
