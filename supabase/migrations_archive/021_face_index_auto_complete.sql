-- ─────────────────────────────────────────────────────────────────────────────
-- 021_face_index_auto_complete.sql
-- Auto-flip galleries.face_index_status to 'done' when the last image in the
-- gallery has been indexed. Makes the gallery status self-healing — no longer
-- depends on the client reliably calling index_finish.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION check_gallery_face_index_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  total_images   INT;
  indexed_images INT;
BEGIN
  -- Only act when face_indexed_at transitions from NULL to non-NULL.
  IF NEW.face_indexed_at IS NULL OR OLD.face_indexed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO total_images
    FROM images WHERE gallery_id = NEW.gallery_id;
  SELECT count(*) INTO indexed_images
    FROM images WHERE gallery_id = NEW.gallery_id AND face_indexed_at IS NOT NULL;

  -- Flip the gallery to 'done' once every image is indexed. Conditional on
  -- status='indexing' so we don't overwrite a 'failed' state.
  IF indexed_images >= total_images AND total_images > 0 THEN
    UPDATE galleries
       SET face_index_status = 'done',
           face_indexed_at   = now(),
           face_indexed_count = indexed_images
     WHERE id = NEW.gallery_id
       AND face_index_status = 'indexing';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gallery_face_index_complete ON images;
CREATE TRIGGER trg_gallery_face_index_complete
AFTER UPDATE OF face_indexed_at ON images
FOR EACH ROW
EXECUTE FUNCTION check_gallery_face_index_complete();

COMMIT;
