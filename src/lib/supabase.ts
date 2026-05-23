import { createClient } from "@supabase/supabase-js";
import { useToastStore } from "../stores/toastStore";
import { getErrorMessage } from "./errors";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Fire-and-forget write — shows a friendly error toast + console log on failure.
// Prefer dbExec for new code; this remains for legacy callers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbWrite(query: PromiseLike<{ error: any }>, label: string) {
  query.then(({ error }) => {
    if (error) {
      console.error(`[DB] ${label} failed:`, error);
      useToastStore.getState().addToast({
        variant: "error",
        title: "Save failed",
        description: getErrorMessage(error, "Please try again."),
      });
    }
  });
}

/**
 * Awaited write for critical data. Throws a controlled, friendly error on
 * failure so the caller can abort before mutating local state. The caller is
 * responsible for surfacing the error to the UI (via useAsyncAction, a toast,
 * or an inline message).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbExec(query: PromiseLike<{ error: any }>, label: string): Promise<void> {
  const { error } = await query;
  if (error) {
    console.error(`[DB] ${label} failed:`, error);
    throw new Error(getErrorMessage(error, `${label} failed.`));
  }
}

/**
 * Awaited write for audit/ledger-secondary rows. Logs on failure but never
 * throws — a lost audit row must not roll back an already-persisted operation.
 * (Full transactional audit is handled in the next, RPC-based step.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbAudit(query: PromiseLike<{ error: any }>, label: string): Promise<void> {
  const { error } = await query;
  if (error) console.error(`[DB] audit ${label} failed (non-fatal):`, error.message);
}
