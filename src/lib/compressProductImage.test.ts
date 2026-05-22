import { describe, it, expect } from "vitest";
import {
  validateProductImageFile,
  fitDimensions,
  formatImageSize,
  runCompressionLadder,
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_ORIGINAL_IMAGE_BYTES,
} from "./compressProductImage";

// validateProductImageFile / fitDimensions / formatImageSize / runCompressionLadder
// are pure (no canvas / DOM) and run in the node test environment. The canvas
// encode path of compressProductImage is browser-only and is exercised manually.

// validateProductImageFile only reads `.type` and `.size`.
const fakeFile = (type: string, size: number): File =>
  ({ type, size, name: "image" }) as unknown as File;

describe("validateProductImageFile", () => {
  it("rejects a non-image file", () => {
    expect(() => validateProductImageFile(fakeFile("text/plain", 1024))).toThrowError(
      /JPEG, PNG or WebP/,
    );
  });

  it("rejects an unsupported image type (gif)", () => {
    expect(() => validateProductImageFile(fakeFile("image/gif", 1024))).toThrowError(
      /JPEG, PNG or WebP/,
    );
  });

  it("rejects a file larger than 10 MB", () => {
    expect(() =>
      validateProductImageFile(fakeFile("image/jpeg", MAX_ORIGINAL_IMAGE_BYTES + 1)),
    ).toThrowError(/max 10 MB/);
  });

  it("accepts jpeg / png / webp under 10 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(() => validateProductImageFile(fakeFile(type, 2 * 1024 * 1024))).not.toThrow();
    }
  });
});

describe("fitDimensions", () => {
  it("downscales a large image preserving the aspect ratio", () => {
    expect(fitDimensions(1920, 1080, 320)).toEqual({ width: 320, height: 180 });
  });

  it("never upscales an already-small image", () => {
    expect(fitDimensions(100, 80, 320)).toEqual({ width: 100, height: 80 });
  });

  it("clamps every side to at least 1px", () => {
    const d = fitDimensions(10000, 1, 192);
    expect(d.width).toBeGreaterThanOrEqual(1);
    expect(d.height).toBeGreaterThanOrEqual(1);
  });
});

describe("formatImageSize", () => {
  it("renders the 'NN KB' string the UI shows", () => {
    expect(formatImageSize(68 * 1024)).toBe("68 KB");
    expect(formatImageSize(MAX_PRODUCT_IMAGE_BYTES)).toBe("100 KB");
  });
});

describe("runCompressionLadder", () => {
  // runCompressionLadder only reads `blob.size`.
  const blob = (size: number): Blob => ({ size, type: "image/webp" }) as Blob;
  const dims = [320, 256, 192];
  const qualities = [0.72, 0.65, 0.58, 0.5, 0.45];

  it("MAX_PRODUCT_IMAGE_BYTES is exactly 100 KB", () => {
    expect(MAX_PRODUCT_IMAGE_BYTES).toBe(100 * 1024);
  });

  it("returns the first attempt within the size budget", async () => {
    let calls = 0;
    const encode = async (maxDim: number) => {
      calls++;
      return { blob: blob(50 * 1024), width: maxDim, height: maxDim };
    };
    const result = await runCompressionLadder(encode, dims, qualities, MAX_PRODUCT_IMAGE_BYTES);
    expect(result.blob.size).toBeLessThanOrEqual(MAX_PRODUCT_IMAGE_BYTES);
    expect(calls).toBe(1); // the very first ladder step already fit
  });

  it("steps down quality/dimensions until an attempt fits", async () => {
    const sizes = [300, 250, 200, 90].map((kb) => kb * 1024); // 4th attempt fits
    let i = 0;
    const encode = async (maxDim: number) => ({
      blob: blob(sizes[i++]),
      width: maxDim,
      height: maxDim,
    });
    const result = await runCompressionLadder(encode, dims, qualities, MAX_PRODUCT_IMAGE_BYTES);
    expect(result.blob.size).toBe(90 * 1024);
    expect(result.blob.size).toBeLessThanOrEqual(MAX_PRODUCT_IMAGE_BYTES);
  });

  it("enforces the budget — never returns a blob above maxBytes", async () => {
    // every attempt is 101 KB → just over the 100 KB cap
    const encode = async (maxDim: number) => ({
      blob: blob(101 * 1024),
      width: maxDim,
      height: maxDim,
    });
    await expect(
      runCompressionLadder(encode, dims, qualities, MAX_PRODUCT_IMAGE_BYTES),
    ).rejects.toThrow();
  });

  it("rejects with a friendly message when nothing fits, without looping forever", async () => {
    let calls = 0;
    const encode = async (maxDim: number) => {
      calls++;
      return { blob: blob(500 * 1024), width: maxDim, height: maxDim };
    };
    await expect(
      runCompressionLadder(encode, dims, qualities, MAX_PRODUCT_IMAGE_BYTES),
    ).rejects.toThrowError(/could not be compressed below 100 KB/);
    // bounded: dims (3) x qualities (5) = 15 attempts, then it stops
    expect(calls).toBe(dims.length * qualities.length);
  });
});
