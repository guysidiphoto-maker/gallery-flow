-- Migration 057: Client auth — hashed access code + signed session tokens
--
-- Context: Phase 3 hardens the public client-dashboard PIN.
-- Today, `delivery_settings.clientCode` is a plain-text 4-char PIN that is
-- anon-readable via Supabase REST (audit B1, docs/PRODUCTION_AUDIT_2026_05_08.md).
-- This migration introduces:
--   1) clients.access_code_hash    — bcrypt-hashed code, anon-unreadable
--   2) client_session_tokens       — service-role-only token store (30-day expiry)
--   3) client_code_attempts        — rate-limit ledger (5 fails / 15 min cooldown)
--   4) RPCs: verify_client_code, verify_client_token, set_client_access_code
--   5) Backfill: hash any clientCode currently in delivery_settings
--
-- Backward compatibility: clients.access_code_hash is nullable. Frontend may
-- fall back to legacy plain-text PIN compare for clients whose hash has not
-- yet been set. Live galleries continue to function unchanged.
--
-- DO NOT remove delivery_settings.clientCode in this migration. Removal is
-- a separate Phase 3 cleanup once all clients have a hash.

-- ============================================================
-- 0) Required extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1) Schema additions
-- ============================================================

-- Hashed access code per client. Nullable during transition; non-null
-- post-Phase-3-rollout.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS access_code_hash TEXT;

-- Track when each code was last set (for rotation analytics, audit).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS access_code_set_at TIMESTAMPTZ;

-- Session token storage. One token per (client_id, token) pair, expiry-based.
CREATE TABLE IF NOT EXISTS client_session_tokens (
  token         TEXT PRIMARY KEY,                          -- random 32-char base64url
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,                       -- e.g., now() + 30 days
  last_used_at  TIMESTAMPTZ,
  user_agent    TEXT,                                       -- for audit
  ip            INET                                        -- for audit (best-effort)
);
CREATE INDEX IF NOT EXISTS client_session_tokens_client_id_idx
  ON client_session_tokens(client_id);
CREATE INDEX IF NOT EXISTS client_session_tokens_expires_at_idx
  ON client_session_tokens(expires_at);
ALTER TABLE client_session_tokens ENABLE ROW LEVEL SECURITY;
-- No anon access. Service-role only. (No policies = blocked for anon/authenticated.)

-- Rate-limit table: per (client_id, ip) bucket, sliding window.
CREATE TABLE IF NOT EXISTS client_code_attempts (
  id            BIGSERIAL PRIMARY KEY,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ip            INET,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  success       BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS client_code_attempts_client_idx
  ON client_code_attempts(client_id, attempted_at DESC);
ALTER TABLE client_code_attempts ENABLE ROW LEVEL SECURITY;
-- Service-role only.

-- ============================================================
-- 2) RPCs (SECURITY DEFINER, search_path-locked)
-- ============================================================

-- verify_client_code:
--   Verifies a code, issues a token, logs the attempt.
--   Returns (token, expires_at, cooldown_until).
--     - On success: token + expires_at filled, cooldown_until NULL.
--     - On failure: token + expires_at NULL, cooldown_until NULL (or set if locked).
--     - On lockout: token + expires_at NULL, cooldown_until = end of cooldown window.
--   Cooldown rule: 5+ failed attempts within 15 min => reject for 15 min from
--   the most recent failure.
CREATE OR REPLACE FUNCTION verify_client_code(
  p_client_id   UUID,
  p_code        TEXT,
  p_ip          INET DEFAULT NULL,
  p_user_agent  TEXT DEFAULT NULL
)
RETURNS TABLE (token TEXT, expires_at TIMESTAMPTZ, cooldown_until TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash             TEXT;
  v_recent_failures  INT;
  v_cooldown_until   TIMESTAMPTZ;
  v_token            TEXT;
  v_expires          TIMESTAMPTZ;
BEGIN
  -- Cooldown check: 5+ failures in last 15 minutes by this client.
  SELECT COUNT(*) INTO v_recent_failures
  FROM client_code_attempts
  WHERE client_id = p_client_id
    AND success = false
    AND attempted_at > now() - interval '15 minutes';

  IF v_recent_failures >= 5 THEN
    SELECT max(attempted_at) + interval '15 minutes' INTO v_cooldown_until
    FROM client_code_attempts
    WHERE client_id = p_client_id
      AND success = false
      AND attempted_at > now() - interval '15 minutes';

    INSERT INTO client_code_attempts (client_id, ip, success)
      VALUES (p_client_id, p_ip, false);

    RETURN QUERY SELECT NULL::TEXT, NULL::TIMESTAMPTZ, v_cooldown_until;
    RETURN;
  END IF;

  SELECT access_code_hash INTO v_hash
  FROM clients
  WHERE id = p_client_id;

  IF v_hash IS NULL THEN
    -- Not yet migrated. Caller (frontend) should fall back to legacy
    -- plain-text PIN compare against delivery_settings.clientCode.
    RETURN QUERY SELECT NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_hash = crypt(p_code, v_hash) THEN
    -- Valid. Issue url-safe base64 token, log success.
    v_token   := encode(gen_random_bytes(24), 'base64');
    v_token   := translate(v_token, '+/=', '-_');
    v_expires := now() + interval '30 days';

    INSERT INTO client_session_tokens (token, client_id, expires_at, user_agent, ip)
      VALUES (v_token, p_client_id, v_expires, p_user_agent, p_ip);

    INSERT INTO client_code_attempts (client_id, ip, success)
      VALUES (p_client_id, p_ip, true);

    RETURN QUERY SELECT v_token, v_expires, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Wrong code.
  INSERT INTO client_code_attempts (client_id, ip, success)
    VALUES (p_client_id, p_ip, false);

  RETURN QUERY SELECT NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
END
$$;

-- verify_client_token:
--   Returns client_id if the token is non-NULL, long-enough, and unexpired;
--   touches last_used_at. Returns NULL otherwise.
CREATE OR REPLACE FUNCTION verify_client_token(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN NULL;
  END IF;

  SELECT client_id INTO v_client_id
  FROM client_session_tokens
  WHERE token = p_token
    AND expires_at > now();

  IF v_client_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Touch last_used_at for analytics.
  UPDATE client_session_tokens
    SET last_used_at = now()
    WHERE token = p_token;

  RETURN v_client_id;
END
$$;

-- set_client_access_code:
--   Set/rotate the bcrypt hash for a client. Photographer dashboard caller
--   must already be authenticated; ownership of the client is enforced by
--   the dashboard's auth context, not this function (see permissions below).
CREATE OR REPLACE FUNCTION set_client_access_code(p_client_id UUID, p_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_code IS NULL OR length(p_code) < 4 THEN
    RAISE EXCEPTION 'access code must be at least 4 characters';
  END IF;

  UPDATE clients
    SET access_code_hash    = crypt(p_code, gen_salt('bf', 8)),
        access_code_set_at  = now()
    WHERE id = p_client_id;
END
$$;

-- ============================================================
-- Permissions
-- ============================================================
-- verify_* are anon-callable (their internal logic is the gate).
-- set_client_access_code is authenticated-only.
REVOKE ALL ON FUNCTION verify_client_code(UUID, TEXT, INET, TEXT)   FROM PUBLIC;
REVOKE ALL ON FUNCTION verify_client_token(TEXT)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION set_client_access_code(UUID, TEXT)           FROM PUBLIC;

GRANT EXECUTE ON FUNCTION verify_client_code(UUID, TEXT, INET, TEXT)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION verify_client_token(TEXT)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION set_client_access_code(UUID, TEXT)
  TO authenticated, service_role;

-- ============================================================
-- 3) Backfill existing client codes
-- ============================================================
-- For every client with a non-empty clientCode in any of their galleries'
-- delivery_settings, hash the code from the most-recently-published gallery
-- and store it on clients.access_code_hash. Skip clients that already have
-- a hash (idempotent re-run).
WITH first_codes AS (
  SELECT DISTINCT ON (g.client_id)
    g.client_id,
    (g.delivery_settings ->> 'clientCode') AS code
  FROM galleries g
  WHERE g.client_id IS NOT NULL
    AND coalesce(g.delivery_settings ->> 'clientCode', '') <> ''
  ORDER BY g.client_id, g.published_at DESC NULLS LAST
)
UPDATE clients c
SET access_code_hash    = crypt(fc.code, gen_salt('bf', 8)),
    access_code_set_at  = now()
FROM first_codes fc
WHERE c.id = fc.client_id
  AND c.access_code_hash IS NULL;

-- ============================================================
-- 4) Verification queries (run manually after apply)
-- ============================================================
-- 1. Backfill counts:
--      SELECT count(*) AS clients_with_hash    FROM clients WHERE access_code_hash IS NOT NULL;
--      SELECT count(*) AS clients_without_hash FROM clients WHERE access_code_hash IS NULL;
--
-- 2. RPC sanity (replace placeholders):
--      SELECT * FROM verify_client_code('<known-uuid>'::uuid, '<known-code>');  -- token+expiry
--      SELECT * FROM verify_client_code('<known-uuid>'::uuid, 'wrong');         -- NULL row
--      SELECT verify_client_token('<token-from-above>');                        -- client uuid
--      SELECT verify_client_token('bad');                                       -- NULL
--
-- 3. Token table should be empty right after apply:
--      SELECT count(*) FROM client_session_tokens;
--
-- 4. RLS confirmation (anon must see zero rows):
--      SET ROLE anon; SELECT count(*) FROM client_session_tokens;     -- 0
--      SET ROLE anon; SELECT count(*) FROM client_code_attempts;      -- 0
--      RESET ROLE;
