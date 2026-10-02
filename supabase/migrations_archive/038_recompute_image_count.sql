-- ─────────────────────────────────────────────────────────────────────────────
-- 038_recompute_image_count.sql
-- Extend recompute_face_indexed_count to also self-heal galleries.image_count.
-- Stale image_count values (e.g. 1198 on a gallery whose images table actually
-- holds 1068 rows because some uploads never completed or some images were
-- later removed) cause the publish UI to show "Index N new photos" forever
-- because the label is computed as image_count − face_indexed_count.
-- We recompute both counters from the source of truth on every index run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION recompute_face_indexed_count(p_gallery_id UUID)
RETURNS INT
LANGUAGE SQL
AS $$
  UPDATE galleries
     SET image_count = (
           SELECT count(*)::int FROM images
            WHERE gallery_id = p_gallery_id
         ),
         face_indexed_count = (
           SELECT count(*)::int FROM images
            WHERE gallery_id = p_gallery_id
              AND face_indexed_at IS NOT NULL
         )
   WHERE id = p_gallery_id
   RETURNING face_indexed_count;
$$;

REVOKE EXECUTE ON FUNCTION recompute_face_indexed_count(UUID) FROM PUBLIC;

COMMIT;
