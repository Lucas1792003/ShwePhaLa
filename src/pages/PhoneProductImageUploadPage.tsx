import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { compressProductImage, formatImageSize } from "../lib/compressProductImage";
import { PRODUCT_IMAGE_BUCKET } from "../lib/productImageStorage";
import {
  completeProductImageUploadSession,
  getProductImageUploadSessionByToken,
  getSignedUploadTokenFromHash,
  type ProductImageUploadSessionStatusResult,
} from "../lib/productImagePhoneUpload";
import { supabase } from "../lib/supabase";

type UploadPhase = "loading" | "ready" | "compressing" | "uploading" | "complete" | "expired" | "error";

export const PhoneProductImageUploadPage = () => {
  const { token = "" } = useParams<{ token: string }>();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<ProductImageUploadSessionStatusResult | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [compressedBytes, setCompressedBytes] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setPhase("loading");
    setError(null);

    if (!token) {
      setPhase("error");
      setError("Invalid upload link.");
      return;
    }

    getProductImageUploadSessionByToken(token)
      .then((result) => {
        if (!active) return;
        setSession(result);
        if (result.status === "PENDING") setPhase("ready");
        else if (result.status === "COMPLETED") setPhase("complete");
        else if (result.status === "EXPIRED") setPhase("expired");
        else {
          setPhase("error");
          setError("This upload link is no longer active.");
        }
      })
      .catch((e) => {
        if (!active) return;
        setPhase("error");
        setError(e instanceof Error ? e.message : "Invalid or expired upload link.");
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!session || phase !== "ready") return;
    const delay = Date.parse(session.expiresAt) - Date.now();
    if (delay <= 0) {
      setPhase("expired");
      return;
    }
    const timer = window.setTimeout(() => setPhase("expired"), delay);
    return () => window.clearTimeout(timer);
  }, [phase, session]);

  const handleFile = async (file: File) => {
    if (!session || phase !== "ready") return;
    if (Date.parse(session.expiresAt) <= Date.now()) {
      setPhase("expired");
      return;
    }

    const uploadToken = getSignedUploadTokenFromHash(window.location.hash);
    if (!uploadToken) {
      setPhase("error");
      setError("This QR code is missing its upload token. Please create a new QR code on the computer.");
      return;
    }

    setError(null);
    setPhase("compressing");
    try {
      const image = await compressProductImage(file);
      setCompressedBytes(image.bytes);

      setPhase("uploading");
      const { error: uploadError } = await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .uploadToSignedUrl(session.storagePath, uploadToken, image.blob, {
          cacheControl: "31536000",
          contentType: image.mimeType,
        });
      if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);

      const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(session.storagePath);
      const completed = await completeProductImageUploadSession({
        token,
        storagePath: session.storagePath,
        publicUrl: data.publicUrl,
        bytes: image.bytes,
        mimeType: image.mimeType,
      });
      setSession(completed);
      setPhase("complete");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "The photo could not be uploaded.");
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void handleFile(file);
  };

  const busy = phase === "loading" || phase === "compressing" || phase === "uploading";
  const canChoose = phase === "ready";
  const statusText =
    phase === "loading"
      ? "Checking upload link..."
      : phase === "compressing"
        ? "Compressing photo..."
        : phase === "uploading"
          ? "Uploading photo..."
          : phase === "complete"
            ? "Photo uploaded. You can return to the computer."
            : phase === "expired"
              ? "This upload link has expired."
              : phase === "ready"
                ? "Choose or take a product photo."
                : "Upload failed.";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col justify-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <span className="material-symbols-rounded">photo_camera</span>
            </div>
            <div>
              <h1 className="text-lg font-bold">Product photo upload</h1>
              <p className="text-sm text-slate-500">ShwePhaLa Retail</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            {statusText}
          </div>

          {compressedBytes !== null && (
            <p className="mt-3 text-sm font-medium text-emerald-700">
              Compressed: {formatImageSize(compressedBytes)}
            </p>
          )}

          {error && (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="mt-5 grid gap-3">
            <Button
              type="button"
              size="lg"
              disabled={!canChoose || busy}
              onClick={() => cameraInputRef.current?.click()}
              className="w-full"
            >
              <span className="material-symbols-rounded mr-2">photo_camera</span>
              Take photo
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={!canChoose || busy}
              onClick={() => libraryInputRef.current?.click()}
              className="w-full"
            >
              <span className="material-symbols-rounded mr-2">photo_library</span>
              Choose from library
            </Button>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleChange}
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleChange}
          />

          {phase === "complete" && (
            <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700">
              Photo uploaded. You can return to the computer.
            </p>
          )}
        </div>
      </div>
    </main>
  );
};
