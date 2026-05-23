import { describe, expect, it } from "vitest";
import { MAX_PRODUCT_IMAGE_BYTES } from "./compressProductImage";
import {
  buildProductImagePhoneUploadQrUrl,
  assertCompressedPhoneUpload,
  getSignedUploadTokenFromHash,
} from "./productImagePhoneUpload";

describe("product image phone upload helpers", () => {
  it("builds a phone upload QR URL with the session token in the route", () => {
    const url = buildProductImagePhoneUploadQrUrl("https://retail.example", "session-token", "upload-token");
    expect(url).toBe(
      "https://retail.example/phone-upload/product-image/session-token#uploadToken=upload-token",
    );
  });

  it("keeps the signed upload token in the hash fragment", () => {
    expect(getSignedUploadTokenFromHash("#uploadToken=abc123")).toBe("abc123");
    expect(getSignedUploadTokenFromHash("uploadToken=abc123")).toBe("abc123");
  });

  it("rejects base64 public URLs", () => {
    expect(() => assertCompressedPhoneUpload(90 * 1024, "data:image/webp;base64,abc")).toThrowError(
      /Storage URL/,
    );
  });

  it("enforces the 100 KB compressed image limit", () => {
    expect(() =>
      assertCompressedPhoneUpload(MAX_PRODUCT_IMAGE_BYTES + 1, "https://example.com/image.webp"),
    ).toThrowError(/100 KB/);
    expect(() =>
      assertCompressedPhoneUpload(MAX_PRODUCT_IMAGE_BYTES, "https://example.com/image.webp"),
    ).not.toThrow();
  });
});
