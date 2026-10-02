-- 097_gallery_event_metadata_rollback.sql — reverse 097_gallery_event_metadata.sql.
--
-- Drops the five metadata columns (their CHECK constraints and indexes drop
-- with them) and restores the ORIGINAL migration-090 action CHECK list on
-- client_access_audit.
--
-- The restored CHECK is added NOT VALID: if any rows were already written with
-- the 097 actions (gallery_metadata_updated / import_* / tour_completed), a
-- validated re-add would fail. NOT VALID keeps those historical rows in place
-- (audit rows are never deleted) while enforcing the original list for new
-- inserts.

BEGIN;

-- ── 1. Restore the original 090 action CHECK ────────────────────────────────
ALTER TABLE public.client_access_audit
  DROP CONSTRAINT IF EXISTS client_access_audit_action_check;
ALTER TABLE public.client_access_audit
  ADD CONSTRAINT client_access_audit_action_check CHECK (action IN (
    'client_created','invitation_sent','invitation_resent',
    'invitation_accepted','invitation_cancelled','membership_disabled',
    'membership_reactivated','membership_revoked','gallery_assigned',
    'gallery_unassigned','gallery_reassigned','portal_access',
    'password_reset_requested','production_access_denied')) NOT VALID;

-- ── 2. Drop the metadata columns (constraints + indexes go with them) ───────
DROP INDEX IF EXISTS public.galleries_event_size_bucket_idx;
DROP INDEX IF EXISTS public.galleries_industry_idx;
DROP INDEX IF EXISTS public.galleries_venue_type_idx;
DROP INDEX IF EXISTS public.galleries_time_of_day_idx;
DROP INDEX IF EXISTS public.galleries_event_keywords_gin_idx;

ALTER TABLE public.galleries
  DROP COLUMN IF EXISTS event_size_bucket,
  DROP COLUMN IF EXISTS industry,
  DROP COLUMN IF EXISTS venue_type,
  DROP COLUMN IF EXISTS time_of_day,
  DROP COLUMN IF EXISTS event_keywords;

COMMIT;
