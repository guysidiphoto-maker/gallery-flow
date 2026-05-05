-- ─────────────────────────────────────────────────────────────────────────────
-- 048_scheduled_reapers.sql
-- Schedule the cheap, pure-SQL housekeeping jobs via pg_cron. Edge-function
-- schedules (e.g. storage-reaper) are configured separately through the
-- Supabase Dashboard's Cron UI — DB-side scheduling of HTTP calls requires
-- service-role secrets that aren't great to keep in plain SQL.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent: drop any prior schedule with this name before re-creating.
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'unlock-tokens-gc';

-- Purge expired gallery_unlock_tokens once an hour. Function lives in
-- migration 041; called as the scheduling user (postgres).
SELECT cron.schedule(
  'unlock-tokens-gc',
  '17 * * * *',
  $$ SELECT purge_expired_unlock_tokens(); $$
);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- TODO (manual, NOT run by this migration):
--
-- In Supabase Dashboard → Database → Cron Jobs, schedule the storage reaper:
--
--   Name:     storage-reaper-tick
--   Schedule: */10 * * * *
--   Method:   POST
--   URL:      <project-url>/functions/v1/storage-reaper
--   Headers:  Authorization: Bearer <service-role-key>
--             Content-Type: application/json
--   Body:     {}
--
-- The function (supabase/functions/storage-reaper/index.ts) is idempotent;
-- a missed tick is harmless, the queue just builds up and the next tick
-- catches up.
-- ─────────────────────────────────────────────────────────────────────────────
