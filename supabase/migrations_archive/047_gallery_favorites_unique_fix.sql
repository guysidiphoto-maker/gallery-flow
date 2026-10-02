-- ─────────────────────────────────────────────────────────────────────────────
-- 047_gallery_favorites_unique_fix.sql
-- The original UNIQUE (gallery_id, image_id, guest_name) in 045 doesn't do
-- what we want for anonymous guests: Postgres treats NULL as distinct in
-- UNIQUE constraints, so an anon guest (guest_name = NULL) could heart the
-- same image unbounded times — each insert lands a new row and trips the
-- favorites_total counter trigger from 046, drifting the count upward
-- forever.
--
-- Replace the constraint with a partial unique index that COALESCEs the
-- guest_name to '__anon__' so anonymous favorites for the same
-- (gallery, image) collide on insert and the unique violation tells the
-- client "you've already favorited this".
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE gallery_favorites
  DROP CONSTRAINT IF EXISTS gallery_favorites_gallery_id_image_id_guest_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS gallery_favorites_unique_anon_safe
  ON gallery_favorites (
    gallery_id,
    image_id,
    COALESCE(guest_name, '__anon__')
  );

COMMIT;
