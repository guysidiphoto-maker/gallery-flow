-- ─────────────────────────────────────────────────────────────────────────────
-- 045_activities_and_favorites.sql
-- The "Activities" tab in the photographer dashboard surfaces three logs:
--   1) downloads — who downloaded what, when, in which resolution
--   2) favorites — which images guests starred, and any free-text note
--   3) email shares — outbound emails sent from the dashboard with the
--      gallery link
--
-- All three are append-only and writable by anon (the public viewer) under
-- tight RLS: only inserts for live galleries, only the columns the viewer
-- has any business setting.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── gallery_download_log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gallery_download_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id    UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  image_id      UUID REFERENCES images(id) ON DELETE SET NULL,
  resolution    TEXT NOT NULL CHECK (resolution IN ('original', 'web', 'thumbnail')),
  download_kind TEXT NOT NULL CHECK (download_kind IN ('single', 'batch')),
  ip_hash       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gallery_download_log_gallery_idx
  ON gallery_download_log(gallery_id, created_at DESC);

ALTER TABLE gallery_download_log ENABLE ROW LEVEL SECURITY;

-- Owner reads everything for their galleries.
CREATE POLICY gallery_download_log_owner_select ON gallery_download_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM galleries g JOIN businesses b ON b.id = g.business_id
             WHERE g.id = gallery_download_log.gallery_id
               AND b.user_id = auth.uid())
  );

-- Anon may INSERT a download row, but only for a 'live' gallery.
CREATE POLICY gallery_download_log_public_insert ON gallery_download_log
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (SELECT 1 FROM galleries g
             WHERE g.id = gallery_download_log.gallery_id AND g.status = 'live')
  );

-- ── gallery_favorites ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gallery_favorites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id   UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  image_id     UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  guest_name   TEXT,                      -- optional, e.g. when client gives a name
  note         TEXT,                      -- free-text note from the guest
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gallery_id, image_id, guest_name)
);

CREATE INDEX IF NOT EXISTS gallery_favorites_gallery_idx
  ON gallery_favorites(gallery_id, created_at DESC);

ALTER TABLE gallery_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY gallery_favorites_owner_select ON gallery_favorites
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM galleries g JOIN businesses b ON b.id = g.business_id
             WHERE g.id = gallery_favorites.gallery_id
               AND b.user_id = auth.uid())
  );

-- Anon can favorite + unfavorite on live galleries.
CREATE POLICY gallery_favorites_public_insert ON gallery_favorites
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (SELECT 1 FROM galleries g
             WHERE g.id = gallery_favorites.gallery_id AND g.status = 'live')
  );

CREATE POLICY gallery_favorites_public_delete ON gallery_favorites
  FOR DELETE TO anon
  USING (
    EXISTS (SELECT 1 FROM galleries g
             WHERE g.id = gallery_favorites.gallery_id AND g.status = 'live')
  );

-- ── gallery_email_log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gallery_email_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id      UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject         TEXT,
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','pending')),
  provider_id     TEXT,                   -- Resend message id
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gallery_email_log_gallery_idx
  ON gallery_email_log(gallery_id, created_at DESC);

ALTER TABLE gallery_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY gallery_email_log_owner_select ON gallery_email_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM galleries g JOIN businesses b ON b.id = g.business_id
             WHERE g.id = gallery_email_log.gallery_id
               AND b.user_id = auth.uid())
  );

-- ── Aggregate RPC for the Activities tab ───────────────────────────────────
-- Returns a single JSONB blob with counts + most-recent rows so the
-- dashboard can render the whole tab from one round-trip.
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
        SELECT id, image_id, resolution, download_kind, created_at
          FROM gallery_download_log
         WHERE gallery_id = p_gallery_id
         ORDER BY created_at DESC LIMIT 50
      ) d
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
