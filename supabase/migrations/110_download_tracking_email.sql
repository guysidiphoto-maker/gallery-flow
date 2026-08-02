-- ─────────────────────────────────────────────────────────────────────────────
-- 110_download_tracking_email.sql — Attribute downloads to a guest email.
--
-- When the photographer turns on "מעקב הורדות" (delivery_settings.trackDownloads),
-- the first guest to download from a live gallery is asked for an email (and an
-- optional name). The public viewer records that identity on every download row
-- so the photographer's Activities tab can answer "who downloaded which photos".
--
--   • gallery_download_log gains nullable guest_email + guest_name columns
--     (nullable so galleries WITHOUT tracking keep logging anonymously, and so
--     historic rows are unaffected).
--   • gallery_activity_summary surfaces the email on each recent download and
--     adds a `downloaders` roll-up: distinct email → { count, last_at }.
--
-- Additive; does not modify applied 104-109. Reversible (see _rollback).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Attribution columns ──────────────────────────────────────────────────
ALTER TABLE gallery_download_log
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS guest_name  TEXT;

-- Index the email so the per-downloader roll-up stays cheap on busy galleries.
CREATE INDEX IF NOT EXISTS gallery_download_log_email_idx
  ON gallery_download_log(gallery_id, guest_email)
  WHERE guest_email IS NOT NULL;

-- The existing anon INSERT policy (045) has no column restriction, so anon can
-- already write guest_email/guest_name for a live gallery. Nothing to change on
-- RLS — the WITH CHECK still only permits inserts scoped to a live gallery.

-- ── 2. Activity summary: expose email + downloader roll-up ───────────────────
CREATE OR REPLACE FUNCTION gallery_activity_summary(p_gallery_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_business UUID;
  v_caller_business UUID;
  v_result JSONB;
BEGIN
  SELECT business_id INTO v_business FROM galleries WHERE id = p_gallery_id;
  SELECT id INTO v_caller_business FROM businesses WHERE user_id = auth.uid() LIMIT 1;
  IF v_business IS NULL OR v_caller_business IS NULL OR v_business <> v_caller_business THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT jsonb_build_object(
    'downloads_total',  (SELECT count(*) FROM gallery_download_log WHERE gallery_id = p_gallery_id),
    'favorites_total',  (SELECT count(*) FROM gallery_favorites    WHERE gallery_id = p_gallery_id),
    'emails_total',     (SELECT count(*) FROM gallery_email_log    WHERE gallery_id = p_gallery_id),
    'recent_downloads', COALESCE((
      SELECT jsonb_agg(d.*) FROM (
        SELECT id, image_id, resolution, download_kind, guest_email, guest_name, created_at
          FROM gallery_download_log
         WHERE gallery_id = p_gallery_id
         ORDER BY created_at DESC LIMIT 50
      ) d
    ), '[]'::jsonb),
    -- Distinct downloaders by email, most-recent first. Anonymous rows
    -- (guest_email IS NULL) are excluded — they show only in the raw feed.
    'downloaders', COALESCE((
      SELECT jsonb_agg(x.*) FROM (
        SELECT guest_email,
               max(guest_name)  FILTER (WHERE guest_name IS NOT NULL) AS guest_name,
               count(*)         AS downloads,
               max(created_at)  AS last_at
          FROM gallery_download_log
         WHERE gallery_id = p_gallery_id AND guest_email IS NOT NULL
         GROUP BY guest_email
         ORDER BY max(created_at) DESC LIMIT 100
      ) x
    ), '[]'::jsonb),
    'recent_favorites', COALESCE((
      SELECT jsonb_agg(f.*) FROM (
        SELECT id, image_id, guest_name, note, created_at
          FROM gallery_favorites
         WHERE gallery_id = p_gallery_id
         ORDER BY created_at DESC LIMIT 50
      ) f
    ), '[]'::jsonb),
    'recent_emails', COALESCE((
      SELECT jsonb_agg(e.*) FROM (
        SELECT id, recipient_email, subject, status, created_at
          FROM gallery_email_log
         WHERE gallery_id = p_gallery_id
         ORDER BY created_at DESC LIMIT 50
      ) e
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION gallery_activity_summary(UUID) TO authenticated;

COMMIT;
