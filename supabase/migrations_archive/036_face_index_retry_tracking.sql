-- ─────────────────────────────────────────────────────────────────────────────
-- 036_face_index_retry_tracking.sql
-- Track retry attempts and the last failure reason per image so the
-- rekognition edge function can stop retrying images that consistently fail
-- (corrupt files, missing storage objects, unsupported formats) without
-- leaving the gallery stuck in 'indexing' forever.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE images
  ADD COLUMN IF NOT EXISTS face_index_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS face_index_error TEXT;

COMMIT;
