-- ─────────────────────────────────────────────────────────────────────────────
-- 035_password_rate_limit_response.sql
-- Surface the cooldown to the client. verify_gallery_password() now returns
-- a JSONB object instead of a bare boolean so the password gate can show
-- "too many attempts, wait Ns" instead of a misleading "incorrect password"
-- during the lockout window.
--
-- Shape:
--   { "ok": true }                                         -- correct password
--   { "ok": false }                                        -- wrong password, no cooldown
--   { "ok": false, "retry_after_seconds": <int> }          -- in cooldown
--
-- The boolean overload from migration 034 is dropped so callers must move to
-- the JSONB version.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP FUNCTION IF EXISTS verify_gallery_password(UUID, TEXT);

CREATE OR REPLACE FUNCTION verify_gallery_password(
  p_gallery_id UUID,
  p_password   TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_hash    TEXT;
  gallery_status TEXT;
  attempt_row    gallery_password_attempts%ROWTYPE;
  is_match       BOOLEAN;
  free_attempts  CONSTANT INTEGER := 5;
  cooldown_sec   CONSTANT INTEGER := 10;
  remaining      INTEGER;
BEGIN
  IF p_password IS NULL OR length(p_password) = 0 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT password_hash, status INTO stored_hash, gallery_status
    FROM galleries WHERE id = p_gallery_id;
  IF stored_hash IS NULL OR gallery_status <> 'live' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO attempt_row FROM gallery_password_attempts
    WHERE gallery_id = p_gallery_id FOR UPDATE;

  IF FOUND AND attempt_row.failed_count >= free_attempts THEN
    remaining := cooldown_sec
               - EXTRACT(EPOCH FROM (now() - attempt_row.last_attempt))::INTEGER;
    IF remaining > 0 THEN
      -- Still locked. Don't run bcrypt; just report retry-after.
      RETURN jsonb_build_object('ok', false, 'retry_after_seconds', remaining);
    END IF;
  END IF;

  is_match := extensions.crypt(p_password, stored_hash) = stored_hash;

  IF is_match THEN
    DELETE FROM gallery_password_attempts WHERE gallery_id = p_gallery_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  INSERT INTO gallery_password_attempts (gallery_id, failed_count, last_attempt)
       VALUES (p_gallery_id, 1, now())
  ON CONFLICT (gallery_id) DO UPDATE
     SET failed_count = gallery_password_attempts.failed_count + 1,
         last_attempt = now()
  RETURNING * INTO attempt_row;

  -- If this failure pushed us into the cooldown band, tell the client.
  IF attempt_row.failed_count >= free_attempts THEN
    RETURN jsonb_build_object('ok', false, 'retry_after_seconds', cooldown_sec);
  END IF;

  RETURN jsonb_build_object('ok', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION verify_gallery_password(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION verify_gallery_password(UUID, TEXT) TO anon, authenticated;

COMMIT;
