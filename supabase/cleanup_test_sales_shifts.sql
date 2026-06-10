-- ============================================================
-- ONE-OFF cleanup: wipe test SALES + SHIFT data, keep everything else.
--
-- KEEPS: shops, users, products, product_units, product_unit_prices,
--        categories, brands, suppliers, purchase orders, inventory rows.
-- REMOVES: sales, sale_items, reprint_logs, refund/void requests, shifts,
--          and (optionally) their stock-movement + audit-log traces.
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- It is wrapped in a transaction: review the row counts printed at the
-- end, and if anything looks wrong, run `ROLLBACK;` before it commits.
--
-- ⚠️ INVENTORY NOTE: deleting sales does NOT add the sold stock back.
-- `inventory.qty_base_units` keeps whatever value testing left it at.
-- Re-adjust stock manually (Inventory → Adjust stock) afterwards if the
-- on-hand numbers are wrong. (See the optional reset block at the bottom.)
--
-- This is a DESTRUCTIVE, irreversible delete. Make sure it's only test data.
-- ============================================================

BEGIN;

-- 1. Receipt reprint logs — FK to sales(id) with NO cascade, so first.
DELETE FROM reprint_logs;

-- 2. Refund / void requests raised against sales.
DELETE FROM refund_void_requests;

-- 3. Sale line items (explicit; also cascades from the sales delete below).
DELETE FROM sale_items;

-- 4. The sales themselves.
DELETE FROM sales;

-- 5. Shift sessions (Shift Records).
DELETE FROM shifts;

-- 6. OPTIONAL — remove the stock-movement ledger rows created by sales,
--    so the Inventory → Movements history doesn't reference deleted sales.
--    Keeps PURCHASE_IN / ADJUSTMENT / TRANSFER / DAMAGE movements intact.
DELETE FROM inventory_movements WHERE reference_type = 'sale';

-- 7. OPTIONAL — remove sale/shift audit-log entries.
DELETE FROM audit_logs WHERE entity_type IN ('Sale', 'Shift');

-- Verify what's left before committing.
SELECT 'sales' AS table, count(*) FROM sales
UNION ALL SELECT 'sale_items', count(*) FROM sale_items
UNION ALL SELECT 'reprint_logs', count(*) FROM reprint_logs
UNION ALL SELECT 'refund_void_requests', count(*) FROM refund_void_requests
UNION ALL SELECT 'shifts', count(*) FROM shifts
UNION ALL SELECT 'products (kept)', count(*) FROM products
UNION ALL SELECT 'inventory (kept)', count(*) FROM inventory
UNION ALL SELECT 'users (kept)', count(*) FROM users
UNION ALL SELECT 'shops (kept)', count(*) FROM shops;

COMMIT;
-- If the counts look wrong, run ROLLBACK; instead of letting COMMIT run.

-- ============================================================
-- OPTIONAL: also reset on-hand stock to a clean number.
-- Only run this if you want to zero (or re-baseline) inventory after the
-- test mess. Example sets every row in one shop to 0 — edit as needed.
-- ============================================================
-- UPDATE inventory SET qty_base_units = 0 WHERE shop_id = '<your-shop-id>';
