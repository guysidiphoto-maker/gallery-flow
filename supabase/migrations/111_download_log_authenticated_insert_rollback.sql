-- Rollback for 111 — removes the authenticated INSERT policy on
-- gallery_download_log. After rollback, only anon may log downloads again.
DROP POLICY IF EXISTS gallery_download_log_authed_insert ON gallery_download_log;
