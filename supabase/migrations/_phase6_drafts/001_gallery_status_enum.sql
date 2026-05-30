-- ─────────────────────────────────────────────────────────────────────────────
-- _phase6_drafts/001_gallery_status_enum.sql
--
-- PROPOSAL — NOT WIRED INTO THE MIGRATION SEQUENCE.
-- See docs/PHASE6_ARCHITECTURE_PLAN_2026-05-30.md, concern (e).
--
-- Promotes galleries.status from free-form TEXT to a real Postgres enum.
-- Normalizes legacy 'published' rows (desktop-era) to canonical 'live'.
-- Folds 'failed' into 'draft' + new diagnostic column.
-- Rewrites every RLS policy that compares status as a string.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Pre-flight sanity ─────────────────────────────────────────────────────
-- Run this manually before applying. Should return ONLY values in the
-- target set {draft, publishing, live, published, failed}. Anything else
-- aborts the migration so we don't lose data on the CAST.
--
--   SELECT status, count(*) FROM galleries GROUP BY status;

-- ── 1. Create the enum ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gallery_status') THEN
    CREATE TYPE gallery_status AS ENUM (
      'draft',       -- not yet published; photographer is editing
      'publishing',  -- transitional, asset pipeline running
      'live',        -- publicly visible at the slug
      'archived'     -- soft-deleted; not visible, retained for restore
    );
  END IF;
END$$;

-- ── 2. Diagnostic column for what 'failed' used to carry ──────────────────
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS last_publish_error TEXT;

-- ── 3. Drop the legacy CHECK constraint (it forbids the enum cast) ────────
ALTER TABLE galleries
  DROP CONSTRAINT IF EXISTS galleries_status_check;

-- ── 4. Cast the column, normalizing legacy values in the same statement ───
-- 'published' (desktop legacy) → 'live'
-- 'failed'    (transient pipeline) → 'draft' + last_publish_error preserved
UPDATE galleries
SET last_publish_error = COALESCE(last_publish_error, 'legacy: status was failed before phase 6')
WHERE status = 'failed';

ALTER TABLE galleries
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE galleries
  ALTER COLUMN status TYPE gallery_status
  USING (
    CASE status
      WHEN 'published' THEN 'live'::gallery_status
      WHEN 'failed'    THEN 'draft'::gallery_status
      ELSE status::gallery_status
    END
  );

ALTER TABLE galleries
  ALTER COLUMN status SET DEFAULT 'draft'::gallery_status;

ALTER TABLE galleries
  ALTER COLUMN status SET NOT NULL;

-- ── 5. Rewrite RLS policies that compared status as a string ──────────────
-- Public read on galleries.
DROP POLICY IF EXISTS "Public read galleries" ON galleries;
CREATE POLICY galleries_public_live_select ON galleries
  FOR SELECT TO anon
  USING (status = 'live'::gallery_status);

-- Public read on images (mirrors galleries gate).
DROP POLICY IF EXISTS "Public read images" ON images;
CREATE POLICY images_public_live_select ON images
  FOR SELECT TO anon
  USING (
    gallery_id IN (
      SELECT id FROM galleries WHERE status = 'live'::gallery_status
    )
  );

-- Public read on stories.
DROP POLICY IF EXISTS "Public read stories" ON stories;
CREATE POLICY stories_public_live_select ON stories
  FOR SELECT TO anon
  USING (
    gallery_id IN (
      SELECT id FROM galleries WHERE status = 'live'::gallery_status
    )
  );

-- gallery_sections policy from migration 010 — was already 'live'-only, but
-- recast onto the enum for type consistency.
DROP POLICY IF EXISTS gallery_sections_public_live_select ON gallery_sections;
CREATE POLICY gallery_sections_public_live_select ON gallery_sections
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_sections.gallery_id
        AND g.status = 'live'::gallery_status
    )
  );

-- ── 6. Index for the most common predicate (anon listing) ─────────────────
CREATE INDEX IF NOT EXISTS galleries_status_live_idx
  ON galleries (status)
  WHERE status = 'live'::gallery_status;

COMMIT;

-- ── Rollback sketch (manual, not automated) ───────────────────────────────
-- BEGIN;
--   ALTER TABLE galleries ALTER COLUMN status TYPE TEXT USING status::TEXT;
--   ALTER TABLE galleries ALTER COLUMN status SET DEFAULT 'draft';
--   ALTER TABLE galleries ADD CONSTRAINT galleries_status_check
--     CHECK (status IN ('draft','publishing','live','failed'));
--   DROP TYPE gallery_status;
-- COMMIT;
