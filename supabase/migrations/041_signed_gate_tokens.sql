-- ─────────────────────────────────────────────────────────────────────────────
-- 041_signed_gate_tokens.sql
-- Server-side enforcement of the gallery password gate.
--
-- Today the unlock state lives in sessionStorage on the client. RLS on images
-- only checks `status='live'`, so a guest can paste one DevTools line and read
-- every image of any private gallery.
--
-- This migration introduces a per-gallery opt-in flag (signed_gate_enabled) and
-- a session-token table. When the flag is on AND the gallery has a password,
-- the viewer must obtain a token from verify_gallery_password() and pass it to
-- the new gallery_get_* RPCs to read meta / images / stories / hidden state.
--
-- Behaviour for existing galleries (flag default = false) is unchanged. Live
-- clients (alma, lsports) are not affected until we flip the flag.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS signed_gate_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS gallery_unlock_tokens (
  token       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id  UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gallery_unlock_tokens_gallery_idx
  ON gallery_unlock_tokens(gallery_id);
CREATE INDEX IF NOT EXISTS gallery_unlock_tokens_expires_idx
  ON gallery_unlock_tokens(expires_at);

ALTER TABLE gallery_unlock_tokens ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies. Only SECURITY DEFINER functions touch this table.

-- ─────────────────────────────────────────────────────────────────────────────
-- verify_gallery_password — issues a token when signed_gate_enabled.
-- Response shapes:
--   { ok: true }                                                 (legacy galleries)
--   { ok: true, token: <uuid>, expires_at: <ts> }                (gated galleries)
--   { ok: false }                                                (wrong password)
--   { ok: false, retry_after_seconds: <n> }                      (cooldown)
-- ─────────────────────────────────────────────────────────────────────────────

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
  gate_enabled   BOOLEAN;
  attempt_row    gallery_password_attempts%ROWTYPE;
  is_match       BOOLEAN;
  free_attempts  CONSTANT INTEGER := 5;
  cooldown_sec   CONSTANT INTEGER := 10;
  remaining      INTEGER;
  v_token        UUID;
  v_expires      TIMESTAMPTZ;
BEGIN
  IF p_password IS NULL OR length(p_password) = 0 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT password_hash, status, signed_gate_enabled
    INTO stored_hash, gallery_status, gate_enabled
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
      RETURN jsonb_build_object('ok', false, 'retry_after_seconds', remaining);
    END IF;
  END IF;

  is_match := extensions.crypt(p_password, stored_hash) = stored_hash;

  IF is_match THEN
    DELETE FROM gallery_password_attempts WHERE gallery_id = p_gallery_id;
    IF gate_enabled THEN
      v_expires := now() + interval '4 hours';
      INSERT INTO gallery_unlock_tokens (gallery_id, expires_at)
      VALUES (p_gallery_id, v_expires)
      RETURNING token INTO v_token;
      RETURN jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_expires);
    END IF;
    RETURN jsonb_build_object('ok', true);
  END IF;

  INSERT INTO gallery_password_attempts (gallery_id, failed_count, last_attempt)
       VALUES (p_gallery_id, 1, now())
  ON CONFLICT (gallery_id) DO UPDATE
     SET failed_count = gallery_password_attempts.failed_count + 1,
         last_attempt = now()
  RETURNING * INTO attempt_row;
  IF attempt_row.failed_count >= free_attempts THEN
    RETURN jsonb_build_object('ok', false, 'retry_after_seconds', cooldown_sec);
  END IF;
  RETURN jsonb_build_object('ok', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION verify_gallery_password(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION verify_gallery_password(UUID, TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Authorization helper: returns true if (gallery_id, token) authorizes a read.
-- Rules:
--   - gallery must exist and be 'live'
--   - if signed_gate_enabled AND password_hash IS NOT NULL: token required + valid
--   - otherwise: any anon caller is implicitly authorized (legacy behaviour)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _gallery_authz(p_gallery_id UUID, p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_pw   BOOLEAN;
  gated    BOOLEAN;
  status_  TEXT;
  ok       BOOLEAN;
BEGIN
  SELECT password_hash IS NOT NULL, signed_gate_enabled, status
    INTO has_pw, gated, status_
    FROM galleries WHERE id = p_gallery_id;
  IF status_ IS NULL OR status_ <> 'live' THEN RETURN false; END IF;
  IF has_pw AND gated THEN
    IF p_token IS NULL THEN RETURN false; END IF;
    SELECT EXISTS (
      SELECT 1 FROM gallery_unlock_tokens
       WHERE token = p_token AND gallery_id = p_gallery_id AND expires_at > now()
    ) INTO ok;
    RETURN ok;
  END IF;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION _gallery_authz(UUID, UUID) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- Read RPCs the viewer will use instead of direct table SELECTs.
-- Returns omit password_hash. All gates short-circuit to empty/null when not
-- authorized — never raise — so a malicious caller learns nothing from errors.
-- ─────────────────────────────────────────────────────────────────────────────

-- gallery_get_meta is intentionally token-free: the password gate itself needs
-- the gallery row (name, theme, accessType) to render, and that row was already
-- anon-readable via RLS. We strip password_hash and return a synthetic
-- has_password boolean so the client can decide whether to show the gate.
CREATE OR REPLACE FUNCTION gallery_get_meta(
  p_gallery_id UUID
) RETURNS JSONB
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  status_ TEXT;
BEGIN
  SELECT status INTO status_ FROM galleries WHERE id = p_gallery_id;
  IF status_ IS NULL OR status_ NOT IN ('live', 'published', 'draft') THEN
    RETURN NULL;
  END IF;
  SELECT (to_jsonb(g) - 'password_hash')
       || jsonb_build_object('has_password', g.password_hash IS NOT NULL)
    INTO result
    FROM galleries g
   WHERE g.id = p_gallery_id;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION gallery_get_meta(UUID) TO anon, authenticated;

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
     ORDER BY created_at ASC
     LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 500), 2000))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;
GRANT EXECUTE ON FUNCTION gallery_get_images(UUID, UUID, INT, INT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION gallery_get_stories(
  p_gallery_id UUID,
  p_token UUID DEFAULT NULL
) RETURNS SETOF stories
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN RETURN; END IF;
  RETURN QUERY
    SELECT * FROM stories WHERE gallery_id = p_gallery_id ORDER BY created_at ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION gallery_get_stories(UUID, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION gallery_get_hidden(
  p_gallery_id UUID,
  p_token UUID DEFAULT NULL
) RETURNS SETOF gallery_hidden_images
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN RETURN; END IF;
  RETURN QUERY
    SELECT * FROM gallery_hidden_images WHERE gallery_id = p_gallery_id;
END;
$$;
GRANT EXECUTE ON FUNCTION gallery_get_hidden(UUID, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION gallery_set_hidden(
  p_gallery_id UUID,
  p_image_id UUID,
  p_hidden BOOLEAN,
  p_token UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_hidden THEN
    INSERT INTO gallery_hidden_images (gallery_id, image_id)
    VALUES (p_gallery_id, p_image_id)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM gallery_hidden_images
     WHERE gallery_id = p_gallery_id AND image_id = p_image_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION gallery_set_hidden(UUID, UUID, BOOLEAN, UUID) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Authz helper exposed for edge functions (rekognition).
-- Returns true if the token authorizes face-search for the gallery.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gallery_token_is_valid(p_gallery_id UUID, p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN _gallery_authz(p_gallery_id, p_token);
END;
$$;
GRANT EXECUTE ON FUNCTION gallery_token_is_valid(UUID, UUID) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Token GC. Call from a scheduled edge function once per hour.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION purge_expired_unlock_tokens() RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  WITH d AS (
    DELETE FROM gallery_unlock_tokens WHERE expires_at < now() RETURNING 1
  )
  SELECT count(*) INTO n FROM d;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION purge_expired_unlock_tokens() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION purge_expired_unlock_tokens() TO authenticated, service_role;

COMMIT;
