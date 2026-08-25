// WARNING:
// This script must not be run from the browser/authenticated Supabase client
// after RLS lockdown. Protected operational tables are RPC-only and normal
// authenticated clients are intentionally blocked from direct seed writes.
//
// Use Supabase SQL editor, `supabase db reset`, or `seedServiceRole.ts` (this
// same directory) for full database seeding. This file is retained only as
// a dev reference and requires an explicit local opt-in.

import { supabase } from "../../src/lib/supabase";
import { runSeed } from "./seedRun";

export async function seedSupabase() {
  if (!import.meta.env.DEV || import.meta.env.VITE_ALLOW_BROWSER_SUPABASE_SEED !== "true") {
    throw new Error(
      "seedSupabase is disabled. Use SQL/service-role seeding, or set VITE_ALLOW_BROWSER_SUPABASE_SEED=true in local development only."
    );
  }
  await runSeed(supabase);
}
