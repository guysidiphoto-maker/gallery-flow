-- ─────────────────────────────────────────────────────────────────────────────
-- 111_download_log_authenticated_insert.sql — Log downloads from authenticated
-- sessions too.
--
-- gallery_download_log (045) only permits INSERT for the `anon` role. But a
-- viewer can be authenticated — the photographer previewing their own live
-- gallery, or a logged-in visitor whose Supabase session is shared across tabs.
-- Those downloads silently failed to record (RLS rejects the insert), so the
-- "who downloaded what" tracking looked broken whenever the downloader had a
-- session.
--
-- This adds an `authenticated` INSERT policy mirroring the anon one: the row is
-- accepted as long as it targets a LIVE gallery. Reads stay owner-only.
--
-- Additive; does not modify applied migrations. Reversible (see _rollback).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP POLICY IF EXISTS gallery_download_log_authed_insert ON gallery_download_log;
CREATE POLICY gallery_download_log_authed_insert ON gallery_download_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM galleries g
             WHERE g.id = gallery_download_log.gallery_id AND g.status = 'live')
  );

COMMIT;
