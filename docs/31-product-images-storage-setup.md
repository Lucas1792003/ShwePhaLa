# Product Images — Supabase Storage Setup

Product photos are uploaded to **Supabase Storage**, not stored as base64 in
the `products` table. The app compresses every image to **under 100 KB**
(`compressProductImage`), uploads the blob (`uploadProductImage`), and saves
only the **public URL** in `products.image_url`.

## Bucket

| Setting | Value |
|---|---|
| Bucket name | `product-images` |
| Public | **Yes** (thumbnails are not sensitive; public read keeps display trivial) |
| File size limit | 128 KB (defence-in-depth; the app caps images at 100 KB) |
| Allowed MIME types | `image/webp`, `image/jpeg` |

## Setup option A — SQL migration (recommended)

Run `supabase/migrations/016_product_images_storage.sql` in the **Supabase SQL
Editor** (it runs as a privileged role that can create the bucket and the
`storage.objects` policies). It is idempotent — safe to re-run.

The migration:
1. Creates/updates the public `product-images` bucket.
2. Adds four `storage.objects` policies scoped to `bucket_id = 'product-images'`:
   - **read** — `public` (anyone can load a thumbnail by URL);
   - **insert / update / delete** — `authenticated` users where
     `public.app_has_perm('product:create') OR public.app_has_perm('product:update')`.

This reuses the existing `app_has_perm()` helper (migration 003), so Storage
writes follow the **same RBAC** as the `products` table — only users who can
create/update products can upload/replace/delete product images. In practice
that is ADMIN (and MANAGER for updates), matching the `/app/admin/products`
route guard.

## Setup option B — Dashboard (if SQL policy creation is blocked)

Some environments reject `CREATE POLICY ON storage.objects` from migrations.
In that case, in the Supabase Dashboard:

1. **Storage → New bucket**: name `product-images`, **Public bucket = on**.
   Optionally set "Restrict file size" to ~128 KB and allowed MIME types to
   `image/webp, image/jpeg`.
2. **Storage → Policies → product-images → New policy**, create four:
   - `product_images_read` — operation **SELECT**, target roles `public`,
     `USING`: `bucket_id = 'product-images'`.
   - `product_images_insert` — operation **INSERT**, roles `authenticated`,
     `WITH CHECK`:
     `bucket_id = 'product-images' AND (public.app_has_perm('product:create') OR public.app_has_perm('product:update'))`.
   - `product_images_update` — operation **UPDATE**, roles `authenticated`,
     same expression in both `USING` and `WITH CHECK`.
   - `product_images_delete` — operation **DELETE**, roles `authenticated`,
     same expression in `USING`.

If `app_has_perm` cannot be referenced from the policy editor, the safest
practical fallback is to gate writes on `auth.role() = 'authenticated'` only
(any signed-in user can upload). That is weaker than the RBAC-aware policy but
still blocks anonymous writes; prefer option A.

## Upload flow

1. User picks a photo in the product create/edit modal (`ProductImageInput`).
2. `compressProductImage` resizes + compresses it to a WebP (or JPEG) blob
   `<= 100 KB`.
3. `uploadProductImage(productId, image)` uploads the blob to
   `products/<productId>/<timestamp>.<ext>` and returns the public URL.
4. The public URL is stored in `products.image_url` when the product is saved.
5. POS / product cards display it with a plain `<img src={imageUrl}>`.

The `<timestamp>` in the path means replacing an image always creates a fresh
object, so a changed image is never hidden by browser/CDN caching.

## Known follow-up — orphaned objects

Replacing or removing a product image uploads/clears the URL but **does not
delete the old Storage object** (deleting before the product row is saved
would risk a broken image if the modal is cancelled). Orphaned objects are
harmless but accumulate. Recommended cleanup later: a scheduled job that lists
`product-images` objects and deletes any whose URL is not referenced by a
`products.image_url`.
