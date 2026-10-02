-- ─────────────────────────────────────────────────────────────────────────────
-- 018_public_business_lookup.sql
-- Public RPC to look up a business by slug (needed for portfolio/client pages)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION get_business_by_slug(p_slug TEXT)
RETURNS TABLE (id UUID, business_name TEXT, slug TEXT, logo_url TEXT, website_url TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, business_name, slug, logo_url, website_url
  FROM businesses WHERE LOWER(slug) = LOWER(p_slug) LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION get_business_by_slug(TEXT) TO anon, authenticated;

-- Client page settings (per-client customization for their marketing page)
CREATE TABLE IF NOT EXISTS client_page_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  headline TEXT DEFAULT '',
  description TEXT DEFAULT '',
  featured_gallery_ids UUID[] DEFAULT '{}',
  hidden_gallery_ids UUID[] DEFAULT '{}',
  extra_pick_ids UUID[] DEFAULT '{}',
  custom_logo_url TEXT,
  custom_accent_color TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE client_page_settings ENABLE ROW LEVEL SECURITY;

-- Anon can read (public page) and write (client with code)
CREATE POLICY client_page_settings_public ON client_page_settings
  FOR ALL TO anon
  USING (
    EXISTS (SELECT 1 FROM clients c JOIN galleries g ON g.client_id = c.id WHERE c.id = client_page_settings.client_id AND g.status = 'live')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM clients c JOIN galleries g ON g.client_id = c.id WHERE c.id = client_page_settings.client_id AND g.status = 'live')
  );

CREATE POLICY client_page_settings_owner ON client_page_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = client_page_settings.client_id AND c.business_id = current_business_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = client_page_settings.client_id AND c.business_id = current_business_id())
  );

COMMIT;
