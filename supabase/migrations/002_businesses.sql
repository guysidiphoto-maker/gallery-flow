-- Businesses table: one per user, holds identity + public slug
CREATE TABLE IF NOT EXISTS businesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  business_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  website_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS businesses_slug_idx ON businesses(slug);
CREATE UNIQUE INDEX IF NOT EXISTS businesses_user_id_idx ON businesses(user_id);

-- Link galleries to businesses
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);

-- RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Anyone can check slug availability (SELECT)
CREATE POLICY "Public slug check" ON businesses FOR SELECT USING (true);

-- Authenticated users can insert their own business
CREATE POLICY "Users insert own business" ON businesses
  FOR INSERT WITH CHECK (true);

-- Authenticated users can update their own business
CREATE POLICY "Users update own business" ON businesses
  FOR UPDATE USING (true);
