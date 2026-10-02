-- ─────────────────────────────────────────────────────────────────────────────
-- 065_section_id_not_null.sql — Phase 6 Step 3
--
-- Make `images.section_id NOT NULL`. Backfill every loose image into its
-- gallery's first section (creating `סקשן 1` when the gallery has none),
-- then enforce the invariant via the two-step pattern that keeps the lock
-- window tight on the ~50 K-row images table:
--
--     ADD CONSTRAINT … CHECK (section_id IS NOT NULL) NOT VALID
--   → VALIDATE CONSTRAINT … (SHARE UPDATE EXCLUSIVE, scans without a write lock)
--   → ALTER COLUMN section_id SET NOT NULL  (cheap once the CHECK is valid;
--                                            Postgres trusts the proven CHECK)
--   → DROP the now-redundant CHECK.
--
-- Then add a deferrable AFTER INSERT trigger on `galleries` that creates a
-- default section row whenever a new gallery lands, so the invariant is
-- satisfied from row #1 forward — no SPA self-heal needed.
--
-- Harden `record_image_upload` so a NULL `p_section_id` is auto-resolved to
-- the gallery's first section. This keeps every legacy upload code path
-- working after NOT NULL is in force.
--
-- See docs/PHASE6_ARCHITECTURE_PLAN_2026-05-30.md → concern (d).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Backfill default sections for galleries that have none ───────────────
-- Create one "סקשן 1" per gallery with images-but-no-sections. Sectionless
-- galleries with zero images also get one so they're trigger-equivalent.
-- sort_order = 0 so existing sections (none, by construction here) sort after.
INSERT INTO gallery_sections (gallery_id, name, sort_order)
SELECT g.id, 'סקשן 1', 0
FROM galleries g
WHERE NOT EXISTS (
  SELECT 1 FROM gallery_sections s WHERE s.gallery_id = g.id
);

-- ── 2. Backfill images.section_id ───────────────────────────────────────────
-- Pick the gallery's lowest-sort_order section. After step 1 every gallery
-- with images has at least one section, so this UPDATE leaves zero NULLs.
UPDATE images i
SET section_id = sub.section_id
FROM (
  SELECT DISTINCT ON (s.gallery_id)
         s.gallery_id, s.id AS section_id
  FROM gallery_sections s
  ORDER BY s.gallery_id, s.sort_order, s.created_at, s.id
) sub
WHERE i.section_id IS NULL
  AND i.gallery_id = sub.gallery_id;

-- ── 3. Enforce NOT NULL via NOT VALID CHECK → VALIDATE → SET NOT NULL ───────
-- ADD CONSTRAINT … NOT VALID takes an ACCESS EXCLUSIVE lock for a metadata-
-- only write — instantaneous. VALIDATE scans the table under
-- SHARE UPDATE EXCLUSIVE (concurrent reads/writes allowed). Once VALIDATE
-- succeeds, SET NOT NULL is a metadata flip because the planner trusts the
-- already-validated CHECK and skips the full-table scan it would otherwise do.
ALTER TABLE images
  ADD CONSTRAINT images_section_id_not_null
  CHECK (section_id IS NOT NULL) NOT VALID;

ALTER TABLE images
  VALIDATE CONSTRAINT images_section_id_not_null;

ALTER TABLE images
  ALTER COLUMN section_id SET NOT NULL;

ALTER TABLE images
  DROP CONSTRAINT images_section_id_not_null;

-- Also tighten the FK: ON DELETE SET NULL would re-introduce NULLs the second
-- a section is deleted. RESTRICT forces the SPA to reparent images first,
-- which matches the "delete section" UI flow that already unsets section_id
-- before delete — that flow needs to switch to reparenting, tracked in step 5.
ALTER TABLE images
  DROP CONSTRAINT IF EXISTS images_section_id_fkey;

ALTER TABLE images
  ADD CONSTRAINT images_section_id_fkey
  FOREIGN KEY (section_id) REFERENCES gallery_sections(id)
  ON DELETE RESTRICT;

-- ── 4. UNIQUE(gallery_id, slug) on gallery_sections ─────────────────────────
-- Migration 054 already created `gallery_sections_gallery_slug_idx` as a
-- regular UNIQUE INDEX over the full (gallery_id, slug) pair. Because
-- btree UNIQUE treats NULLs as distinct, multiple NULL-slug rows per gallery
-- coexist fine — that's the partial-unique semantic the brief asks for.
-- Verified empirically (67/67 existing sections have NULL slug, zero
-- duplicate non-null pairs). Re-declaring it would error; instead, we make
-- the index name available as a CONSTRAINT so future ON CONFLICT clauses can
-- reference it by name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.gallery_sections'::regclass
      AND conname  = 'gallery_sections_gallery_slug_unique'
  ) THEN
    ALTER TABLE gallery_sections
      ADD CONSTRAINT gallery_sections_gallery_slug_unique
      UNIQUE USING INDEX gallery_sections_gallery_slug_idx;
  END IF;
END $$;

-- ── 5. AFTER INSERT trigger: every new gallery starts with one section ──────
-- SECURITY DEFINER so the trigger can write the row regardless of the caller's
-- RLS context (galleries.INSERT runs under the photographer, who already owns
-- the row — fine, but other callers like RPCs may run as service_role).
CREATE OR REPLACE FUNCTION ensure_default_section_for_gallery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO gallery_sections (gallery_id, name, sort_order)
  VALUES (NEW.id, 'סקשן 1', 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS galleries_ensure_default_section ON galleries;
CREATE TRIGGER galleries_ensure_default_section
  AFTER INSERT ON galleries
  FOR EACH ROW
  EXECUTE FUNCTION ensure_default_section_for_gallery();

-- ── 6. Harden record_image_upload to never receive NULL section_id ──────────
-- After step 3, an upload with NULL p_section_id would fail the NOT NULL.
-- Resolve NULL to the gallery's first section inside the RPC so legacy
-- callers (e.g. the desktop app, the current SPA) keep working without a
-- client release. The trigger guarantees one exists.
CREATE OR REPLACE FUNCTION public.record_image_upload(
  p_gallery_id           uuid,
  p_filename             text,
  p_web_preview_path     text,
  p_thumbnail_path       text,
  p_original_path        text,
  p_original_size        bigint  DEFAULT NULL,
  p_section_id           uuid    DEFAULT NULL,
  p_sort_order           integer DEFAULT 0,
  p_public_thumb_present boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_business_id UUID;
  v_owner_user  UUID;
  v_balance     INTEGER;
  v_image_id    UUID;
  v_section_id  UUID := p_section_id;
BEGIN
  SELECT g.business_id, b.user_id
    INTO v_business_id, v_owner_user
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'gallery_not_found';
  END IF;
  IF v_owner_user IS NULL OR v_owner_user <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Resolve NULL section to the gallery's first section. Post-trigger every
  -- gallery has at least one; this SELECT is index-backed
  -- (gallery_sections_gallery_order_idx).
  IF v_section_id IS NULL THEN
    SELECT s.id INTO v_section_id
      FROM gallery_sections s
     WHERE s.gallery_id = p_gallery_id
     ORDER BY s.sort_order, s.created_at, s.id
     LIMIT 1;
    IF v_section_id IS NULL THEN
      RAISE EXCEPTION 'no_section_for_gallery';
    END IF;
  END IF;

  UPDATE business_tokens
     SET balance           = balance - 1,
         lifetime_consumed = lifetime_consumed + 1,
         updated_at        = now()
   WHERE business_id = v_business_id AND balance > 0
   RETURNING balance INTO v_balance;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient_tokens';
  END IF;

  INSERT INTO images (
    gallery_id, filename,
    web_preview_path, thumbnail_path, original_path,
    original_uploaded, original_size_bytes,
    section_id, sort_order, is_top_pick,
    public_thumb_present
  ) VALUES (
    p_gallery_id, p_filename,
    p_web_preview_path, p_thumbnail_path, p_original_path,
    p_original_path IS NOT NULL, p_original_size,
    v_section_id, COALESCE(p_sort_order, 0), false,
    COALESCE(p_public_thumb_present, false)
  )
  RETURNING id INTO v_image_id;

  INSERT INTO token_ledger (business_id, delta, reason, ref_id, metadata)
  VALUES (v_business_id, -1, 'image_upload', v_image_id,
          jsonb_build_object('gallery_id', p_gallery_id, 'filename', p_filename));

  UPDATE galleries SET image_count = COALESCE(image_count, 0) + 1
   WHERE id = p_gallery_id;

  RETURN v_image_id;
END;
$function$;

COMMIT;

-- ── Post-condition verification ─────────────────────────────────────────────
-- Run with the migration to fail loud if any invariant was missed.
DO $$
DECLARE
  v_loose_images           integer;
  v_sectionless_galleries  integer;
  v_total_sections         integer;
BEGIN
  SELECT count(*) INTO v_loose_images FROM images WHERE section_id IS NULL;
  SELECT count(*) INTO v_sectionless_galleries
    FROM galleries g
   WHERE NOT EXISTS (SELECT 1 FROM gallery_sections s WHERE s.gallery_id = g.id);
  SELECT count(*) INTO v_total_sections FROM gallery_sections;

  RAISE NOTICE '[065] loose_images=% sectionless_galleries=% total_sections=%',
    v_loose_images, v_sectionless_galleries, v_total_sections;

  IF v_loose_images <> 0 THEN
    RAISE EXCEPTION 'Phase 6 step 3 FAILED: % loose images remain', v_loose_images;
  END IF;
  IF v_sectionless_galleries <> 0 THEN
    RAISE EXCEPTION 'Phase 6 step 3 FAILED: % galleries still have no section',
      v_sectionless_galleries;
  END IF;
END $$;
