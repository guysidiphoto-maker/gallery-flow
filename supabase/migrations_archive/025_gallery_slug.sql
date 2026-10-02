-- Add slug column to galleries for clean URLs
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS slug TEXT;

-- Index for fast lookup by business + slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_galleries_business_slug
  ON galleries (business_id, slug)
  WHERE slug IS NOT NULL;

-- Allow public (anon) reads on slug column via existing RLS policies
-- (galleries already have SELECT policies for anon)
