-- ============================================================
-- Migration 036: supplier ⇄ product catalog (many-to-many)
--
-- Records which products can be bought from which supplier. A product may have
-- several suppliers and a supplier many products. Managed from the product form
-- (so writes are gated on product permissions). Display-only on the supplier
-- detail page; used as a soft filter when creating a purchase order.
--
-- Mirrors the product_barcodes child-table RLS conventions (migration 010).
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_products (
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id  text NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, product_id)
);

CREATE INDEX IF NOT EXISTS supplier_products_product_idx ON supplier_products (product_id);

ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_products_sel" ON supplier_products;
DROP POLICY IF EXISTS "supplier_products_ins" ON supplier_products;
DROP POLICY IF EXISTS "supplier_products_del" ON supplier_products;

-- Catalog metadata, not shop-scoped — readable by any authenticated user
-- (same as suppliers / products / product_barcodes SELECT).
CREATE POLICY "supplier_products_sel" ON supplier_products FOR SELECT TO authenticated
  USING (true);

-- The link is managed from the product form: creating a product needs
-- product:create (ADMIN), editing needs product:update (ADMIN/MANAGER). Allow
-- either so the delete-then-insert reconcile works on both paths.
CREATE POLICY "supplier_products_ins" ON supplier_products FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('product:create') OR app_has_perm('product:update'));
CREATE POLICY "supplier_products_del" ON supplier_products FOR DELETE TO authenticated
  USING (app_has_perm('product:create') OR app_has_perm('product:update'));

GRANT SELECT, INSERT, DELETE ON supplier_products TO authenticated;
REVOKE UPDATE ON supplier_products FROM authenticated;
