-- ─────────────────────────────────────────────────────────────────────────────
-- 013_debug_auth_state.sql
-- TEMPORARY diagnostic RPC. Returns the auth context as PostgREST sees it
-- when called from the desktop app. Used to investigate the gallery_sections
-- RLS failure that does NOT reproduce in the SQL Editor.
--
-- Drop this once the bug is understood.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION debug_auth_state()
RETURNS jsonb
LANGUAGE SQL STABLE
AS $$
  SELECT jsonb_build_object(
    'auth_uid',            auth.uid(),
    'auth_role',           auth.role(),
    'current_business_id', current_business_id(),
    'jwt_claim_sub',       current_setting('request.jwt.claim.sub', true),
    'jwt_claims',          current_setting('request.jwt.claims',    true),
    'session_user',        session_user,
    'current_user',        current_user
  )
$$;

GRANT EXECUTE ON FUNCTION debug_auth_state() TO authenticated, anon;
