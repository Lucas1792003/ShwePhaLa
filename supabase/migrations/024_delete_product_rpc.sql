-- ============================================================
-- Migration 024: Hard-delete product RPC
--
-- The Products admin UI exposes a "Delete" button that needs to
-- remove a product row outright. Direct client deletes are denied:
--   * `products` has no DELETE policy (migration 010 only created
--     SELECT/INSERT/UPDATE policies);
--   * `inventory` has INSERT/UPDATE/DELETE revoked from the
--     authenticated role (migration 010), so the inventory rows
--     that block the products delete via FK can't be cleared from
--     the client either.
--
-- This RPC runs SECURITY DEFINER, checks `product:delete` (already
-- granted to the ADMIN role in migration 014), then clears the
-- inventory rows and removes the product. `product_barcodes` and
-- `price_tiers` cascade-delete automatically.
--
-- Run AFTER 010-014. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION delete_product(
  p_product_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_user     users;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'No app user found for this auth identity';
  END IF;

  IF NOT app_has_perm('product:delete') THEN
    RAISE EXCEPTION 'You are not permitted to delete products';
  END IF;

  -- Product must still exist; surface a clear error otherwise so
  -- the UI doesn't show a generic RLS denial.
  PERFORM 1 FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found: %', p_product_id;
  END IF;

  -- Inventory rows must go first — the FK has no CASCADE.
  -- `inventory_movements` and `sale_items` reference product_id by
  -- value (no FK) and are left in place as historical ledger data.
  DELETE FROM inventory WHERE product_id = p_product_id;

  -- Now the product itself. product_barcodes and price_tiers
  -- cascade-delete via their own FKs.
  DELETE FROM products WHERE id = p_product_id;

  RETURN jsonb_build_object('productId', p_product_id);
END;
$$;

REVOKE ALL ON FUNCTION delete_product(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_product(text) TO authenticated;
