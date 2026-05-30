-- ─────────────────────────────────────────────────────────────────────────────
-- _phase6_drafts/004_gallery_revisions.sql
--
-- PROPOSAL — NOT WIRED INTO THE MIGRATION SEQUENCE.
-- See docs/PHASE6_ARCHITECTURE_PLAN_2026-05-30.md, concern (b).
--
-- Introduces the draft/publish split. Anon clients no longer see live
-- in-flight edits; they read whatever revision the photographer last
-- published.
--
--   - gallery_revisions: immutable snapshot table (settings + image manifest)
--   - galleries.published_revision_id: pointer to the live snapshot
--   - gallery_publish(p_gallery_id): atomic publish action
--   - gallery_public_view(p_slug): the anon read path; returns the snapshot
--
-- Anon RLS on galleries/images/gallery_sections is NOT removed in this
-- migration. The cutover happens in a separate cleanup pass once the SPA's
-- public viewer is reading exclusively through gallery_public_view.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Revisions table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gallery_revisions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gallery_id   UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  -- Frozen settings: promoted columns + presentation_settings + section tree.
  -- Image manifest is stored separately as an ordered id[] to keep the row
  -- small even for galleries with thousands of images.
  settings     JSONB NOT NULL,
  sections     JSONB NOT NULL,    -- [{id, name, slug, sort_order}]
  image_ids    UUID[] NOT NULL,   -- ordered by published sort_order
  top_pick_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES auth.users(id),
  note         TEXT
);

CREATE INDEX IF NOT EXISTS gallery_revisions_gallery_idx
  ON gallery_revisions (gallery_id, created_at DESC);

ALTER TABLE gallery_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY gallery_revisions_owner_select ON gallery_revisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_revisions.gallery_id
        AND g.business_id = current_business_id()
    )
  );

-- No anon policy on the raw table; anon reads the snapshot via
-- gallery_public_view() (SECURITY DEFINER, filtered to the live revision).

-- ── 2. Pointer column on galleries ────────────────────────────────────────
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS published_revision_id UUID
    REFERENCES gallery_revisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS galleries_published_revision_idx
  ON galleries (published_revision_id)
  WHERE published_revision_id IS NOT NULL;

-- ── 3. Atomic publish RPC ─────────────────────────────────────────────────
-- Builds a new revision row from the gallery's current live state and points
-- published_revision_id at it in one transaction.
CREATE OR REPLACE FUNCTION gallery_publish(p_gallery_id UUID, p_note TEXT DEFAULT NULL)
RETURNS gallery_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_settings    JSONB;
  v_sections    JSONB;
  v_image_ids   UUID[];
  v_top_picks   UUID[];
  v_revision    gallery_revisions;
BEGIN
  -- Ownership check.
  SELECT business_id INTO v_business_id FROM galleries WHERE id = p_gallery_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'gallery_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_business_id <> current_business_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Serialize the live state. Settings union = promoted columns + JSONB.
  SELECT jsonb_build_object(
    'access_type',         g.access_type,
    'event_date',          g.event_date,
    'event_location',      g.event_location,
    'event_type',          g.event_type,
    'downloads_enabled',   g.downloads_enabled,
    'download_quality',    g.download_quality,
    'cover_image_id',      g.cover_image_id,
    'face_index_enabled',  g.face_index_enabled,
    'face_privacy_mode',   g.face_privacy_mode,
    'presentation',        g.presentation_settings
  )
  INTO v_settings
  FROM galleries g WHERE g.id = p_gallery_id;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('id', s.id, 'name', s.name,
                              'slug', s.slug, 'sort_order', s.sort_order)
           ORDER BY s.sort_order
         ), '[]'::jsonb)
  INTO v_sections
  FROM gallery_sections s WHERE s.gallery_id = p_gallery_id;

  SELECT COALESCE(array_agg(i.id ORDER BY i.sort_order, i.id), ARRAY[]::UUID[])
  INTO v_image_ids
  FROM images i WHERE i.gallery_id = p_gallery_id;

  SELECT COALESCE(array_agg(i.id ORDER BY i.sort_order, i.id), ARRAY[]::UUID[])
  INTO v_top_picks
  FROM images i WHERE i.gallery_id = p_gallery_id AND i.is_top_pick;

  -- Insert revision, then point galleries at it. Single transaction.
  INSERT INTO gallery_revisions
    (gallery_id, settings, sections, image_ids, top_pick_ids, created_by, note)
  VALUES
    (p_gallery_id, v_settings, v_sections, v_image_ids, v_top_picks,
     auth.uid(), p_note)
  RETURNING * INTO v_revision;

  UPDATE galleries
  SET published_revision_id = v_revision.id,
      status = 'live'::gallery_status,
      published_at = now()
  WHERE id = p_gallery_id;

  RETURN v_revision;
END;
$$;

REVOKE ALL ON FUNCTION gallery_publish(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gallery_publish(UUID, TEXT) TO authenticated;

-- ── 4. Anon read path — returns the published snapshot, not live row ──────
-- Returns a single row with the snapshot's settings + ordered image manifest.
-- The Viewer joins the manifest back to live images for the storage paths.
CREATE OR REPLACE FUNCTION gallery_public_view(p_slug TEXT)
RETURNS TABLE (
  gallery_id    UUID,
  business_id   UUID,
  name          TEXT,
  slug          TEXT,
  settings      JSONB,
  sections      JSONB,
  image_ids     UUID[],
  top_pick_ids  UUID[],
  published_at  TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    g.id,
    g.business_id,
    g.name,
    g.slug,
    r.settings,
    r.sections,
    r.image_ids,
    r.top_pick_ids,
    g.published_at
  FROM galleries g
  JOIN gallery_revisions r ON r.id = g.published_revision_id
  WHERE g.slug = p_slug
    AND g.status = 'live'::gallery_status
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION gallery_public_view(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gallery_public_view(TEXT) TO anon, authenticated;

-- ── 5. Backfill: write one revision for every currently-live gallery ──────
INSERT INTO gallery_revisions (gallery_id, settings, sections, image_ids, top_pick_ids, note)
SELECT
  g.id,
  jsonb_build_object(
    'access_type',         g.access_type,
    'event_date',          g.event_date,
    'event_location',      g.event_location,
    'event_type',          g.event_type,
    'downloads_enabled',   g.downloads_enabled,
    'download_quality',    g.download_quality,
    'cover_image_id',      g.cover_image_id,
    'face_index_enabled',  g.face_index_enabled,
    'face_privacy_mode',   g.face_privacy_mode,
    'presentation',        g.presentation_settings
  ),
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('id', s.id, 'name', s.name,
                         'slug', s.slug, 'sort_order', s.sort_order)
      ORDER BY s.sort_order
    )
    FROM gallery_sections s WHERE s.gallery_id = g.id
  ), '[]'::jsonb),
  COALESCE((
    SELECT array_agg(i.id ORDER BY i.sort_order, i.id)
    FROM images i WHERE i.gallery_id = g.id
  ), ARRAY[]::UUID[]),
  COALESCE((
    SELECT array_agg(i.id ORDER BY i.sort_order, i.id)
    FROM images i WHERE i.gallery_id = g.id AND i.is_top_pick
  ), ARRAY[]::UUID[]),
  'phase 6 backfill — snapshot of pre-revisions live state'
FROM galleries g
WHERE g.status = 'live'::gallery_status
  AND g.published_revision_id IS NULL;

-- Point each backfilled gallery at its new snapshot.
UPDATE galleries g
SET published_revision_id = (
  SELECT r.id FROM gallery_revisions r
  WHERE r.gallery_id = g.id
  ORDER BY r.created_at DESC
  LIMIT 1
)
WHERE g.status = 'live'::gallery_status
  AND g.published_revision_id IS NULL;

COMMIT;

-- ── Post-condition self-checks ────────────────────────────────────────────
--   SELECT count(*) FROM galleries
--   WHERE status = 'live' AND published_revision_id IS NULL;        -- expect 0
--
--   SELECT count(*) FROM gallery_revisions;                          -- expect ≥ n_live
