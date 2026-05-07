-- 054_gallery_sections_slug.sql
-- Slugs for gallery sections so URLs stop carrying raw UUIDs
-- (e.g. ?section=top-picks instead of ?section=8aaccda1-ee18-4c95-...).
--
-- Reuses the slugify() function from migration 053. Slug is unique per
-- gallery, auto-populated on INSERT via trigger when caller doesn't
-- provide one. Existing rows are backfilled from name.

BEGIN;

ALTER TABLE gallery_sections ADD COLUMN IF NOT EXISTS slug TEXT;

WITH base AS (
  SELECT id, gallery_id, name,
         COALESCE(NULLIF(slug, ''), slugify(name), 'section-' || substr(id::text, 1, 6)) AS s
  FROM gallery_sections
  WHERE slug IS NULL OR length(trim(slug)) = 0
),
ranked AS (
  SELECT id, gallery_id, s,
         ROW_NUMBER() OVER (PARTITION BY gallery_id, s ORDER BY id) AS rn
  FROM base
)
UPDATE gallery_sections gs
SET slug = CASE WHEN r.rn = 1 THEN r.s ELSE r.s || '-' || r.rn END
FROM ranked r
WHERE gs.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS gallery_sections_gallery_slug_idx
  ON gallery_sections(gallery_id, slug);

CREATE OR REPLACE FUNCTION gallery_sections_set_slug()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INT := 1;
BEGIN
  IF NEW.slug IS NOT NULL AND length(trim(NEW.slug)) > 0 THEN
    NEW.slug := slugify(NEW.slug);
    IF NEW.slug IS NULL THEN NEW.slug := 'section-' || substr(NEW.id::text, 1, 6); END IF;
  ELSE
    NEW.slug := COALESCE(slugify(NEW.name), 'section-' || substr(NEW.id::text, 1, 6));
  END IF;
  base_slug := NEW.slug;
  candidate := base_slug;
  WHILE EXISTS (
    SELECT 1 FROM gallery_sections
    WHERE gallery_id = NEW.gallery_id AND slug = candidate AND id <> NEW.id
  ) LOOP
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS gallery_sections_set_slug_trg ON gallery_sections;
CREATE TRIGGER gallery_sections_set_slug_trg
  BEFORE INSERT ON gallery_sections
  FOR EACH ROW EXECUTE FUNCTION gallery_sections_set_slug();

COMMIT;
