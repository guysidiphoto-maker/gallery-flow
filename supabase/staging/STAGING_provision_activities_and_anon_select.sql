-- ─────────────────────────────────────────────────────────────────────────────
-- STAGING_provision_activities_and_anon_select.sql
--
-- STAGING-ONLY catch-up for the CPV2 staging project (idzeizesynyjcyfqfznh),
-- which is a viewer-first reconstruction that was MISSING two things migration
-- 110 (download tracking) and the public download path depend on:
--
--   1. The 045 Activities objects — gallery_download_log / gallery_favorites /
--      gallery_email_log + gallery_activity_summary + their RLS. Prod has these
--      from migration 045; the reconstruction never applied it.
--   2. The anon SELECT policy on galleries for live, password-free galleries
--      (prod: galleries_public_live_select). Without it the anon INSERT policy
--      on gallery_download_log can't satisfy its EXISTS-against-galleries, so
--      NO download logging (base or attributed) is possible.
--
-- This is NOT a numbered production migration — production already has all of
-- this. It exists so the staging project can be rebuilt to the same contract.
-- Apply it BEFORE supabase/migrations/110_download_tracking_email.sql on a fresh
-- reconstruction. Idempotent (IF NOT EXISTS / OR REPLACE / guarded policies).
--
-- NOTE on the public write path (verified 2026-08-03 on staging): a guest's
-- browser inserts via the anon key WITHOUT return=representation, so PostgREST
-- never reads the row back — the download log intentionally has NO anon SELECT
-- policy (owner-only reads). Do not add one; attributed inserts (guest_email/
-- guest_name) succeed as long as the insert is fire-and-forget.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Activities objects (mirror of 045_activities_and_favorites.sql) ───────
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

DROP POLICY IF EXISTS gallery_download_log_owner_select ON gallery_download_log;
CREATE POLICY gallery_download_log_owner_select ON gallery_download_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM galleries g JOIN businesses b ON b.id = g.business_id
                  WHERE g.id = gallery_download_log.gallery_id AND b.user_id = auth.uid()));
DROP POLICY IF EXISTS gallery_download_log_public_insert ON gallery_download_log;
CREATE POLICY gallery_download_log_public_insert ON gallery_download_log
  FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM galleries g
                       WHERE g.id = gallery_download_log.gallery_id AND g.status = 'live'));

CREATE TABLE IF NOT EXISTS gallery_favorites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id   UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  image_id     UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  guest_name   TEXT,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gallery_id, image_id, guest_name)
);
CREATE INDEX IF NOT EXISTS gallery_favorites_gallery_idx
  ON gallery_favorites(gallery_id, created_at DESC);
ALTER TABLE gallery_favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gallery_favorites_owner_select ON gallery_favorites;
CREATE POLICY gallery_favorites_owner_select ON gallery_favorites
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM galleries g JOIN businesses b ON b.id = g.business_id
                  WHERE g.id = gallery_favorites.gallery_id AND b.user_id = auth.uid()));
DROP POLICY IF EXISTS gallery_favorites_public_insert ON gallery_favorites;
CREATE POLICY gallery_favorites_public_insert ON gallery_favorites
  FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM galleries g
                       WHERE g.id = gallery_favorites.gallery_id AND g.status = 'live'));
DROP POLICY IF EXISTS gallery_favorites_public_delete ON gallery_favorites;
CREATE POLICY gallery_favorites_public_delete ON gallery_favorites
  FOR DELETE TO anon
  USING (EXISTS (SELECT 1 FROM galleries g
                  WHERE g.id = gallery_favorites.gallery_id AND g.status = 'live'));

CREATE TABLE IF NOT EXISTS gallery_email_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id      UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject         TEXT,
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','pending')),
  provider_id     TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gallery_email_log_gallery_idx
  ON gallery_email_log(gallery_id, created_at DESC);
ALTER TABLE gallery_email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gallery_email_log_owner_select ON gallery_email_log;
CREATE POLICY gallery_email_log_owner_select ON gallery_email_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM galleries g JOIN businesses b ON b.id = g.business_id
                  WHERE g.id = gallery_email_log.gallery_id AND b.user_id = auth.uid()));

-- gallery_activity_summary base shape (045); migration 110 later redefines it
-- to add guest_email + the downloaders roll-up.
CREATE OR REPLACE FUNCTION gallery_activity_summary(p_gallery_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_business UUID; v_caller_business UUID; v_result JSONB;
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
    'recent_downloads', COALESCE((SELECT jsonb_agg(d.*) FROM (
        SELECT id, image_id, resolution, download_kind, created_at
          FROM gallery_download_log WHERE gallery_id = p_gallery_id
         ORDER BY created_at DESC LIMIT 50) d), '[]'::jsonb),
    'recent_favorites', COALESCE((SELECT jsonb_agg(f.*) FROM (
        SELECT id, image_id, guest_name, note, created_at
          FROM gallery_favorites WHERE gallery_id = p_gallery_id
         ORDER BY created_at DESC LIMIT 50) f), '[]'::jsonb),
    'recent_emails', COALESCE((SELECT jsonb_agg(e.*) FROM (
        SELECT id, recipient_email, subject, status, created_at
          FROM gallery_email_log WHERE gallery_id = p_gallery_id
         ORDER BY created_at DESC LIMIT 50) e), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;
GRANT EXECUTE ON FUNCTION gallery_activity_summary(UUID) TO authenticated;

-- ── 2. Anon SELECT on live, password-free galleries (prod parity) ────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.galleries'::regclass
                  AND polname='galleries_public_live_select') THEN
    CREATE POLICY galleries_public_live_select ON public.galleries
      FOR SELECT TO anon
      USING (status = 'live'::gallery_status AND password_hash IS NULL);
  END IF;
END $$;

COMMIT;
