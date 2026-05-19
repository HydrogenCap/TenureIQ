-- ============================================================================
-- pg_cron schedule for compliance reminders
-- ============================================================================
--
-- RUN-ONCE-BY-OPERATOR. This file is NOT a migration — it lives outside
-- supabase/migrations and prisma/migrations on purpose, because:
--   1. pg_cron is only available on the Supabase-hosted project (it
--      doesn't ship with `supabase start` local Docker).
--   2. The schedule is environment-specific: staging and production
--      both need it, but local dev does not.
--   3. Re-running it is idempotent if you use the same job name, but
--      we don't want it firing automatically during `prisma migrate`.
--
-- Apply via the Supabase SQL editor (Database → SQL editor) using a
-- session connected as `postgres`. The pg_cron extension must already
-- be enabled in the project (Database → Extensions → pg_cron → enable).
--
-- The schedule fires `enqueue_compliance_reminders()` daily at 07:00
-- UTC. That function selects compliance items due within the next 60
-- days that don't already have a pending or sent reminder row, and
-- inserts a row in `compliance_reminders` for each. The Next.js cron
-- route at /api/cron/send-reminders then picks them up and sends the
-- email. (We can also drive everything from Vercel Cron if pg_cron
-- isn't available — see app/api/cron/send-reminders/route.ts. Both
-- paths use the same enqueue → send split, so running both
-- simultaneously would double-fire the enqueue step. Pick one.)

-- =========================================================================
-- 1. Schedule the enqueue job
-- =========================================================================
select cron.schedule(
  'enqueue-compliance-reminders-daily',  -- job name (re-run safely)
  '0 7 * * *',                            -- daily at 07:00 UTC
  $$ select public.enqueue_compliance_reminders(); $$
);

-- =========================================================================
-- 2. Verify
-- =========================================================================
-- Should return one row with active=true.
-- select * from cron.job where jobname = 'enqueue-compliance-reminders-daily';

-- =========================================================================
-- 3. Tear down (if you need to switch to Vercel Cron only)
-- =========================================================================
-- select cron.unschedule('enqueue-compliance-reminders-daily');
