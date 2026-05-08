-- 061_public_gallery_sessions.sql
--
-- Phase 4.5.A — backend half of the anon-viewer flow. Builds the table + two
-- RPCs that the new `public_gallery_session` action in /api/append-event-posts
-- will call. No frontend integration yet; this migration is additive.
--
-- Design: docs/PHASE_4_PUBLIC_SESSION_DESIGN.md
--
-- Token model: opaque 32-byte random, base64url-encoded (~43 chars), stored
-- DB-side. IP-bound (per-IP rate limiting), gallery-scoped (one token cannot
-- access another gallery's storage), 60-min TTL with silent refresh.
--
-- Distinct from Phase 3's `client_session_tokens` — different audience
-- (anonymous viewer vs PIN-authenticated dashboard owner), different security
-- model (lower trust, IP-bound, ephemeral). Mixing them complicates RLS.

BEGIN;

-- ─── 1. Extension ─────────────────────────────────────────────────────────

-- pgcrypto provides gen_random_bytes() for token generation. Already enabled
-- on the project (used by Phase 3 client_auth) — kept idempotent.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 2. Table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.public_gallery_sessions (
  token              TEXT         PRIMARY KEY,
  gallery_id         UUID         NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  issued_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ  NOT NULL,
  last_used_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ip                 INET         NOT NULL,
  user_agent         TEXT,
  turnstile_validated BOOLEAN     NOT NULL DEFAULT false,
  refresh_count      SMALLINT     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS public_gallery_sessions_gallery_idx
  ON public.public_gallery_sessions (gallery_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS public_gallery_sessions_ip_idx
  ON public.public_gallery_sessions (ip, issued_at DESC);

-- RLS: deny all. The endpoint accesses this table via SECURITY DEFINER RPCs
-- only. No anon SELECT, no anon INSERT, no authenticated read either.
ALTER TABLE public.public_gallery_sessions ENABLE ROW LEVEL SECURITY;

-- ─── 3. issue_public_gallery_session RPC ──────────────────────────────────
--
-- Mints a fresh 60-min token for (ip, gallery_id), or returns an existing
-- session if one is alive (>5 min until expiry — same-tab refresh idempotency).
-- Validates the gallery is live in the same transaction.
--
-- Caller (the action dispatcher) must do the rate-limit check + Turnstile
-- BEFORE invoking this. This RPC trusts that.

-- Column-naming note: the RETURNS TABLE OUT params (token, expires_at)
-- shadow the table column names of the same name. We use distinct local
-- variables (v_existing_token, v_existing_expires) and qualify table-side
-- references with the table name to keep the function unambiguous.

CREATE OR REPLACE FUNCTION public.issue_public_gallery_session(
  p_gallery_id           UUID,
  p_ip                   INET,
  p_user_agent           TEXT,
  p_turnstile_validated  BOOLEAN
) RETURNS TABLE(token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status           TEXT;
  v_token            TEXT;
  v_expires          TIMESTAMPTZ;
  v_existing_token   TEXT;
  v_existing_expires TIMESTAMPTZ;
BEGIN
  -- Gallery must be live.
  SELECT g.status INTO v_status FROM galleries g WHERE g.id = p_gallery_id;
  IF v_status IS NULL OR v_status NOT IN ('live', 'published') THEN
    RAISE EXCEPTION 'gallery_not_live';
  END IF;

  -- Same-IP same-gallery alive token? Reuse it (and bump last_used_at).
  SELECT s.token, s.expires_at
    INTO v_existing_token, v_existing_expires
    FROM public_gallery_sessions s
   WHERE s.gallery_id = p_gallery_id
     AND s.ip = p_ip
     AND s.expires_at > now() + interval '5 minutes'
   ORDER BY s.expires_at DESC
   LIMIT 1;
  IF v_existing_token IS NOT NULL THEN
    UPDATE public_gallery_sessions
       SET last_used_at = now(),
           refresh_count = public_gallery_sessions.refresh_count + 1,
           user_agent = COALESCE(p_user_agent, public_gallery_sessions.user_agent)
     WHERE public_gallery_sessions.token = v_existing_token;
    RETURN QUERY SELECT v_existing_token, v_existing_expires;
    RETURN;
  END IF;

  -- Mint new token: 32 bytes → base64url ~43 chars. pgcrypto lives in the
  -- `extensions` schema in Supabase, so we qualify explicitly to survive any
  -- search_path change.
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_expires := now() + interval '60 minutes';

  INSERT INTO public_gallery_sessions
    (token, gallery_id, expires_at, ip, user_agent, turnstile_validated)
  VALUES
    (v_token, p_gallery_id, v_expires, p_ip, p_user_agent, p_turnstile_validated);

  RETURN QUERY SELECT v_token, v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_public_gallery_session(UUID, INET, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_public_gallery_session(UUID, INET, TEXT, BOOLEAN) TO service_role;

-- ─── 4. verify_public_gallery_session RPC ─────────────────────────────────
--
-- Used by the signed_url action: given a token + the gallery_id we'd be
-- minting a URL for, returns true if the token is alive AND scoped to that
-- gallery. Also bumps last_used_at.

CREATE OR REPLACE FUNCTION public.verify_public_gallery_session(
  p_token       TEXT,
  p_gallery_id  UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_match BOOLEAN;
BEGIN
  IF p_token IS NULL OR p_token = '' OR p_gallery_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT (s.gallery_id = p_gallery_id AND s.expires_at > now())
    INTO v_match
    FROM public_gallery_sessions s
   WHERE s.token = p_token;

  IF v_match THEN
    UPDATE public_gallery_sessions
       SET last_used_at = now()
     WHERE public_gallery_sessions.token = p_token;
  END IF;

  RETURN COALESCE(v_match, false);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_public_gallery_session(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_public_gallery_session(TEXT, UUID) TO service_role;

-- ─── 5. Reaper RPC ────────────────────────────────────────────────────────
--
-- Idempotent garbage collection of expired session rows. A separate cron job
-- (Phase 4.5.D) will call this hourly. For now it's just available for
-- ad-hoc use.

CREATE OR REPLACE FUNCTION public.reap_expired_public_gallery_sessions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public_gallery_sessions
   WHERE expires_at < now() - interval '1 day'
   RETURNING 1 INTO v_deleted;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.reap_expired_public_gallery_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reap_expired_public_gallery_sessions() TO service_role;

COMMIT;
