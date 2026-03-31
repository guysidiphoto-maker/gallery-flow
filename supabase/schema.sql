-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id TEXT,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Galleries table
CREATE TABLE IF NOT EXISTS galleries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id TEXT,
  name TEXT NOT NULL,
  client_id UUID REFERENCES clients(id),
  client_name TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'publishing', 'live', 'failed')),
  public_url TEXT,
  image_count INTEGER DEFAULT 0,
  delivery_settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- Images table
CREATE TABLE IF NOT EXISTS images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gallery_id UUID REFERENCES galleries(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  original_path TEXT,
  thumbnail_path TEXT,
  is_top_pick BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Stories table
CREATE TABLE IF NOT EXISTS stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gallery_id UUID REFERENCES galleries(id) ON DELETE CASCADE,
  style TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  duration REAL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- Public read policies (for client gallery viewing)
CREATE POLICY "Public read galleries" ON galleries FOR SELECT USING (status = 'live');
CREATE POLICY "Public read images" ON images FOR SELECT USING (
  gallery_id IN (SELECT id FROM galleries WHERE status = 'live')
);
CREATE POLICY "Public read stories" ON stories FOR SELECT USING (
  gallery_id IN (SELECT id FROM galleries WHERE status = 'live')
);

-- Anon insert/update policies (temporary - for the photographer uploading)
CREATE POLICY "Allow insert clients" ON clients FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update clients" ON clients FOR UPDATE USING (true);
CREATE POLICY "Allow insert galleries" ON galleries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update galleries" ON galleries FOR UPDATE USING (true);
CREATE POLICY "Allow select galleries" ON galleries FOR SELECT USING (true);
CREATE POLICY "Allow insert images" ON images FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow select images" ON images FOR SELECT USING (true);
CREATE POLICY "Allow insert stories" ON stories FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow select stories" ON stories FOR SELECT USING (true);
