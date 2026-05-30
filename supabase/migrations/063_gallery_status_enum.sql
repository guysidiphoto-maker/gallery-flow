-- ─────────────────────────────────────────────────────────────────────────────
-- 063_gallery_status_enum.sql
--
-- Phase 6, step 1.
--   docs/PHASE6_ARCHITECTURE_PLAN_2026-05-30.md  (concern e)
--   drafted in supabase/migrations/_phase6_drafts/001_gallery_status_enum.sql
--
-- Promotes galleries.status from free-form TEXT (with a stale CHECK constraint)
-- to a real Postgres enum: gallery_status AS ENUM ('draft','live','archived').
--
-- Why this is safe:
--   * Pre-flight on production (2026-05-30) showed distribution
--       live=79, publishing=15, failed=5, draft=3
--     and zero rows with the literal 'published'. The web app's
--     `status === 'live' || status === 'published'` defense was a leftover
--     from the desktop era — the legacy value never landed in this DB.
--   * The anon SELECT path on galleries is gated by `status = 'live'`. 'live'
--     stays a valid value in the new enum, so RLS continues to pass.
--   * 'publishing' and 'failed' are transient pipeline states that don't
--     appear in the user-facing vocabulary the architecture plan committed
--     to ('draft','live','archived'). We fold both into 'draft' and preserve
--     the diagnostic in a new `last_publish_error TEXT` column so support
--     can still triage the previously-stuck rows.
--   * Every existing RLS policy that filters on galleries.status is dropped
--     before the ALTER TYPE (Postgres won't alter a column referenced by a
--     policy) and re-created against the enum in the same transaction. The
--     gate semantics ('live' is publicly visible, everything else is not)
--     are unchanged.
--
-- Re-runnability: each step is IF NOT EXISTS / DROP IF EXISTS / idempotent
-- UPDATEs, but the migration is intended to run exactly once.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Diagnostic column for what 'publishing'/'failed' used to carry ────
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS last_publish_error TEXT;

-- ── 2. Create the enum ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gallery_status') THEN
    CREATE TYPE gallery_status AS ENUM (
      'draft',     -- editing / not visible to clients (also: transient pipeline parking)
      'live',      -- publicly visible at the slug
      'archived'   -- soft-deleted; retained for restore, not visible
    );
  END IF;
END$$;

-- ── 3. Drop legacy CHECK constraint (forbids the enum cast otherwise) ────
ALTER TABLE galleries
  DROP CONSTRAINT IF EXISTS galleries_status_check;

-- ── 4. Drop ALL policies that reference galleries.status ─────────────────
-- Postgres refuses to ALTER TYPE on a column referenced by a policy. The
-- policies are recreated against the enum in step 7.
DROP POLICY IF EXISTS galleries_public_live_select         ON galleries;
DROP POLICY IF EXISTS galleries_demo_insert                ON galleries;
DROP POLICY IF EXISTS images_public_live_select            ON images;
DROP POLICY IF EXISTS stories_public_live_select           ON stories;
DROP POLICY IF EXISTS gallery_sections_public_live_select  ON gallery_sections;
DROP POLICY IF EXISTS client_page_settings_public          ON client_page_settings;
DROP POLICY IF EXISTS gallery_download_log_public_insert   ON gallery_download_log;
DROP POLICY IF EXISTS gallery_favorites_public_delete      ON gallery_favorites;
DROP POLICY IF EXISTS gallery_favorites_public_insert      ON gallery_favorites;
DROP POLICY IF EXISTS hidden_images_anon_delete            ON gallery_hidden_images;
DROP POLICY IF EXISTS hidden_images_anon_write             ON gallery_hidden_images;
DROP POLICY IF EXISTS hidden_images_public_read            ON gallery_hidden_images;
DROP POLICY IF EXISTS image_vendor_tags_public_read        ON image_vendor_tags;
-- storage.objects policies that read galleries.status:
DROP POLICY IF EXISTS gallery_storage_public_read          ON storage.objects;
DROP POLICY IF EXISTS thumbs_public_anon_read              ON storage.objects;

-- ── 5. Normalize legacy row values BEFORE the type swap ──────────────────
--   'published' (desktop legacy, currently 0 rows in prod) → 'live'
--   'publishing','failed' (transient pipeline states)      → 'draft'
-- WARNING: anything that is NOT one of the target enum values is coerced
-- to 'draft' as a safety net. After the prod pre-flight this should affect
-- zero rows; the clause exists so the cast below cannot fail on a surprise.
UPDATE galleries
SET status = 'live'
WHERE status = 'published';

UPDATE galleries
SET status              = 'draft',
    last_publish_error  = COALESCE(
      last_publish_error,
      'phase6 backfill: previous status was ''publishing'' (transient pipeline state, not user-facing)'
    )
WHERE status = 'publishing';

UPDATE galleries
SET status              = 'draft',
    last_publish_error  = COALESCE(
      last_publish_error,
      'phase6 backfill: previous status was ''failed'' (publish pipeline error, not user-facing)'
    )
WHERE status = 'failed';

UPDATE galleries
SET status              = 'draft',
    last_publish_error  = COALESCE(
      last_publish_error,
      'phase6 backfill: unknown legacy status normalized to draft'
    )
WHERE status IS NULL
   OR status NOT IN ('draft', 'live', 'archived');

-- ── 6. Swap the column type ──────────────────────────────────────────────
ALTER TABLE galleries
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE galleries
  ALTER COLUMN status TYPE gallery_status
  USING status::gallery_status;

ALTER TABLE galleries
  ALTER COLUMN status SET DEFAULT 'draft'::gallery_status;

ALTER TABLE galleries
  ALTER COLUMN status SET NOT NULL;

-- ── 7. Re-create the RLS policies against the enum ───────────────────────
CREATE POLICY galleries_public_live_select ON galleries
  FOR SELECT TO anon
  USING (status = 'live'::gallery_status);

CREATE POLICY galleries_demo_insert ON galleries
  FOR INSERT TO anon
  WITH CHECK (
    demo_expires_at IS NOT NULL
    AND demo_expires_at > now()
    AND status = 'live'::gallery_status
  );

CREATE POLICY images_public_live_select ON images
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = images.gallery_id
        AND g.status = 'live'::gallery_status
    )
  );

CREATE POLICY stories_public_live_select ON stories
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = stories.gallery_id
        AND g.status = 'live'::gallery_status
    )
  );

CREATE POLICY gallery_sections_public_live_select ON gallery_sections
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_sections.gallery_id
        AND g.status = 'live'::gallery_status
    )
  );

CREATE POLICY client_page_settings_public ON client_page_settings
  FOR ALL TO anon
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN galleries g ON g.client_id = c.id
      WHERE c.id = client_page_settings.client_id
        AND g.status = 'live'::gallery_status
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN galleries g ON g.client_id = c.id
      WHERE c.id = client_page_settings.client_id
        AND g.status = 'live'::gallery_status
    )
  );

CREATE POLICY gallery_download_log_public_insert ON gallery_download_log
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_download_log.gallery_id
        AND g.status = 'live'::gallery_status
    )
  );

CREATE POLICY gallery_favorites_public_delete ON gallery_favorites
  FOR DELETE TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_favorites.gallery_id
        AND g.status = 'live'::gallery_status
    )
  );

CREATE POLICY gallery_favorites_public_insert ON gallery_favorites
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_favorites.gallery_id
        AND g.status = 'live'::gallery_status
    )
  );

CREATE POLICY hidden_images_anon_delete ON gallery_hidden_images
  FOR DELETE TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_hidden_images.gallery_id
        AND g.status = 'live'::gallery_status
    )
  );

CREATE POLICY hidden_images_anon_write ON gallery_hidden_images
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_hidden_images.gallery_id
        AND g.status = 'live'::gallery_status
    )
  );

CREATE POLICY hidden_images_public_read ON gallery_hidden_images
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_hidden_images.gallery_id
        AND g.status = 'live'::gallery_status
    )
  );

CREATE POLICY image_vendor_tags_public_read ON image_vendor_tags
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = image_vendor_tags.gallery_id
        AND g.status = 'live'::gallery_status
    )
  );

-- storage.objects: anon reads of gallery image originals are gated by the
-- gallery being live. Folder convention: <business_id>/<gallery_id>/<...>.
CREATE POLICY gallery_storage_public_read ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])
    AND EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
        AND g.status = 'live'::gallery_status
    )
  );

-- storage.objects: anon reads of pre-generated public thumbnails.
CREATE POLICY thumbs_public_anon_read ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'gallery-images-thumbs-public'::text
    AND EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
        AND g.status = 'live'::gallery_status
    )
  );

-- ── 8. Targeted partial index for the anon listing path ──────────────────
CREATE INDEX IF NOT EXISTS galleries_status_live_idx
  ON galleries (status)
  WHERE status = 'live'::gallery_status;

COMMIT;

-- ── Verification (run manually after apply) ──────────────────────────────
-- Expected distribution after this migration on the 2026-05-30 snapshot:
--   live=79, draft=23, archived=0
--
--   SELECT status, count(*) FROM galleries GROUP BY status ORDER BY status;
--
-- Expected backfill annotations (15 'publishing' + 5 'failed' rows):
--   SELECT count(*) FROM galleries WHERE last_publish_error IS NOT NULL;
--   -- → 20
--
-- Confirm RLS still gates the public path:
--   SET ROLE anon;
--   SELECT count(*) FROM galleries;       -- → 79 (live only)
--   RESET ROLE;
--
-- ── Rollback sketch (manual, not automated) ──────────────────────────────
-- BEGIN;
--   ALTER TABLE galleries ALTER COLUMN status DROP DEFAULT;
--   ALTER TABLE galleries ALTER COLUMN status TYPE TEXT USING status::text;
--   ALTER TABLE galleries ALTER COLUMN status SET DEFAULT 'draft';
--   ALTER TABLE galleries ADD CONSTRAINT galleries_status_check
--     CHECK (status IN ('draft','publishing','live','failed'));
--   DROP INDEX IF EXISTS galleries_status_live_idx;
--   DROP TYPE gallery_status;
-- COMMIT;
-- NOTE: rollback does NOT restore 'publishing'/'failed' row values — they
-- are folded into 'draft' irreversibly. Support can still see the original
-- state in `last_publish_error`.
