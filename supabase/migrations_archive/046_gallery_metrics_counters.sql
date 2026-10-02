-- ─────────────────────────────────────────────────────────────────────────────
-- 046_gallery_metrics_counters.sql
-- Denormalize download_count + favorite_count onto the galleries row so the
-- dashboard's gallery list can render counts without N+1 queries to
-- gallery_download_log / gallery_favorites. Triggers keep them in sync.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorite_count INTEGER NOT NULL DEFAULT 0;

-- ── triggers: download log ──────────────────────────────────────────────────
-- Pin search_path so a malicious schema in the caller's path can't shadow
-- the `galleries` table reference (Supabase advisor 0011).
CREATE OR REPLACE FUNCTION _bump_gallery_download_count() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE galleries SET download_count = download_count + 1
   WHERE id = NEW.gallery_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gallery_download_log_bump ON gallery_download_log;
CREATE TRIGGER gallery_download_log_bump
  AFTER INSERT ON gallery_download_log
  FOR EACH ROW EXECUTE FUNCTION _bump_gallery_download_count();

-- ── triggers: favorites ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _bump_gallery_favorite_count() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE galleries SET favorite_count = favorite_count + 1
     WHERE id = NEW.gallery_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE galleries SET favorite_count = GREATEST(0, favorite_count - 1)
     WHERE id = OLD.gallery_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS gallery_favorites_bump ON gallery_favorites;
CREATE TRIGGER gallery_favorites_bump
  AFTER INSERT OR DELETE ON gallery_favorites
  FOR EACH ROW EXECUTE FUNCTION _bump_gallery_favorite_count();

-- ── backfill from existing rows ─────────────────────────────────────────────
UPDATE galleries g
   SET download_count = COALESCE((
         SELECT count(*) FROM gallery_download_log d WHERE d.gallery_id = g.id
       ), 0),
       favorite_count = COALESCE((
         SELECT count(*) FROM gallery_favorites f WHERE f.gallery_id = g.id
       ), 0);

COMMIT;
