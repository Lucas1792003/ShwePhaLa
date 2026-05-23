import { describe, expect, it } from "vitest";
import {
  ERROR_MESSAGES,
  getErrorMessage,
  isDuplicateError,
  isExpiredSessionError,
  isInsufficientStockError,
  isNetworkError,
  isNoOpenShiftError,
  isPermissionError,
  isStorageError,
  mapSupabaseError,
} from "./errors";

describe("error classifiers", () => {
  it("detects RLS / permission errors by code and phrasing", () => {
    expect(isPermissionError({ code: "42501", message: "permission denied for table users" })).toBe(true);
    expect(isPermissionError({ code: "PGRST301" })).toBe(true);
    expect(isPermissionError({ status: 403, message: "Forbidden" })).toBe(true);
    expect(isPermissionError({ message: "Row level security policy violated" })).toBe(true);
    expect(isPermissionError({ message: "not permitted to upload" })).toBe(true);
    expect(isPermissionError(null)).toBe(false);
  });

  it("detects unique-violation duplicates", () => {
    expect(isDuplicateError({ code: "23505" })).toBe(true);
    expect(isDuplicateError({ message: "duplicate key value violates unique constraint" })).toBe(true);
    expect(isDuplicateError({ message: "value already exists" })).toBe(true);
    expect(isDuplicateError({ message: "not unique-violation looking" })).toBe(false);
  });

  it("detects network / fetch failures", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError({ message: "NetworkError when attempting to fetch resource." })).toBe(true);
    expect(isNetworkError({ message: "ETIMEDOUT connecting" })).toBe(true);
    expect(isNetworkError({ message: "boring error" })).toBe(false);
  });

  it("detects storage bucket / policy errors", () => {
    expect(isStorageError({ message: "Bucket not found" })).toBe(true);
    expect(isStorageError({ message: "new row violates row-level security policy" })).toBe(true);
    expect(isStorageError({ message: "storage operation refused" })).toBe(true);
    expect(isStorageError({ message: "happy path" })).toBe(false);
  });

  it("detects business-domain errors that come back in error text", () => {
    expect(isInsufficientStockError({ message: "Insufficient stock for product P1" })).toBe(true);
    expect(isNoOpenShiftError({ message: "Open a shift before checkout." })).toBe(true);
    expect(isExpiredSessionError({ message: "JWT expired" })).toBe(true);
  });
});

describe("mapSupabaseError", () => {
  it("returns the expired-session message", () => {
    expect(mapSupabaseError({ message: "JWT expired" })).toBe(ERROR_MESSAGES.expiredSession);
  });

  it("prefers bucket-missing over generic permission", () => {
    expect(mapSupabaseError({ message: "Bucket not found" })).toBe(ERROR_MESSAGES.storageBucketMissing);
  });

  it("maps storage policy violations", () => {
    expect(mapSupabaseError({ message: "new row violates row-level security policy on storage.objects" })).toBe(
      ERROR_MESSAGES.storagePermission
    );
  });

  it("maps domain insufficient-stock errors before generic permission", () => {
    expect(mapSupabaseError({ message: "Insufficient stock" })).toBe(ERROR_MESSAGES.insufficientStock);
  });

  it("maps no-open-shift errors", () => {
    expect(mapSupabaseError({ message: "Open a shift before checkout." })).toBe(ERROR_MESSAGES.noOpenShift);
  });

  it("maps duplicates", () => {
    expect(mapSupabaseError({ code: "23505", message: "duplicate key" })).toBe(ERROR_MESSAGES.duplicate);
  });

  it("maps RLS / permission errors", () => {
    expect(mapSupabaseError({ code: "42501" })).toBe(ERROR_MESSAGES.permission);
  });

  it("maps network errors", () => {
    expect(mapSupabaseError(new TypeError("Failed to fetch"))).toBe(ERROR_MESSAGES.network);
  });

  it("falls back to unknown for opaque errors", () => {
    expect(mapSupabaseError({ message: "something exotic happened" })).toBe(ERROR_MESSAGES.unknown);
    expect(mapSupabaseError(null)).toBe(ERROR_MESSAGES.unknown);
  });
});

describe("getErrorMessage", () => {
  it("prefers the friendly mapping when one is available", () => {
    expect(getErrorMessage({ code: "23505", message: "duplicate key value" })).toBe(ERROR_MESSAGES.duplicate);
    expect(getErrorMessage({ code: "42501" })).toBe(ERROR_MESSAGES.permission);
  });

  it("prefers a short human-written raw message over the generic 'unknown'", () => {
    // RPC raises a clear message like this — we want it to come through.
    expect(getErrorMessage({ message: "Upload link has expired" })).toBe("Upload link has expired");
  });

  it("uses the fallback when the raw message looks technical", () => {
    const technical = {
      message:
        "PGRST301: { 'hint': null, 'details': 'rejected by row level security', 'code': 'PGRST301' }",
    };
    // Permission detection catches this via the "rls" phrase in details — friendly map wins.
    expect(getErrorMessage(technical, "Save failed.")).toBe(ERROR_MESSAGES.permission);
  });

  it("returns the supplied fallback when no info is available", () => {
    expect(getErrorMessage(undefined, "Save failed.")).toBe("Save failed.");
    expect(getErrorMessage(null)).toBe(ERROR_MESSAGES.unknown);
  });

  it("strips multi-line and JSON-shaped raw messages", () => {
    const ugly = { message: "{ \"code\": 500, \"details\": \"server exploded\" }" };
    expect(getErrorMessage(ugly, "Save failed.")).toBe("Save failed.");
  });
});
