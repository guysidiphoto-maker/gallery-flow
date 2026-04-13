-- ─────────────────────────────────────────────────────────────────────────────
-- 017_client_hidden_images.sql
-- Client proofing: clients can hide images from a gallery. Guests see only
-- the images that haven't been hidden. The photographer sees all selections
-- in the desktop app.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS gallery_hidden_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (gallery_id, image_id)
);

CREATE INDEX IF NOT EXISTS gallery_hidden_images_gallery_idx
  ON gallery_hidden_images(gallery_id);

-- RLS: anon can read + write hidden images (gallery viewer uses anon key,
-- client code validation happens in the app layer).
ALTER TABLE gallery_hidden_images ENABLE ROW LEVEL SECURITY;

-- Anyone can read hidden images (needed for guest filtering)
CREATE POLICY hidden_images_public_read ON gallery_hidden_images
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_hidden_images.gallery_id
        AND g.status = 'live'
    )
  );

-- Anon can insert/delete (client proofing from the gallery viewer)
CREATE POLICY hidden_images_anon_write ON gallery_hidden_images
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_hidden_images.gallery_id
        AND g.status = 'live'
    )
  );

CREATE POLICY hidden_images_anon_delete ON gallery_hidden_images
  FOR DELETE TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_hidden_images.gallery_id
        AND g.status = 'live'
    )
  );

-- Authenticated owner can also manage hidden images
CREATE POLICY hidden_images_owner_all ON gallery_hidden_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_hidden_images.gallery_id
        AND g.business_id = current_business_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_hidden_images.gallery_id
        AND g.business_id = current_business_id()
    )
  );

COMMIT;
