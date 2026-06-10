-- ============================================================
-- Schedule the audit-log rotation (pg_cron → rotate-audit-log function).
--
-- Every 5 minutes this calls the `rotate-audit-log` Edge Function, which
-- archives + emails + deletes the oldest 200 audit rows ONCE the table has
-- >= 200 entries (see supabase/functions/rotate-audit-log/index.ts).
--
-- PREREQUISITES
--   1. Deploy the function:  supabase functions deploy rotate-audit-log
--   2. Set its secrets (Edge Functions → rotate-audit-log → Secrets, or CLI):
--        RESEND_API_KEY, REPORT_EMAIL_FROM
--      (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
--   3. Run THIS script in the SQL Editor after filling in the two placeholders.
--
-- ⚠️ SECURITY: this stores the service-role key inside cron.job. That's only
-- visible to roles with DB access, but for stricter setups put the key in
-- Supabase Vault and read it via vault.decrypted_secrets instead of inlining.
-- ============================================================

-- 1. Extensions (no-ops if already enabled).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Replace <SERVICE_ROLE_KEY> below (project URL is already filled in), then run.
--    Re-running is safe: it unschedules any existing job of the same name first.
SELECT cron.unschedule('rotate-audit-log')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rotate-audit-log');

SELECT cron.schedule(
  'rotate-audit-log',
  '*/5 * * * *',  -- every 5 minutes
  $$
  SELECT net.http_post(
    url     := 'https://gzqiukxnzfdouwaotelx.supabase.co/functions/v1/rotate-audit-log',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Useful management queries:
--   SELECT * FROM cron.job WHERE jobname = 'rotate-audit-log';
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--   SELECT cron.unschedule('rotate-audit-log');   -- to stop it
