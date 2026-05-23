-- ============================================================
-- Migration 019: Temporary QR sessions for phone product photos
--
-- Desktop product editors create a short-lived upload session. The raw token
-- is returned once for the QR URL; only its SHA-256 hash is stored. Phones can
-- complete exactly one session by presenting that token after uploading to the
-- session's pre-signed Supabase Storage path.
--
-- Run AFTER 001-018 and after the product-images bucket migration (016).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS product_image_upload_sessions (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  created_by text NOT NULL REFERENCES users(id),
  shop_id text REFERENCES shops(id),
  product_id text REFERENCES products(id),
  storage_path text NOT NULL,
  signed_upload_token text,
  public_url text,
  bytes integer,
  mime_type text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE product_image_upload_sessions
  ADD COLUMN IF NOT EXISTS signed_upload_token text;

CREATE INDEX IF NOT EXISTS product_image_upload_sessions_created_by_idx
  ON product_image_upload_sessions(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS product_image_upload_sessions_expires_idx
  ON product_image_upload_sessions(status, expires_at);

ALTER TABLE product_image_upload_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON product_image_upload_sessions FROM PUBLIC;
GRANT SELECT ON product_image_upload_sessions TO authenticated;

DROP POLICY IF EXISTS "product_image_upload_sessions_owner_select" ON product_image_upload_sessions;
CREATE POLICY "product_image_upload_sessions_owner_select"
  ON product_image_upload_sessions
  FOR SELECT TO authenticated
  USING (created_by = (current_app_user()).id);

-- Keep hash construction in one place so callers never store the raw token.
CREATE OR REPLACE FUNCTION product_image_upload_token_hash(p_token text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT encode(sha256(convert_to(COALESCE(p_token, ''), 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION create_product_image_upload_session(
  p_shop_id text DEFAULT NULL,
  p_product_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users;
  v_session_id text := 'pimg-' || replace(gen_random_uuid()::text, '-', '');
  v_token text := replace(gen_random_uuid()::text, '-', '')
                  || replace(gen_random_uuid()::text, '-', '')
                  || replace(gen_random_uuid()::text, '-', '')
                  || replace(gen_random_uuid()::text, '-', '');
  v_storage_path text := 'temp/' || v_session_id;
  v_product_id text;
  v_expires_at timestamptz := now() + interval '10 minutes';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (app_has_perm('product:create') OR app_has_perm('product:update')) THEN
    RAISE EXCEPTION 'You are not permitted to upload product images';
  END IF;

  IF p_shop_id IS NOT NULL
     AND app_role() <> 'ADMIN'
     AND app_shop_id() IS DISTINCT FROM p_shop_id THEN
    RAISE EXCEPTION 'You are not permitted to create an upload session for this shop';
  END IF;

  IF p_product_id IS NOT NULL AND EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    v_product_id := p_product_id;
  END IF;

  INSERT INTO product_image_upload_sessions (
    id, token_hash, created_by, shop_id, product_id, storage_path, expires_at
  )
  VALUES (
    v_session_id, product_image_upload_token_hash(v_token), v_user.id,
    p_shop_id, v_product_id, v_storage_path, v_expires_at
  );

  RETURN jsonb_build_object(
    'sessionId', v_session_id,
    'token', v_token,
    'storagePath', v_storage_path,
    'expiresAt', v_expires_at,
    'status', 'PENDING'
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_product_image_upload_session_status(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users;
  v_session product_image_upload_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_session
    FROM product_image_upload_sessions
   WHERE id = p_session_id
   FOR UPDATE;

  IF v_session.id IS NULL OR v_session.created_by <> v_user.id THEN
    RAISE EXCEPTION 'Upload session not found';
  END IF;

  IF v_session.status = 'PENDING' AND v_session.expires_at <= now() THEN
    UPDATE product_image_upload_sessions
       SET status = 'EXPIRED',
           signed_upload_token = NULL
     WHERE id = v_session.id
     RETURNING * INTO v_session;
  END IF;

  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'storagePath', v_session.storage_path,
    'publicUrl', v_session.public_url,
    'bytes', v_session.bytes,
    'mimeType', v_session.mime_type,
    'expiresAt', v_session.expires_at,
    'status', v_session.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION attach_product_image_upload_session_token(
  p_session_id text,
  p_signed_upload_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users;
  v_session product_image_upload_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF COALESCE(btrim(p_signed_upload_token), '') = '' THEN
    RAISE EXCEPTION 'Signed upload token is required';
  END IF;

  SELECT * INTO v_session
    FROM product_image_upload_sessions
   WHERE id = p_session_id
     AND created_by = v_user.id
   FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Upload session not found';
  END IF;

  IF v_session.status <> 'PENDING' OR v_session.expires_at <= now() THEN
    UPDATE product_image_upload_sessions
       SET status = CASE WHEN status = 'PENDING' THEN 'EXPIRED' ELSE status END,
           signed_upload_token = NULL
     WHERE id = v_session.id
     RETURNING * INTO v_session;
    RAISE EXCEPTION 'Upload link is no longer active';
  END IF;

  UPDATE product_image_upload_sessions
     SET signed_upload_token = p_signed_upload_token
   WHERE id = v_session.id
   RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'storagePath', v_session.storage_path,
    'expiresAt', v_session.expires_at,
    'status', v_session.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_product_image_upload_session_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session product_image_upload_sessions;
BEGIN
  IF COALESCE(length(p_token), 0) < 32 THEN
    RAISE EXCEPTION 'Invalid upload link';
  END IF;

  SELECT * INTO v_session
    FROM product_image_upload_sessions
   WHERE token_hash = product_image_upload_token_hash(p_token)
   FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Invalid upload link';
  END IF;

  IF v_session.status = 'PENDING' AND v_session.expires_at <= now() THEN
    UPDATE product_image_upload_sessions
       SET status = 'EXPIRED',
           signed_upload_token = NULL
     WHERE id = v_session.id
     RETURNING * INTO v_session;
  END IF;

  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'storagePath', v_session.storage_path,
    'publicUrl', v_session.public_url,
    'bytes', v_session.bytes,
    'mimeType', v_session.mime_type,
    'uploadToken', CASE WHEN v_session.status = 'PENDING' THEN v_session.signed_upload_token ELSE NULL END,
    'expiresAt', v_session.expires_at,
    'status', v_session.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION complete_product_image_upload_session(
  p_token text,
  p_storage_path text,
  p_public_url text,
  p_bytes integer,
  p_mime_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session product_image_upload_sessions;
BEGIN
  IF COALESCE(length(p_token), 0) < 32 THEN
    RAISE EXCEPTION 'Invalid upload link';
  END IF;

  SELECT * INTO v_session
    FROM product_image_upload_sessions
   WHERE token_hash = product_image_upload_token_hash(p_token)
   FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Invalid upload link';
  END IF;

  IF v_session.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Upload link is no longer active';
  END IF;

  IF v_session.expires_at <= now() THEN
    UPDATE product_image_upload_sessions
       SET status = 'EXPIRED',
           signed_upload_token = NULL
     WHERE id = v_session.id;
    RAISE EXCEPTION 'Upload link has expired';
  END IF;

  IF p_storage_path IS DISTINCT FROM v_session.storage_path THEN
    RAISE EXCEPTION 'Upload path does not match this session';
  END IF;

  IF p_bytes IS NULL OR p_bytes <= 0 OR p_bytes > 102400 THEN
    RAISE EXCEPTION 'Uploaded image must be 100 KB or smaller';
  END IF;

  IF p_mime_type NOT IN ('image/webp', 'image/jpeg') THEN
    RAISE EXCEPTION 'Unsupported uploaded image type';
  END IF;

  IF COALESCE(btrim(p_public_url), '') = '' OR lower(p_public_url) LIKE 'data:%' THEN
    RAISE EXCEPTION 'Uploaded image URL must be a Storage URL';
  END IF;

  IF position('/storage/v1/object/public/product-images/' in p_public_url) = 0 THEN
    RAISE EXCEPTION 'Uploaded image URL must point to the product-images bucket';
  END IF;

  UPDATE product_image_upload_sessions
     SET status = 'COMPLETED',
         storage_path = p_storage_path,
         public_url = p_public_url,
         bytes = p_bytes,
         mime_type = p_mime_type,
         signed_upload_token = NULL,
         completed_at = now()
   WHERE id = v_session.id
   RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'storagePath', v_session.storage_path,
    'publicUrl', v_session.public_url,
    'bytes', v_session.bytes,
    'mimeType', v_session.mime_type,
    'expiresAt', v_session.expires_at,
    'status', v_session.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION cancel_product_image_upload_session(p_session_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE product_image_upload_sessions
     SET status = 'CANCELED',
         signed_upload_token = NULL
   WHERE id = p_session_id
     AND created_by = v_user.id
     AND status = 'PENDING';
END;
$$;

REVOKE ALL ON FUNCTION product_image_upload_token_hash(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_product_image_upload_session(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION attach_product_image_upload_session_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_product_image_upload_session_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_product_image_upload_session_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_product_image_upload_session(text, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_product_image_upload_session(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_product_image_upload_session(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION attach_product_image_upload_session_token(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_image_upload_session_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_product_image_upload_session(text) TO authenticated;

-- Phone links are intentionally unauthenticated, but require a valid
-- high-entropy one-time token. They never expose broad table or bucket writes.
GRANT EXECUTE ON FUNCTION get_product_image_upload_session_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_product_image_upload_session(text, text, text, integer, text) TO anon, authenticated;
