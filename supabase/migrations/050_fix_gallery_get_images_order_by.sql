-- ─────────────────────────────────────────────────────────────────────────────
-- 050_fix_gallery_get_images_order_by.sql
-- The RPC defined in migration 041 ordered by `images.created_at`, but that
-- column does not exist on `images` (the table has `updated_at` only). Every
-- guest hit to a gallery on production raised:
--   ERROR: column "created_at" does not exist
-- and the public viewer rendered an empty grid. Live customers (Alma) hit
-- this immediately on next page-load.
--
-- This migration replaces the function body with `ORDER BY sort_order ASC`,
-- which is the column the desktop app and dashboard already use to position
-- images in a gallery. Migration 041 in the repo has been edited to match
-- so a fresh-environment first run gets the correct version.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION gallery_get_images(
  p_gallery_id UUID,
  p_token UUID DEFAULT NULL,
  p_limit INT DEFAULT 500,
  p_offset INT DEFAULT 0
) RETURNS SETOF images
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN RETURN; END IF;
  RETURN QUERY
    SELECT * FROM images
     WHERE gallery_id = p_gallery_id
     ORDER BY sort_order ASC
     LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 500), 2000))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

COMMIT;
