-- ─────────────────────────────────────────────────────────────────────────────
-- 037_face_index_recompute_rpc.sql
-- Self-heal galleries.face_indexed_count from the source of truth: the count
-- of images with face_indexed_at IS NOT NULL. Needed because the previous
-- increment_face_indexed_count path could double-count when concurrent worker
-- claims (lock staleness ≥ 10 min while a slow worker was still running)
-- both indexed the same image. We call this at the start of every index run
-- so any stale overshoot is reset before progress is reported.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION recompute_face_indexed_count(p_gallery_id UUID)
RETURNS INT
LANGUAGE SQL
AS $$
  UPDATE galleries
     SET face_indexed_count = (
       SELECT count(*)::int
         FROM images
        WHERE gallery_id = p_gallery_id
          AND face_indexed_at IS NOT NULL
     )
   WHERE id = p_gallery_id
   RETURNING face_indexed_count;
$$;

REVOKE EXECUTE ON FUNCTION recompute_face_indexed_count(UUID) FROM PUBLIC;

COMMIT;
