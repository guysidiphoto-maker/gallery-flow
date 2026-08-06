-- 097_gallery_event_metadata.sql — Overnight 2026-07-24, contract C4 + C9.
--
-- Part 1: ADDITIVE event-metadata columns on `galleries` for the owner-side
-- tender library. All classification columns are nullable — NULL means
-- "Unclassified" and is a first-class state. NO backfill: we NEVER fabricate
-- values for existing galleries; the owner enriches gradually through the UI.
--
--   event_size_bucket  text NULL  ('intimate','small','medium','large','massive')
--                      ≈ <50, 50–150, 150–500, 500–2000, 2000+ attendees
--   industry           text NULL  (free text, ≤60 chars)
--   venue_type         text NULL  ('indoor','outdoor','mixed')
--   time_of_day        text NULL  ('day','night','mixed')
--   event_keywords     text[] NOT NULL DEFAULT '{}'  (≤20 entries; per-keyword
--                      length ≤40 is enforced server-side in /api/gallery-metadata
--                      — a per-element CHECK would need a helper function)
--
-- Part 2 (contract C9, single owner of this change): extend the
-- client_access_audit `action` CHECK from migration 090 ADDITIVELY —
-- drop + re-add with the FULL original list plus the new actions:
--   gallery_metadata_updated, import_job_created, import_job_started,
--   import_job_completed, import_job_cancelled, import_collection_imported,
--   tour_completed
--
-- Idempotent (IF NOT EXISTS / DROP-then-ADD), additive only.
-- NOT APPLIED by this program (QA project only, manually).
-- Paired rollback: 097_gallery_event_metadata_rollback.sql

BEGIN;

-- ── 1. New columns (additive, nullable = Unclassified) ───────────────────────
ALTER TABLE public.galleries
  ADD COLUMN IF NOT EXISTS event_size_bucket text,
  ADD COLUMN IF NOT EXISTS industry          text,
  ADD COLUMN IF NOT EXISTS venue_type        text,
  ADD COLUMN IF NOT EXISTS time_of_day       text,
  ADD COLUMN IF NOT EXISTS event_keywords    text[] NOT NULL DEFAULT '{}';

-- ── 2. Domain constraints (guarded, same pattern as migration 064) ──────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'galleries_event_size_bucket_check'
  ) THEN
    ALTER TABLE public.galleries
      ADD CONSTRAINT galleries_event_size_bucket_check
      CHECK (event_size_bucket IS NULL
             OR event_size_bucket IN ('intimate','small','medium','large','massive'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'galleries_industry_len_check'
  ) THEN
    ALTER TABLE public.galleries
      ADD CONSTRAINT galleries_industry_len_check
      CHECK (industry IS NULL OR char_length(industry) <= 60);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'galleries_venue_type_check'
  ) THEN
    ALTER TABLE public.galleries
      ADD CONSTRAINT galleries_venue_type_check
      CHECK (venue_type IS NULL OR venue_type IN ('indoor','outdoor','mixed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'galleries_time_of_day_check'
  ) THEN
    ALTER TABLE public.galleries
      ADD CONSTRAINT galleries_time_of_day_check
      CHECK (time_of_day IS NULL OR time_of_day IN ('day','night','mixed'));
  END IF;

  -- Cap the keyword array size. Per-keyword length (≤40) is validated by the
  -- API layer; a per-element SQL CHECK would require an IMMUTABLE helper fn.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'galleries_event_keywords_cap_check'
  ) THEN
    ALTER TABLE public.galleries
      ADD CONSTRAINT galleries_event_keywords_cap_check
      CHECK (COALESCE(array_length(event_keywords, 1), 0) <= 20);
  END IF;
END $$;

-- ── 3. Filter indexes for the tender/search surfaces ────────────────────────
-- Partial: the vast majority of rows stay NULL (Unclassified) — index only
-- the classified minority the filters actually target.
CREATE INDEX IF NOT EXISTS galleries_event_size_bucket_idx
  ON public.galleries (event_size_bucket) WHERE event_size_bucket IS NOT NULL;
CREATE INDEX IF NOT EXISTS galleries_industry_idx
  ON public.galleries (industry) WHERE industry IS NOT NULL;
CREATE INDEX IF NOT EXISTS galleries_venue_type_idx
  ON public.galleries (venue_type) WHERE venue_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS galleries_time_of_day_idx
  ON public.galleries (time_of_day) WHERE time_of_day IS NOT NULL;
CREATE INDEX IF NOT EXISTS galleries_event_keywords_gin_idx
  ON public.galleries USING gin (event_keywords);

-- ── 4. Extend client_access_audit action CHECK (contract C9) ────────────────
-- The 090 CHECK was declared inline on the column, so its auto-generated name
-- is client_access_audit_action_check. DROP-then-ADD keeps this idempotent;
-- the new list is a strict superset of 090's, so existing rows always pass.
ALTER TABLE public.client_access_audit
  DROP CONSTRAINT IF EXISTS client_access_audit_action_check;
ALTER TABLE public.client_access_audit
  ADD CONSTRAINT client_access_audit_action_check CHECK (action IN (
    -- original list from migration 090 (unchanged, full):
    'client_created','invitation_sent','invitation_resent',
    'invitation_accepted','invitation_cancelled','membership_disabled',
    'membership_reactivated','membership_revoked','gallery_assigned',
    'gallery_unassigned','gallery_reassigned','portal_access',
    'password_reset_requested','production_access_denied',
    -- added by 097 (contract C9):
    'gallery_metadata_updated',
    'import_job_created','import_job_started','import_job_completed',
    'import_job_cancelled','import_collection_imported',
    'tour_completed'));

COMMIT;

-- Verification (manual, after apply):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='galleries' AND column_name IN
--       ('event_size_bucket','industry','venue_type','time_of_day','event_keywords');
--   -- All existing rows stay Unclassified (no backfill):
--   SELECT count(*) FROM galleries WHERE event_size_bucket IS NOT NULL;  -- 0 right after apply
--   -- New audit action accepted:
--   --   INSERT with action='gallery_metadata_updated' via append_client_audit succeeds.
