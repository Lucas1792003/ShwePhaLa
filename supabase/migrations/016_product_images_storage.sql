-- ============================================================
-- Migration 016: product-images Supabase Storage bucket + policies
-- Product photos are uploaded to Supabase Storage (compressed to < 100 KB by
-- the app) and the product row stores only the public URL — base64 data URLs
-- are no longer written to products.image_url.
--
-- This migration ONLY touches Storage (the `storage` schema). No app table
-- RLS, RPC or operational flow is changed.
--
-- NOTE: `storage.buckets` rows and `storage.objects` policies are normally
-- created from the Supabase SQL Editor (which runs as a privileged role). If
-- `CREATE POLICY ON storage.objects` is rejected in your environment, use the
-- Dashboard steps in docs/31-product-images-storage-setup.md instead.
--
-- Run AFTER 001-015. Idempotent (ON CONFLICT + DROP POLICY IF EXISTS).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Public bucket. Product thumbnails are not sensitive; public read keeps
--    display trivial (the product row stores the public URL directly).
--    file_size_limit is a defence-in-depth ceiling above the app's 100 KB cap.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  131072,                                   -- 128 KB hard ceiling (app caps at 100 KB)
  ARRAY['image/webp', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
  SET public             = true,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ------------------------------------------------------------
-- 2. Policies on storage.objects for the product-images bucket.
--      Read  : public — anyone can load a product thumbnail by URL.
--      Write : authenticated users who can manage products. Reuses the
--              existing public.app_has_perm() helper from migration 003, so
--              Storage writes follow the same RBAC as the products table.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "product_images_read" ON storage.objects;
CREATE POLICY "product_images_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_insert" ON storage.objects;
CREATE POLICY "product_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (public.app_has_perm('product:create') OR public.app_has_perm('product:update'))
  );

DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (public.app_has_perm('product:create') OR public.app_has_perm('product:update'))
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (public.app_has_perm('product:create') OR public.app_has_perm('product:update'))
  );

DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;
CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (public.app_has_perm('product:create') OR public.app_has_perm('product:update'))
  );
