import { useEffect, useRef, useState } from "react";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { normalizeBarcodeValue, validateBarcodeInput } from "../../lib/barcodeValidation";

interface BarcodeScanModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called with the normalized scanned/typed barcode value. The caller is
   * responsible for cross-product duplicate checks + persistence; this
   * modal only handles capture + shape validation.
   *
   * Return a string to display as an inline error and keep the modal
   * open (e.g. duplicate caught by the parent). Return null/undefined on
   * success and the modal will close itself.
   */
  onScan: (value: string) => string | null | undefined | Promise<string | null | undefined>;
}

/**
 * Dedicated barcode-scanner capture modal. Designed for hardware scanners
 * that act like keyboards and emit Enter (or Tab) after the burst.
 *
 * Why this is a separate modal rather than an inline input:
 *   - Scanners need stable focus. While the product form is open, focus
 *     can wander to any other field; a dedicated modal keeps the scanner
 *     pointed at one input until the user explicitly cancels.
 *   - Pressing Enter inside the product form's other fields submits the
 *     whole product. Isolating capture behind a separate modal removes
 *     that footgun entirely.
 *   - The fallback manual-entry button covers the case where the
 *     scanner is unavailable (e.g. during dev / QA on a laptop).
 */
export const BarcodeScanModal = ({ open, onClose, onScan }: BarcodeScanModalProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset state every time the modal opens so a previous error/value
  // doesn't carry over into the next scan session.
  useEffect(() => {
    if (open) {
      setValue("");
      setError(null);
      setBusy(false);
      // RAF so the input exists in the DOM before we focus it.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commit = async (raw: string) => {
    if (busy) return;
    const validationError = validateBarcodeInput(raw);
    if (validationError) {
      setError(validationError);
      return;
    }
    const normalized = normalizeBarcodeValue(raw);
    setBusy(true);
    try {
      const result = await onScan(normalized);
      if (result) {
        // Parent rejected (duplicate against another product, etc.) —
        // surface it inline and let the user retry or cancel.
        setError(result);
        setValue("");
        inputRef.current?.focus();
        return;
      }
      // Success — parent already accepted the code. Close the modal so
      // the next scan starts fresh, and reset state.
      setValue("");
      setError(null);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // Keep focus inside the capture input. If the user clicks elsewhere in
  // the modal body, refocus so the next scanner burst still lands here.
  const handleBlur = () => {
    if (!open || busy) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Most scanners terminate the burst with Enter. Some can be
    // configured to send Tab — treat both the same. Either way, prevent
    // the keypress from bubbling to the outer product form.
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      void commit(value);
    }
  };

  const status = !value
    ? "Waiting for scanner..."
    : busy
      ? "Adding..."
      : `Captured: ${normalizeBarcodeValue(value) || value}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan package barcode"
      description="Point the scanner at the product barcode. The code will be added automatically."
      size="sm"
    >
      <div className="space-y-3">
        <Input
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Scan or type, then press Enter"
          disabled={busy}
          autoComplete="off"
        />
        <div className="text-xs text-slate-500">{status}</div>
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void commit(value)}
            disabled={busy || !value.trim()}
          >
            {busy ? "Adding..." : "Add manually"}
          </Button>
        </div>
        <p className="text-[11px] text-slate-400">
          A hardware scanner sends the code followed by Enter. Manual entry
          is available as a fallback for testing.
        </p>
      </div>
    </Modal>
  );
};
