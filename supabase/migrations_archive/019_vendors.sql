-- ─────────────────────────────────────────────────────────────────────────────
-- 019_vendors.sql
-- Vendor system: tag images to vendors, each vendor gets a unique link
-- to download their photos. Drives organic growth — vendors demand Pixflow.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Vendors table (per business)
CREATE TABLE IF NOT EXISTS vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',          -- 'catering', 'dj', 'venue', 'decor', 'lighting', etc.
  email TEXT DEFAULT '',
  instagram TEXT DEFAULT '',
  website TEXT DEFAULT '',
  logo_url TEXT,
  access_code TEXT NOT NULL DEFAULT UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6)),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendors_business_idx ON vendors(business_id);

-- Image-vendor tags (many-to-many)
CREATE TABLE IF NOT EXISTS image_vendor_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(image_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS image_vendor_tags_vendor_idx ON image_vendor_tags(vendor_id);
CREATE INDEX IF NOT EXISTS image_vendor_tags_gallery_idx ON image_vendor_tags(gallery_id);

-- RLS
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_vendor_tags ENABLE ROW LEVEL SECURITY;

-- Vendors: owner CRUD
CREATE POLICY vendors_owner ON vendors
  FOR ALL TO authenticated
  USING (business_id = current_business_id())
  WITH CHECK (business_id = current_business_id());

-- Vendors: public read (for vendor portal pages)
CREATE POLICY vendors_public_read ON vendors
  FOR SELECT TO anon
  USING (true);

-- Image vendor tags: owner CRUD
CREATE POLICY image_vendor_tags_owner ON image_vendor_tags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = image_vendor_tags.gallery_id
        AND g.business_id = current_business_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = image_vendor_tags.gallery_id
        AND g.business_id = current_business_id()
    )
  );

-- Image vendor tags: anon read (for vendor portal)
CREATE POLICY image_vendor_tags_public_read ON image_vendor_tags
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = image_vendor_tags.gallery_id
        AND g.status = 'live'
    )
  );

-- RPC to look up vendor by access code (for the portal)
CREATE OR REPLACE FUNCTION get_vendor_by_code(p_code TEXT)
RETURNS TABLE (
  id UUID, business_id UUID, name TEXT, category TEXT,
  email TEXT, instagram TEXT, website TEXT, logo_url TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, business_id, name, category, email, instagram, website, logo_url
  FROM vendors WHERE UPPER(access_code) = UPPER(p_code) LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION get_vendor_by_code(TEXT) TO anon, authenticated;

COMMIT;
