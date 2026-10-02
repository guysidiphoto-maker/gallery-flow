-- ─────────────────────────────────────────────────────────────────────────────
-- 034_password_rate_limit.sql
-- After 5 failed attempts on a gallery's password, require a 10-second gap
-- between any subsequent attempts. Successful verification clears the
-- counter immediately.
--
-- Tracking is per-gallery, not per-user/IP: viewers are anonymous so the DB
-- has no trustworthy identity to pin a counter to. A single attacker can
-- therefore delay legitimate viewers by ~10s — that is acceptable because
-- the legitimate viewer's correct password resets the counter immediately.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS gallery_password_attempts (
  gallery_id   UUID PRIMARY KEY REFERENCES galleries(id) ON DELETE CASCADE,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gallery_password_attempts ENABLE ROW LEVEL SECURITY;
-- No policies → only the SECURITY DEFINER RPC below can touch this table.

CREATE OR REPLACE FUNCTION verify_gallery_password(
  p_gallery_id UUID,
  p_password   TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_hash    TEXT;
  gallery_status TEXT;
  attempt_row    gallery_password_attempts%ROWTYPE;
  is_match       BOOLEAN;
  free_attempts  CONSTANT INTEGER  := 5;
  cooldown_sec   CONSTANT INTEGER  := 10;
BEGIN
  IF p_password IS NULL OR length(p_password) = 0 THEN RETURN FALSE; END IF;

  SELECT password_hash, status INTO stored_hash, gallery_status
    FROM galleries WHERE id = p_gallery_id;
  IF stored_hash IS NULL THEN RETURN FALSE; END IF;
  IF gallery_status <> 'live' THEN RETURN FALSE; END IF;

  -- Lock the counter row so concurrent guesses can't race past the cooldown.
  SELECT * INTO attempt_row FROM gallery_password_attempts
    WHERE gallery_id = p_gallery_id FOR UPDATE;

  -- After 5 failures, enforce a 10s gap between attempts. Reject without
  -- doing the bcrypt work so the cooldown can't be used as a CPU sink.
  IF FOUND
     AND attempt_row.failed_count >= free_attempts
     AND attempt_row.last_attempt > now() - make_interval(secs => cooldown_sec)
  THEN
    RETURN FALSE;
  END IF;

  is_match := extensions.crypt(p_password, stored_hash) = stored_hash;

  IF is_match THEN
    DELETE FROM gallery_password_attempts WHERE gallery_id = p_gallery_id;
    RETURN TRUE;
  END IF;

  INSERT INTO gallery_password_attempts (gallery_id, failed_count, last_attempt)
       VALUES (p_gallery_id, 1, now())
  ON CONFLICT (gallery_id) DO UPDATE
     SET failed_count = gallery_password_attempts.failed_count + 1,
         last_attempt = now();

  RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION verify_gallery_password(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION verify_gallery_password(UUID, TEXT) TO anon, authenticated;

COMMIT;
