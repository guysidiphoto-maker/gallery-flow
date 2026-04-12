-- ─────────────────────────────────────────────────────────────────────────────
-- 005_ownership_enforcement.sql
-- Schema changes that prepare every table for strict ownership.
-- Safe to run on existing data: NO rows are inserted, updated or deleted here.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── businesses ──────────────────────────────────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE businesses ALTER COLUMN user_id       SET NOT NULL;
ALTER TABLE businesses ALTER COLUMN business_name SET NOT NULL;
ALTER TABLE businesses ALTER COLUMN slug          SET NOT NULL;

-- Case-insensitive slug uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS businesses_slug_lower_unique
  ON businesses (LOWER(slug));

-- updated_at trigger function (shared by all tables)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS businesses_set_updated_at ON businesses;
CREATE TRIGGER businesses_set_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── galleries ───────────────────────────────────────────────────────────────
-- Make sure business_id exists (migration 002 may have skipped it on this
-- project). NOT NULL is enforced later in 009 after the backfill.

ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS business_id  UUID REFERENCES businesses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_slug TEXT,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS galleries_business_id_idx
  ON galleries (business_id);

-- A gallery slug is only unique within its owning business.
CREATE UNIQUE INDEX IF NOT EXISTS galleries_business_slug_idx
  ON galleries (business_id, project_slug)
  WHERE project_slug IS NOT NULL;

DROP TRIGGER IF EXISTS galleries_set_updated_at ON galleries;
CREATE TRIGGER galleries_set_updated_at
  BEFORE UPDATE ON galleries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── images ──────────────────────────────────────────────────────────────────
-- Confirm gallery_id is required and that delete cascades from the parent.
ALTER TABLE images ALTER COLUMN gallery_id SET NOT NULL;

ALTER TABLE images
  DROP CONSTRAINT IF EXISTS images_gallery_id_fkey;
ALTER TABLE images
  ADD  CONSTRAINT images_gallery_id_fkey
       FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS images_gallery_id_idx ON images (gallery_id);

-- ── stories ─────────────────────────────────────────────────────────────────
ALTER TABLE stories ALTER COLUMN gallery_id SET NOT NULL;

ALTER TABLE stories
  DROP CONSTRAINT IF EXISTS stories_gallery_id_fkey;
ALTER TABLE stories
  ADD  CONSTRAINT stories_gallery_id_fkey
       FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS stories_gallery_id_idx ON stories (gallery_id);

-- ── clients ─────────────────────────────────────────────────────────────────
-- Today clients are global; scope them to a business. NOT NULL is in 009.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS clients_business_id_idx ON clients (business_id);

COMMIT;
