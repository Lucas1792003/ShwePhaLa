# Product Images - Supabase Storage Setup

Product photos are uploaded to **Supabase Storage**, not stored as base64 in
the `products` table. The app compresses every image to **under 100 KB**
(`compressProductImage`), uploads the blob, and saves only the **public URL**
in `products.image_url`.

## Bucket

| Setting | Value |
|---|---|
| Bucket name | `product-images` |
| Public | **Yes** (thumbnails are not sensitive; public read keeps display simple) |
| File size limit | 128 KB (defense-in-depth; the app caps images at 100 KB) |
| Allowed MIME types | `image/webp`, `image/jpeg` |

## Setup option A - SQL migration (recommended)

Run `supabase/migrations/016_product_images_storage.sql` in the **Supabase SQL
Editor**. It is idempotent and safe to re-run.

The migration:

1. Creates/updates the public `product-images` bucket.
2. Adds four `storage.objects` policies scoped to `bucket_id = 'product-images'`:
   - read: `public` (anyone can load a thumbnail by URL);
   - insert/update/delete: `authenticated` users where
     `public.app_has_perm('product:create') OR public.app_has_perm('product:update')`.

This reuses the existing `app_has_perm()` helper, so Storage writes follow the
same RBAC as the `products` table. Only users who can create/update products can
upload, replace, or delete product images.

## Setup option B - Dashboard fallback

Some environments reject `CREATE POLICY ON storage.objects` from migrations.
In that case, in the Supabase Dashboard:

1. **Storage -> New bucket**: name `product-images`, **Public bucket = on**.
   Optionally set "Restrict file size" to about 128 KB and allowed MIME types
   to `image/webp, image/jpeg`.
2. **Storage -> Policies -> product-images -> New policy**, create four:
   - `product_images_read`: operation **SELECT**, target roles `public`,
     `USING`: `bucket_id = 'product-images'`.
   - `product_images_insert`: operation **INSERT**, roles `authenticated`,
     `WITH CHECK`:
     `bucket_id = 'product-images' AND (public.app_has_perm('product:create') OR public.app_has_perm('product:update'))`.
   - `product_images_update`: operation **UPDATE**, roles `authenticated`,
     same expression in both `USING` and `WITH CHECK`.
   - `product_images_delete`: operation **DELETE**, roles `authenticated`,
     same expression in `USING`.

If `app_has_perm` cannot be referenced from the policy editor, the safest
practical fallback is to gate writes on `auth.role() = 'authenticated'` only.
That is weaker than the RBAC-aware policy but still blocks anonymous writes;
prefer option A.

## Desktop upload flow

1. User picks a photo in the product create/edit modal (`ProductImageInput`).
2. `compressProductImage` resizes and compresses it to a WebP or JPEG blob
   `<= 100 KB`.
3. `uploadProductImage(productId, image)` uploads the blob to
   `products/<productId>/<timestamp>.<ext>` and returns the public URL.
4. The public URL is stored in `products.image_url` when the product is saved.
5. POS and product cards display it with a plain `<img src={imageUrl}>`.

The timestamp in the path means replacing an image always creates a fresh
object, so a changed image is never hidden by browser/CDN caching.

## Phone QR upload flow

The product form also supports a temporary QR-based phone upload flow:

1. Desktop user clicks **Upload from phone** in `ProductImageInput`.
2. The app calls `create_product_image_upload_session(...)`.
3. The desktop creates a signed upload token for the session storage path and
   stores that short-lived token through
   `attach_product_image_upload_session_token(...)`.
4. A QR modal shows a QR code for `/phone-upload/product-image/:token`.
5. The phone page validates the raw session token through
   `get_product_image_upload_session_by_token(...)`.
6. The phone user takes a photo or chooses from the library.
7. `compressProductImage` compresses the selected image to `<= 100 KB`.
8. The phone uploads the compressed blob to the session path in Supabase
   Storage.
9. The phone calls `complete_product_image_upload_session(...)`.
10. The desktop polls `get_product_image_upload_session_status(...)`, receives
    the completed public URL, and updates the product image preview.
11. The product row is updated normally only when the user saves the product.

The QR modal intentionally does not show the long signed upload URL. The QR
contains only the app route and high-entropy session token.

## Phone upload security model

Phone upload uses token-only access for convenience, but the token is temporary
and scoped:

- Sessions expire after 10 minutes.
- The raw token is returned only once to the desktop and appears in the QR URL.
- The database stores only `sha256(token)`.
- A session can be completed only once.
- Expired, completed, or canceled sessions clear the stored signed upload token.
- The phone can upload only to the session's pre-created path:
  `product-images/temp/<sessionId>`.
- `complete_product_image_upload_session(...)` rejects:
  - wrong storage paths,
  - files over 100 KB,
  - unsupported MIME types,
  - base64/data URLs,
  - URLs outside the `product-images` bucket.

The phone page does not require normal app login. Security comes from the
unguessable one-time token plus the pre-scoped signed upload token. This avoids
opening public arbitrary bucket writes.

## Migration 019

Run `supabase/migrations/019_product_image_upload_sessions.sql` after
`016_product_images_storage.sql`.

It adds:

- `product_image_upload_sessions`
- `product_image_upload_token_hash(p_token text)`
- `create_product_image_upload_session(p_shop_id text, p_product_id text)`
- `attach_product_image_upload_session_token(p_session_id text, p_signed_upload_token text)`
- `get_product_image_upload_session_status(p_session_id text)`
- `get_product_image_upload_session_by_token(p_token text)`
- `complete_product_image_upload_session(...)`
- `cancel_product_image_upload_session(p_session_id text)`

Desktop session creation requires authenticated product create/update
permission. Phone session lookup and completion are granted to `anon` and
`authenticated`, but both require a valid session token.

## Known follow-up - orphaned objects

Replacing or removing a product image uploads/clears the URL but **does not
delete the old Storage object**. Deleting before the product row is saved would
risk a broken image if the modal is cancelled.

Temporary phone uploads can also become orphaned if a product modal is cancelled
after the phone upload completes.

Orphaned objects are harmless but accumulate. Recommended cleanup later: a
scheduled job that lists `product-images` objects and deletes any whose URL is
not referenced by `products.image_url`, plus old `product-images/temp/*` objects
whose sessions are expired/canceled.
