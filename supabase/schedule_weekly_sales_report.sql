-- ============================================================
-- Schedule the weekly sales report (pg_cron → weekly-sales-report function).
--
-- Fires once a week, timed to land at Monday 00:00 Asia/Yangon (Myanmar
-- Time, UTC+6:30) — matching what src/features/sales/WeeklyReportCountdown.tsx
-- already promises admins in the UI. pg_cron runs on the Postgres server's
-- own clock, which on Supabase is UTC, so "Monday 00:00 MMT" is expressed
-- below as "Sunday 17:30 UTC" (00:00 − 6:30 = the previous day 17:30).
-- The function itself re-derives the exact week boundary from a real MMT
-- calendar Monday (see mostRecentMondayMidnightMmt in its source), so a
-- few minutes of cron scheduling jitter doesn't shift which sales land in
-- which week's report.
--
-- PREREQUISITES
--   1. Deploy the function:  supabase functions deploy weekly-sales-report
--   2. RESEND_API_KEY / REPORT_EMAIL_FROM are already set as project-wide
--      Edge Function secrets (shared with email-sales-report and
--      rotate-audit-log) — nothing extra to configure there.
--   3. Run THIS script in the SQL Editor after filling in the placeholder.
--
-- ⚠️ SECURITY: this stores the service-role key inside cron.job, same as
-- supabase/schedule_audit_rotation.sql already does for this project. That's
-- only visible to roles with DB access, but for stricter setups put the key
-- in Supabase Vault and read it via vault.decrypted_secrets instead of
-- inlining.
-- ============================================================

-- 1. Extensions (no-ops if already enabled).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Replace <SERVICE_ROLE_KEY> below (project URL is already filled in), then run.
--    Re-running is safe: it unschedules any existing job of the same name first.
SELECT cron.unschedule('weekly-sales-report')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-sales-report');

SELECT cron.schedule(
  'weekly-sales-report',
  '30 17 * * 0',  -- 17:30 UTC every Sunday == Monday 00:00 Asia/Yangon (UTC+6:30)
  $$
  SELECT net.http_post(
    url     := 'https://gzqiukxnzfdouwaotelx.supabase.co/functions/v1/weekly-sales-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Useful management queries:
--   SELECT * FROM cron.job WHERE jobname = 'weekly-sales-report';
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--   SELECT cron.unschedule('weekly-sales-report');   -- to stop it
