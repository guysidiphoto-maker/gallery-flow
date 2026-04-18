-- ─────────────────────────────────────────────────────────────────────────────
-- 020_face_recognition.sql
-- Face search per gallery via AWS Rekognition.
-- One Rekognition collection per gallery (collection id = gallery uuid).
-- Selfie bytes are never persisted — search goes through the edge function
-- using the service role key; rate-limited by IP hash.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Gallery-level state ────────────────────────────────────────────────────
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS face_index_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS face_index_status TEXT
    CHECK (face_index_status IN ('pending', 'indexing', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS rekognition_collection_id TEXT,
  ADD COLUMN IF NOT EXISTS face_indexed_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS face_index_error TEXT,
  ADD COLUMN IF NOT EXISTS face_indexed_at TIMESTAMPTZ;

-- ── Per-image index marker (resumability) ──────────────────────────────────
ALTER TABLE images
  ADD COLUMN IF NOT EXISTS face_indexed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS face_count INT;

-- ── One row per detected face (one image can have many) ────────────────────
CREATE TABLE IF NOT EXISTS image_faces (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id          UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  image_id            UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  rekognition_face_id TEXT NOT NULL UNIQUE,
  confidence          REAL,
  bounding_box        JSONB,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS image_faces_gallery_idx ON image_faces(gallery_id);
CREATE INDEX IF NOT EXISTS image_faces_image_idx   ON image_faces(image_id);

-- ── Rate-limit log for the public /search endpoint ─────────────────────────
-- The edge function inserts one row per anonymous search and counts rows in
-- a sliding window to throttle abuse. IPs are stored as a salted hash so the
-- table holds no PII.
CREATE TABLE IF NOT EXISTS rekognition_search_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rekognition_search_log_ip_idx
  ON rekognition_search_log(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS rekognition_search_log_gallery_idx
  ON rekognition_search_log(gallery_id, created_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE image_faces            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rekognition_search_log ENABLE ROW LEVEL SECURITY;

-- Owner (photographer) can read/write face rows for galleries they own.
-- Anon users never read this table directly — the selfie search goes through
-- the edge function, which uses the service role and returns image_ids only.
CREATE POLICY image_faces_owner ON image_faces
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = image_faces.gallery_id
        AND g.business_id = current_business_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = image_faces.gallery_id
        AND g.business_id = current_business_id()
    )
  );

-- No policies on rekognition_search_log: service-role only.

-- ── Atomic counter bump (avoids read-modify-write races when index_image
--    calls run concurrently for the same gallery) ──────────────────────────
CREATE OR REPLACE FUNCTION increment_face_indexed_count(p_gallery_id UUID)
RETURNS VOID
LANGUAGE SQL
AS $$
  UPDATE galleries
     SET face_indexed_count = COALESCE(face_indexed_count, 0) + 1
   WHERE id = p_gallery_id
$$;

-- Callable by service role (edge function). Not exposed to anon/authenticated
-- — the edge function is the only intended caller.
REVOKE EXECUTE ON FUNCTION increment_face_indexed_count(UUID) FROM PUBLIC;

COMMIT;
