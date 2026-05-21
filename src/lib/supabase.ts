import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Fire-and-forget write with error logging
export function dbWrite(promise: Promise<{ error: { message: string } | null }>, label: string) {
  promise.then(({ error }) => {
    if (error) console.error(`[DB] ${label} failed:`, error.message);
  });
}
