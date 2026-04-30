-- ─────────────────────────────────────────────────────────────────────────────
-- 039_face_search_cache.sql
-- Cache identical selfie searches per gallery so a guest who reloads / retries
-- the same selfie doesn't re-bill an AWS Rekognition call. The cache key is
-- (gallery_id, sha256(selfie_bytes)) — we never store the selfie itself, only
-- its hash. TTL is enforced at read time via a created_at cutoff.
--
-- This also takes pressure off the rate limit: a guest hammering the search
-- button repeatedly with the same selfie won't burn through their hourly cap.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS face_search_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  selfie_hash TEXT NOT NULL,                 -- SHA-256 hex of the selfie bytes
  matches JSONB NOT NULL,                    -- [{ imageId, similarity }, ...]
  image_ids UUID[] NOT NULL DEFAULT '{}',    -- denormalized for cheap hydration
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gallery_id, selfie_hash)
);

CREATE INDEX IF NOT EXISTS face_search_cache_lookup
  ON face_search_cache (gallery_id, selfie_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS face_search_cache_gc
  ON face_search_cache (created_at);

ALTER TABLE face_search_cache ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only. The edge function reads + writes this
-- with the service-role key; anonymous clients never see it directly.

COMMIT;
