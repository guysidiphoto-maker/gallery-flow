-- 093_cpv2_auth_helpers.sql — Client Portal V2: server-only auth lookup helper.
--
-- Lets the accept-invitation server flow discover whether an invited email
-- already has a Supabase Auth account (e.g. the person already belongs to
-- another client) WITHOUT touching or resetting that account's password.
-- SECURITY DEFINER + service_role only. Returns just the id (no PII beyond the
-- caller-supplied email), never a password/hash.
--
-- NOT APPLIED by this program. Paired rollback: 093_cpv2_auth_helpers_rollback.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.cpv2_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.cpv2_auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cpv2_auth_user_id_by_email(text) TO service_role;

COMMIT;
