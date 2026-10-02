-- ─────────────────────────────────────────────────────────────────────────────
-- 072_business_brand_kit.sql
-- Central Brand Kit storage on the photographer's `businesses` row.
--
-- A single JSONB column captures every studio-level identity asset (logo
-- slots, brand colors, typography pair, voice copy, watermark policy, social
-- handles) so it can be referenced from every downstream surface — gallery
-- defaults, share emails, social cards, story renders, watermark overlays —
-- without scattering per-feature columns across the schema.
--
-- The shape is intentionally a single document because:
--   1. The shape evolves alongside design — every new section adds keys, not
--      columns. The `schema_version` field lets the reader fork on shape.
--   2. RLS is already enforced at the row level by the existing
--      `businesses_owner_select` / `businesses_owner_update` policies from
--      migration 006, so no extra policies are required.
--   3. The bucket for binary assets (logo PNGs) is a separate, public:true
--      `business-brand` bucket provisioned below; the JSONB only holds the
--      public URLs returned by Storage.
--
-- The expected JSONB shape (validated by the application, not the DB):
--
--   {
--     "schema_version": 1,
--     "logo": {
--       "url":        TEXT?,   // primary logo, used on light backgrounds
--       "dark_url":   TEXT?,   // optional dark-mode variant
--       "square_url": TEXT?    // optional square favicon / avatar
--     },
--     "colors": {
--       "primary":   "#RRGGBB",  // brand primary
--       "secondary": "#RRGGBB",  // brand secondary
--       "accent":    "#RRGGBB",  // CTA / highlights
--       "ink":       "#RRGGBB",  // body text / heading color
--       "paper":     "#RRGGBB"   // background canvas
--     },
--     "typography": {
--       "heading_family": TEXT,  // CSS font-family for headings
--       "body_family":    TEXT   // CSS font-family for body
--     },
--     "voice": {
--       "tagline":   TEXT,            // single line, ≤80 chars
--       "signature": TEXT,            // multi-line, ≤280 chars
--       "language":  'he' | 'en' | 'auto'
--     },
--     "watermark": {
--       "enabled":         BOOLEAN,
--       "source":          'logo' | 'studio_name' | 'custom_text',
--       "text":            TEXT?,                 // when source = custom_text
--       "position":        'tl'|'tc'|'tr'|'cl'|'cc'|'cr'|'bl'|'bc'|'br',
--       "opacity_percent": INTEGER 5..50,
--       "scale_percent":   INTEGER 5..30,
--       "contrast_aware":  BOOLEAN
--     },
--     "social": {
--       "instagram": TEXT?,
--       "facebook":  TEXT?,
--       "tiktok":    TEXT?,
--       "twitter":   TEXT?,
--       "website":   TEXT?
--     }
--   }
--
-- The `record_image_upload` function is intentionally NOT touched here — the
-- watermark policy is applied at render time (gallery viewer, story compositor)
-- or at download time, not at original ingest.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. brand_kit JSONB column ───────────────────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS brand_kit JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN businesses.brand_kit IS
  'Central Brand Kit document. Shape: { schema_version:int, logo:{url,dark_url,square_url}, '
  'colors:{primary,secondary,accent,ink,paper}, typography:{heading_family,body_family}, '
  'voice:{tagline,signature,language}, watermark:{enabled,source,text,position,opacity_percent,'
  'scale_percent,contrast_aware}, social:{instagram,facebook,tiktok,twitter,website} }. '
  'See migration 072_business_brand_kit.sql for the full schema.';

-- ── 2. GIN index for cheap key lookups ──────────────────────────────────────
-- jsonb_path_ops is faster + smaller than the default jsonb_ops when queries
-- only use the @> containment operator (the common Brand-Kit read pattern is
-- "rows where brand_kit @> '{"watermark":{"enabled":true}}'").
CREATE INDEX IF NOT EXISTS businesses_brand_kit_gin
  ON businesses USING GIN (brand_kit jsonb_path_ops);

-- ── 3. business-brand storage bucket for logo assets ────────────────────────
-- public:true so the photographer's own gallery viewer + share emails can
-- reference the logo via a stable public URL without minting signed URLs on
-- every render. RLS below restricts WRITES to the owning photographer.
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-brand', 'business-brand', true)
ON CONFLICT (id) DO NOTHING;

-- Read: anyone (anon + authenticated) can read. The bucket is public:true so
-- public URLs already bypass RLS, but the explicit policy keeps direct
-- storage.objects queries working too.
DROP POLICY IF EXISTS business_brand_public_read ON storage.objects;
CREATE POLICY business_brand_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'business-brand');

-- Write: owner-only. Path scheme is `business-brand/{business_id}/...` so we
-- match storage.foldername(name)[1] = the business UUID, then check that the
-- caller owns that business row.
DROP POLICY IF EXISTS business_brand_owner_write ON storage.objects;
CREATE POLICY business_brand_owner_write
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'business-brand'
    AND EXISTS (
      SELECT 1 FROM businesses b
       WHERE b.id::text = (storage.foldername(storage.objects.name))[1]
         AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'business-brand'
    AND EXISTS (
      SELECT 1 FROM businesses b
       WHERE b.id::text = (storage.foldername(storage.objects.name))[1]
         AND b.user_id = auth.uid()
    )
  );

COMMIT;
