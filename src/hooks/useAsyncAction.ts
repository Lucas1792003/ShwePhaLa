import { useCallback, useRef, useState } from "react";
import { useToast } from "../components/ui/Toast";
import { getErrorMessage, reportError } from "../lib/errors";

interface UseAsyncActionOptions<T> {
  // Identifier used for the console log group on failure. Helps developers
  // grep `[scope]` to find the original error; not shown to users.
  scope: string;
  // Shown as the toast title on failure. Defaults to "Something went wrong".
  errorTitle?: string;
  // Message shown when no information could be extracted from the error.
  fallbackMessage?: string;
  // If provided, a success toast is shown after the action resolves. May be a
  // static string or a function deriving the message from the resolved value.
  successTitle?: string | ((result: T) => string);
  // Disables the automatic error toast. Useful when the caller wants to show
  // an inline form-level error instead. The error is still logged and the
  // promise still rejects.
  silent?: boolean;
}

interface UseAsyncActionResult<Args extends unknown[], T> {
  // Returns the resolved value, or `undefined` if the action threw.
  // Never throws: callers can branch on the truthy/undefined return value
  // without needing their own try/catch.
  run: (...args: Args) => Promise<T | undefined>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

// Standardized async-action helper for form/modal/save flows.
//
// Guarantees:
//  - `loading` is true while the action is in flight
//  - concurrent calls are ignored (prevents double-submit)
//  - the original error is logged via `reportError` with the supplied scope
//  - on failure the user sees a friendly toast (unless `silent` is set)
//  - on failure the run() resolves to `undefined` so the caller can keep the
//    modal/form open instead of swallowing the failure
//
// Use this for save/submit/confirm buttons. For background data loads,
// expose the error in your store and render a Retry button instead.
export function useAsyncAction<Args extends unknown[], T>(
  action: (...args: Args) => Promise<T>,
  options: UseAsyncActionOptions<T>
): UseAsyncActionResult<Args, T> {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Keep the latest references without re-creating `run` on every render.
  const actionRef = useRef(action);
  actionRef.current = action;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const run = useCallback(
    async (...args: Args): Promise<T | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        const result = await actionRef.current(...args);
        const opts = optionsRef.current;
        if (opts.successTitle) {
          const title =
            typeof opts.successTitle === "function" ? opts.successTitle(result) : opts.successTitle;
          if (title) toast({ title, variant: "success" });
        }
        return result;
      } catch (err) {
        const opts = optionsRef.current;
        const message = reportError(opts.scope, err, opts.fallbackMessage);
        setError(message);
        if (!opts.silent) {
          toast({
            title: opts.errorTitle ?? "Something went wrong",
            description: message,
            variant: "error",
          });
        }
        return undefined;
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [] // action/options captured via refs — see above
  );

  const clearError = useCallback(() => setError(null), []);

  return { run, loading, error, clearError };
}

// Imperative helper for non-React call-sites (stores, hooks). Mirrors
// useAsyncAction's failure handling but without hook state. Returns `undefined`
// on failure and the resolved value on success.
export async function runAsyncAction<T>(
  action: () => Promise<T>,
  scope: string,
  fallback?: string
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    const value = await action();
    return { ok: true, value };
  } catch (err) {
    const message = reportError(scope, err, fallback);
    return { ok: false, message };
  }
}

// Re-export so callers can `import { getErrorMessage } from "../hooks/useAsyncAction"`
// if it's more discoverable than the lib path. Kept thin on purpose.
export { getErrorMessage };
