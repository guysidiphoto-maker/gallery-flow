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
  publish_status TEXT DEFAULT 'draft' CHECK (publish_status IN (
    'draft', 'preparing_assets', 'uploading_previews', 'preview_live',
    'uploading_originals', 'fully_live', 'partially_failed', 'failed'
  )),
  public_url TEXT,
  image_count INTEGER DEFAULT 0,
  delivery_settings JSONB DEFAULT '{}',
  preview_ready BOOLEAN DEFAULT false,
  originals_ready BOOLEAN DEFAULT false,
  total_images INTEGER DEFAULT 0,
  preview_uploaded_count INTEGER DEFAULT 0,
  original_uploaded_count INTEGER DEFAULT 0,
  original_failed_count INTEGER DEFAULT 0,
  last_upload_resume_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- Images table
CREATE TABLE IF NOT EXISTS images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gallery_id UUID REFERENCES galleries(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_top_pick BOOLEAN DEFAULT false,
  width INTEGER,
  height INTEGER,
  mime_type TEXT,

  -- Thumbnail asset
  thumbnail_path TEXT,
  thumbnail_uploaded BOOLEAN DEFAULT false,
  thumbnail_size_bytes BIGINT,

  -- Web preview asset (main viewing asset)
  web_preview_path TEXT NOT NULL,
  web_preview_uploaded BOOLEAN DEFAULT false,
  web_preview_size_bytes BIGINT,

  -- Original asset (archival / download)
  original_path TEXT,
  original_uploaded BOOLEAN DEFAULT false,
  original_size_bytes BIGINT,
  original_upload_method TEXT CHECK (original_upload_method IN ('standard', 'tus')),
  original_failed_reason TEXT,

  -- Status tracking
  upload_status TEXT DEFAULT 'pending' CHECK (upload_status IN (
    'pending', 'generating_assets', 'uploading_thumbnail', 'uploading_preview',
    'preview_ready', 'uploading_original', 'original_ready', 'original_failed', 'failed'
  )),
  preview_ready BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
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
CREATE POLICY "Allow update images" ON images FOR UPDATE USING (true);
CREATE POLICY "Allow select images" ON images FOR SELECT USING (true);
CREATE POLICY "Allow insert stories" ON stories FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow select stories" ON stories FOR SELECT USING (true);
