// Local-dev full database seed, run directly with Node (via `tsx`) —
// bypasses RLS with the service-role key, so it doesn't need the browser
// opt-in flag or a running dev server. Never commit a service-role key;
// this reads it from the environment only.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed/seedServiceRole.ts
//
// or `npm run seed:service-role` with those vars set in the shell/.env.

import { createClient } from "@supabase/supabase-js";
import { runSeed } from "./seedRun";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in the environment."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

runSeed(supabase)
  .then(() => {
    console.log("Seed complete.");
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
