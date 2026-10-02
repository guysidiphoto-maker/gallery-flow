-- ─────────────────────────────────────────────────────────────────────────────
-- 010_gallery_sections.sql
-- Adds first-class gallery_sections table and a section_id FK on images.
-- One image belongs to AT MOST one section. Renaming a section updates
-- everywhere automatically because the name lives on the section row.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS gallery_sections (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gallery_id  UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gallery_sections_gallery_id_idx
  ON gallery_sections (gallery_id);

CREATE INDEX IF NOT EXISTS gallery_sections_order_idx
  ON gallery_sections (gallery_id, sort_order);

DROP TRIGGER IF EXISTS gallery_sections_set_updated_at ON gallery_sections;
CREATE TRIGGER gallery_sections_set_updated_at
  BEFORE UPDATE ON gallery_sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Section FK on images: nullable, ON DELETE SET NULL so deleting a section
-- never deletes images — they fall back to "All Images".
ALTER TABLE images
  ADD COLUMN IF NOT EXISTS section_id UUID
    REFERENCES gallery_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS images_section_id_idx ON images (section_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE gallery_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY gallery_sections_owner_all ON gallery_sections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_sections.gallery_id
        AND g.business_id = current_business_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_sections.gallery_id
        AND g.business_id = current_business_id()
    )
  );

CREATE POLICY gallery_sections_public_live_select ON gallery_sections
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_sections.gallery_id
        AND g.status = 'live'
    )
  );

COMMIT;
