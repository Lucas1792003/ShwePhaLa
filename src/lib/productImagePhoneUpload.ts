import { MAX_PRODUCT_IMAGE_BYTES } from "./compressProductImage";
import { PRODUCT_IMAGE_BUCKET } from "./productImageStorage";

export const PRODUCT_IMAGE_PHONE_UPLOAD_ROUTE = "/phone-upload/product-image";

export type ProductImageUploadSessionStatus = "PENDING" | "COMPLETED" | "EXPIRED" | "CANCELED";

export interface ProductImageUploadSession {
  sessionId: string;
  token: string;
  storagePath: string;
  expiresAt: string;
  status: ProductImageUploadSessionStatus;
}

export interface ProductImageUploadSignedSession extends ProductImageUploadSession {
  uploadToken: string;
  qrUrl: string;
}

export interface ProductImageUploadSessionStatusResult {
  sessionId: string;
  storagePath: string;
  publicUrl?: string;
  bytes?: number;
  mimeType?: string;
  expiresAt: string;
  status: ProductImageUploadSessionStatus;
}

interface SessionRpcRow {
  sessionId: string;
  token?: string;
  storagePath: string;
  publicUrl?: string;
  bytes?: number;
  mimeType?: string;
  expiresAt: string;
  status: ProductImageUploadSessionStatus;
}

const assertStorageUrlIsSafe = (url: string): void => {
  if (url.trim().toLowerCase().startsWith("data:")) {
    throw new Error("Product image URL must be a Storage URL, not base64 data.");
  }
};

export function buildProductImagePhoneUploadQrUrl(
  origin: string,
  sessionToken: string,
  uploadToken: string,
): string {
  const normalizedOrigin = origin.replace(/\/$/, "");
  const url = new URL(
    `${normalizedOrigin}${PRODUCT_IMAGE_PHONE_UPLOAD_ROUTE}/${encodeURIComponent(sessionToken)}`,
  );
  url.hash = `uploadToken=${encodeURIComponent(uploadToken)}`;
  return url.toString();
}

export function getSignedUploadTokenFromHash(hash: string): string | null {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(value);
  return params.get("uploadToken");
}

export function assertCompressedPhoneUpload(bytes: number, publicUrl: string): void {
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error("Compressed image is over the 100 KB limit and was not uploaded.");
  }
  assertStorageUrlIsSafe(publicUrl);
}

export async function createProductImageUploadSession(input: {
  productId: string;
  shopId?: string | null;
}): Promise<ProductImageUploadSession> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("create_product_image_upload_session", {
    p_product_id: input.productId || null,
    p_shop_id: input.shopId || null,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Upload session was not created.");

  const session = data as SessionRpcRow;
  if (!session.token) throw new Error("Upload session did not return a token.");

  return {
    sessionId: session.sessionId,
    token: session.token,
    storagePath: session.storagePath,
    expiresAt: session.expiresAt,
    status: session.status,
  };
}

export async function createSignedProductImageUploadSession(input: {
  productId: string;
  shopId?: string | null;
  origin?: string;
}): Promise<ProductImageUploadSignedSession> {
  const session = await createProductImageUploadSession(input);
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .createSignedUploadUrl(session.storagePath);
  if (error) throw new Error(`Could not create phone upload URL: ${error.message}`);
  if (!data?.token) throw new Error("Phone upload URL did not include an upload token.");

  const origin = input.origin ?? window.location.origin;
  return {
    ...session,
    uploadToken: data.token,
    qrUrl: buildProductImagePhoneUploadQrUrl(origin, session.token, data.token),
  };
}

export async function getProductImageUploadSessionStatus(
  sessionId: string,
): Promise<ProductImageUploadSessionStatusResult> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("get_product_image_upload_session_status", {
    p_session_id: sessionId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Upload session was not found.");
  return data as ProductImageUploadSessionStatusResult;
}

export async function getProductImageUploadSessionByToken(
  token: string,
): Promise<ProductImageUploadSessionStatusResult> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("get_product_image_upload_session_by_token", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Upload session was not found.");
  return data as ProductImageUploadSessionStatusResult;
}

export async function completeProductImageUploadSession(input: {
  token: string;
  storagePath: string;
  publicUrl: string;
  bytes: number;
  mimeType: string;
}): Promise<ProductImageUploadSessionStatusResult> {
  assertCompressedPhoneUpload(input.bytes, input.publicUrl);

  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("complete_product_image_upload_session", {
    p_token: input.token,
    p_storage_path: input.storagePath,
    p_public_url: input.publicUrl,
    p_bytes: input.bytes,
    p_mime_type: input.mimeType,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Upload session completion returned no data.");
  return data as ProductImageUploadSessionStatusResult;
}

export async function cancelProductImageUploadSession(sessionId: string): Promise<void> {
  const { supabase } = await import("./supabase");
  const { error } = await supabase.rpc("cancel_product_image_upload_session", {
    p_session_id: sessionId,
  });
  if (error) throw new Error(error.message);
}
