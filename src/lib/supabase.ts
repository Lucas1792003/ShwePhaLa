import { createClient } from "@supabase/supabase-js";
import { useToastStore } from "../stores/toastStore";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Fire-and-forget write — shows a visible error toast + console log on failure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbWrite(query: PromiseLike<{ error: any }>, label: string) {
  query.then(({ error }) => {
    if (error) {
      console.error(`[DB] ${label} failed:`, error.message);
      useToastStore.getState().addToast({
        variant: "error",
        title: `Save failed (${label})`,
        description: error.message,
      });
    }
  });
}
