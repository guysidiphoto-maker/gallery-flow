-- ─────────────────────────────────────────────────────────────────────────────
-- 022_face_index_claim_rpc.sql
-- Atomic claim for the face-indexing lock on a gallery. Replaces the
-- read-then-write pattern that could let two concurrent index_gallery calls
-- both pass the "is anything running?" check.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION try_claim_face_indexing(
  p_gallery_id    UUID,
  p_staleness_sec INT DEFAULT 600
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE galleries
     SET face_index_status = 'indexing',
         face_indexed_at   = now(),
         face_index_error  = NULL
   WHERE id = p_gallery_id
     AND (
       -- Not currently indexing
       face_index_status IS DISTINCT FROM 'indexing'
       -- Or indexing flag is stale (e.g., previous worker crashed)
       OR face_indexed_at IS NULL
       OR face_indexed_at < now() - make_interval(secs => p_staleness_sec)
     );
  RETURN FOUND;
END;
$$;

-- Only the service role (edge function) should claim.
REVOKE EXECUTE ON FUNCTION try_claim_face_indexing(UUID, INT) FROM PUBLIC;

COMMIT;
