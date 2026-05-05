-- ─────────────────────────────────────────────────────────────────────────────
-- 047_image_delete_log.sql
-- When an `images` row is deleted (bulk-delete from the dashboard, gallery
-- delete cascade, manual cleanup) the storage objects are NOT touched. Over
-- time this leaks paid S3 storage. Capture every deletion's storage paths
-- in a queue table; a scheduled edge function (storage-reaper) picks them
-- up and removes the actual blobs in batches.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS storage_cleanup_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket          TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  source_table    TEXT NOT NULL,    -- 'images' / 'stories' / 'galleries'
  source_id       UUID,             -- the row id that owned the path (gone now)
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleaned_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS storage_cleanup_queue_pending_idx
  ON storage_cleanup_queue(created_at)
  WHERE cleaned_at IS NULL;

ALTER TABLE storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role reaper touches this table.

-- Trigger: enqueue on images delete.
CREATE OR REPLACE FUNCTION _enqueue_image_storage_cleanup() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- Three potential paths per image (thumbnail / web preview / original).
  -- Only enqueue the ones that were set.
  IF OLD.thumbnail_path IS NOT NULL THEN
    INSERT INTO storage_cleanup_queue (bucket, storage_path, source_table, source_id)
    VALUES ('gallery-images', OLD.thumbnail_path, 'images', OLD.id);
  END IF;
  IF OLD.web_preview_path IS NOT NULL THEN
    INSERT INTO storage_cleanup_queue (bucket, storage_path, source_table, source_id)
    VALUES ('gallery-images', OLD.web_preview_path, 'images', OLD.id);
  END IF;
  IF OLD.original_path IS NOT NULL THEN
    INSERT INTO storage_cleanup_queue (bucket, storage_path, source_table, source_id)
    VALUES ('gallery-images', OLD.original_path, 'images', OLD.id);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS images_enqueue_storage_cleanup ON images;
CREATE TRIGGER images_enqueue_storage_cleanup
  AFTER DELETE ON images
  FOR EACH ROW EXECUTE FUNCTION _enqueue_image_storage_cleanup();

-- Trigger: enqueue on stories delete.
CREATE OR REPLACE FUNCTION _enqueue_story_storage_cleanup() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.storage_path IS NOT NULL THEN
    INSERT INTO storage_cleanup_queue (bucket, storage_path, source_table, source_id)
    VALUES ('gallery-stories', OLD.storage_path, 'stories', OLD.id);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS stories_enqueue_storage_cleanup ON stories;
CREATE TRIGGER stories_enqueue_storage_cleanup
  AFTER DELETE ON stories
  FOR EACH ROW EXECUTE FUNCTION _enqueue_story_storage_cleanup();

-- Helpers for the reaper edge function.
CREATE OR REPLACE FUNCTION storage_cleanup_claim_batch(p_limit INT DEFAULT 200)
RETURNS TABLE (id UUID, bucket TEXT, storage_path TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  -- Skip rows the reaper has already failed to clean 5+ times — don't loop forever.
  SELECT id, bucket, storage_path
    FROM storage_cleanup_queue
   WHERE cleaned_at IS NULL AND attempts < 5
   ORDER BY created_at ASC
   LIMIT p_limit
$$;
REVOKE EXECUTE ON FUNCTION storage_cleanup_claim_batch(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION storage_cleanup_claim_batch(INT) TO service_role;

CREATE OR REPLACE FUNCTION storage_cleanup_mark_done(p_ids UUID[]) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE storage_cleanup_queue
     SET cleaned_at = now()
   WHERE id = ANY(p_ids)
$$;
REVOKE EXECUTE ON FUNCTION storage_cleanup_mark_done(UUID[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION storage_cleanup_mark_done(UUID[]) TO service_role;

CREATE OR REPLACE FUNCTION storage_cleanup_mark_failed(p_id UUID, p_error TEXT) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE storage_cleanup_queue
     SET attempts = attempts + 1,
         last_attempt_at = now(),
         last_error = LEFT(p_error, 500)
   WHERE id = p_id
$$;
REVOKE EXECUTE ON FUNCTION storage_cleanup_mark_failed(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION storage_cleanup_mark_failed(UUID, TEXT) TO service_role;

COMMIT;
