/**
 * Product image compression.
 *
 * Product images must stay tiny so the POS product grid loads fast. Every
 * image saved by the app is resized and re-encoded to UNDER 100 KB before it
 * is stored. WebP is used when the browser can encode it, otherwise JPEG.
 *
 * STORAGE MODEL
 *   Supabase Storage is not configured for this project, so the compressed
 *   image is returned as a data URL and stored in `products.image_url`
 *   (Option B). Because the underlying blob is < 100 KB, the stored base64
 *   string is small (~133 KB) — acceptable on the row, and nothing like the
 *   multi-MB originals the old uploader produced.
 *
 *   TODO (preferred): create a Supabase Storage `product-images` bucket and
 *   upload `CompressedImage.blob` to it, storing only the returned public URL
 *   / path on the product row. `compressProductImage` already returns `blob`,
 *   so the migration is just: upload the blob, store the URL instead of
 *   `dataUrl`. No other caller needs to change.
 */

/** Hard cap — every saved product image must be at or below this size. */
export const MAX_PRODUCT_IMAGE_BYTES = 100 * 1024;

/** Original files larger than this are rejected before any processing. */
export const MAX_ORIGINAL_IMAGE_BYTES = 10 * 1024 * 1024;

/** Input image types the uploader accepts. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// Compression ladder — tried in order, outermost first.
const DEFAULT_MAX_DIMENSIONS = [320, 256, 192];
const DEFAULT_QUALITIES = [0.72, 0.65, 0.58, 0.5, 0.45];

export interface CompressProductImageOptions {
  /** Max width/height ladder, largest first. Default `[320, 256, 192]`. */
  maxDimensions: number[];
  /** Quality ladder, highest first. Default `[0.72, 0.65, 0.58, 0.5, 0.45]`. */
  qualities: number[];
  /** Size budget in bytes. Default `MAX_PRODUCT_IMAGE_BYTES` (100 KB). */
  maxBytes: number;
}

export interface CompressedImage {
  /** The compressed image — guaranteed `blob.size <= maxBytes`. */
  blob: Blob;
  /** Data URL of the compressed image — use for preview AND for storage. */
  dataUrl: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
}

/** Friendly message shown when no ladder step gets the image small enough. */
const CANNOT_COMPRESS_MESSAGE =
  "Image could not be compressed below 100 KB. Please choose a simpler or smaller image.";

/**
 * Validate a chosen file before any (potentially expensive) decoding.
 * Throws an `Error` with a user-friendly message; returns nothing on success.
 * Pure — safe to unit test without a browser.
 */
export function validateProductImageFile(file: File): void {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("Unsupported image type. Please choose a JPEG, PNG or WebP image.");
  }
  if (file.size > MAX_ORIGINAL_IMAGE_BYTES) {
    throw new Error("Image is too large (max 10 MB). Please choose a smaller file.");
  }
}

/**
 * Scale (width, height) so neither side exceeds `maxDim`, preserving the
 * aspect ratio. Never upscales; never returns a side below 1px. Pure.
 */
export function fitDimensions(
  width: number,
  height: number,
  maxDim: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxDim / width, maxDim / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Human-readable size for the UI, e.g. `formatImageSize(68 * 1024) === "68 KB"`. */
export function formatImageSize(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

type EncodeAttempt = (
  maxDim: number,
  quality: number,
) => Promise<{ blob: Blob; width: number; height: number }>;

/**
 * Walk the dimension × quality ladder and return the first encoded result at
 * or under `maxBytes`. The loops are finite (no infinite loop possible); if
 * nothing fits, throws the friendly "could not be compressed" error.
 *
 * Exported so the ladder logic can be unit tested with a fake encoder.
 */
export async function runCompressionLadder(
  encode: EncodeAttempt,
  maxDimensions: number[],
  qualities: number[],
  maxBytes: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  for (const maxDim of maxDimensions) {
    for (const quality of qualities) {
      const attempt = await encode(maxDim, quality);
      if (attempt.blob.size <= maxBytes) return attempt;
    }
  }
  throw new Error(CANNOT_COMPRESS_MESSAGE);
}

// ---- Browser-only helpers (not exercised by node unit tests) --------------

let webpEncodeSupported: boolean | null = null;

/** True when this browser can ENCODE WebP via canvas (cached). */
function supportsWebpEncoding(): boolean {
  if (webpEncodeSupported === null) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpEncodeSupported = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  }
  return webpEncodeSupported;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The image could not be processed."))),
      mimeType,
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("The compressed image could not be read."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Resize + compress a chosen product image to under 100 KB.
 *
 * Steps: validate type/size → decode → draw to a canvas → encode (WebP, or
 * JPEG fallback) walking down quality then dimensions until the result is
 * within the size budget. Throws a friendly `Error` if the file is invalid or
 * cannot be compressed small enough.
 */
export async function compressProductImage(
  file: File,
  options?: Partial<CompressProductImageOptions>,
): Promise<CompressedImage> {
  validateProductImageFile(file);

  const maxDimensions = options?.maxDimensions ?? DEFAULT_MAX_DIMENSIONS;
  const qualities = options?.qualities ?? DEFAULT_QUALITIES;
  const maxBytes = options?.maxBytes ?? MAX_PRODUCT_IMAGE_BYTES;
  // Prefer WebP; fall back to JPEG when the browser cannot encode WebP.
  const mimeType = supportsWebpEncoding() ? "image/webp" : "image/jpeg";

  const image = await loadImageElement(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("That file could not be read as an image.");
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("The image could not be processed (canvas is unavailable).");
  }

  const encode: EncodeAttempt = async (maxDim, quality) => {
    const { width, height } = fitDimensions(sourceWidth, sourceHeight, maxDim);
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, mimeType, quality);
    return { blob, width, height };
  };

  const { blob, width, height } = await runCompressionLadder(
    encode,
    maxDimensions,
    qualities,
    maxBytes,
  );
  const dataUrl = await blobToDataUrl(blob);

  return {
    blob,
    dataUrl,
    mimeType: blob.type || mimeType,
    bytes: blob.size,
    width,
    height,
  };
}
