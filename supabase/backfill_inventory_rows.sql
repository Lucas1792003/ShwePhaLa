-- ============================================================
-- Backfill missing inventory rows.
--
-- Creates a qty-0 inventory row for every active product in every active
-- shop that doesn't already have one. Without a row, a product is "out of
-- stock" in POS (which defaults a missing row to 0) but is INVISIBLE to the
-- dashboard's all-shops Low Stock card (which only scans existing inventory
-- rows) — see docs/04-features-workflows.md → Low Stock / Inventory Alerts.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → Run. Then refresh the app.
--
-- SAFE: the NOT EXISTS guard only INSERTS missing rows. It never touches
-- existing rows or their quantities, and it's idempotent (re-running is a
-- no-op). New rows start at 0 — set real on-hand via Inventory → Adjust stock.
-- ============================================================

INSERT INTO inventory (shop_id, product_id, qty_base_units)
SELECT s.id, p.id, 0
FROM shops s
CROSS JOIN products p
WHERE p.is_active = true
  AND s.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM inventory i
    WHERE i.shop_id = s.id AND i.product_id = p.id
  );
