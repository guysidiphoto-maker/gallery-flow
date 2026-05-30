-- ─────────────────────────────────────────────────────────────────────────────
-- _phase6_drafts/003_section_id_not_null.sql
--
-- PROPOSAL — NOT WIRED INTO THE MIGRATION SEQUENCE.
-- See docs/PHASE6_ARCHITECTURE_PLAN_2026-05-30.md, concern (d).
--
-- Final backfill of images.section_id, addition of NOT NULL, and the
-- UNIQUE(gallery_id, slug) invariant on gallery_sections. Wraps everything
-- in one transaction with a short SHARE lock on images so a concurrent
-- upload can't insert a NULL section_id row between the backfill and the
-- ALTER COLUMN.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. gallery_sections needs is_default + slug invariants ────────────────
ALTER TABLE gallery_sections
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- slug column already exists per migration 054. Ensure it's NOT NULL with
-- a deterministic default for the default section.
ALTER TABLE gallery_sections
  ALTER COLUMN slug SET DEFAULT 'section-' || substr(gen_random_uuid()::text, 1, 8);

-- One UNIQUE(gallery_id, slug). NULL slugs blocked.
UPDATE gallery_sections
SET slug = 'section-' || substr(id::text, 1, 8)
WHERE slug IS NULL OR slug = '';

ALTER TABLE gallery_sections
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE gallery_sections
  ADD CONSTRAINT gallery_sections_gallery_slug_unique
  UNIQUE (gallery_id, slug);

-- Only one default section per gallery.
CREATE UNIQUE INDEX IF NOT EXISTS gallery_sections_one_default_per_gallery
  ON gallery_sections (gallery_id)
  WHERE is_default;

-- ── 2. Create a default section for every gallery missing one ─────────────
INSERT INTO gallery_sections (gallery_id, name, slug, sort_order, is_default)
SELECT g.id, 'Default', 'default', 0, true
FROM galleries g
WHERE NOT EXISTS (
  SELECT 1 FROM gallery_sections s
  WHERE s.gallery_id = g.id AND s.is_default
);

-- ── 3. Lock images while we backfill and set NOT NULL ─────────────────────
LOCK TABLE images IN SHARE MODE;

-- Reassign NULL-section images to their gallery's default section.
UPDATE images i
SET section_id = (
  SELECT s.id FROM gallery_sections s
  WHERE s.gallery_id = i.gallery_id AND s.is_default
  LIMIT 1
)
WHERE i.section_id IS NULL;

-- ── 4. Enforce the invariant ──────────────────────────────────────────────
ALTER TABLE images
  ALTER COLUMN section_id SET NOT NULL;

-- The original FK was ON DELETE SET NULL — that conflicts with NOT NULL.
-- Switch to ON DELETE RESTRICT; the SPA must reparent images to another
-- section before deleting the section row.
ALTER TABLE images
  DROP CONSTRAINT IF EXISTS images_section_id_fkey;

ALTER TABLE images
  ADD CONSTRAINT images_section_id_fkey
  FOREIGN KEY (section_id)
  REFERENCES gallery_sections(id)
  ON DELETE RESTRICT;

-- ── 5. Auto-create default section on every new gallery ───────────────────
-- Removes the need for SPA code to remember to create one.
CREATE OR REPLACE FUNCTION ensure_default_section_for_gallery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO gallery_sections (gallery_id, name, slug, sort_order, is_default)
  VALUES (NEW.id, 'Default', 'default', 0, true)
  ON CONFLICT (gallery_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS galleries_ensure_default_section ON galleries;
CREATE TRIGGER galleries_ensure_default_section
  AFTER INSERT ON galleries
  FOR EACH ROW
  EXECUTE FUNCTION ensure_default_section_for_gallery();

COMMIT;

-- ── Post-condition self-checks (run manually) ─────────────────────────────
--   SELECT count(*) FROM images WHERE section_id IS NULL;           -- expect 0
--   SELECT gallery_id, count(*) FROM gallery_sections
--     WHERE is_default GROUP BY gallery_id HAVING count(*) <> 1;     -- expect 0
--   SELECT count(*) FROM galleries g WHERE NOT EXISTS (
--     SELECT 1 FROM gallery_sections s
--     WHERE s.gallery_id = g.id AND s.is_default);                   -- expect 0
