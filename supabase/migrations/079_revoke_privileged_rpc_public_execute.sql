-- ─────────────────────────────────────────────────────────────────────────────
-- 079_revoke_privileged_rpc_public_execute.sql — Blocker 1 durability (security)
--
-- Makes the Blocker-1 hotfix permanent. These four SECURITY DEFINER RPCs mutate
-- the token ledger, billing state, and client auth codes. By Postgres default,
-- CREATE FUNCTION grants EXECUTE to PUBLIC, which means any anon/authenticated
-- caller with the SUPABASE_ANON_KEY could invoke them via PostgREST and (because
-- they are SECURITY DEFINER) bypass RLS — minting tokens, marking galleries paid
-- for free, or overwriting client access codes.
--
-- The hotfix REVOKEd PUBLIC/anon/authenticated EXECUTE in production (verified:
-- prod proacl now lists only postgres + service_role). This migration codifies
-- that so a future CREATE OR REPLACE / redeploy / branch-merge cannot silently
-- re-grant PUBLIC and reopen the hole.
--
-- These are intended to be called ONLY by trusted server code holding the
-- service_role key (edge functions: lemonsqueezy-webhook, create-checkout, the
-- server-side client-auth path). service_role keeps its EXECUTE — see notes.
--
-- IDEMPOTENT & SAFE BY CONSTRUCTION:
--   • REVOKE on a privilege the role does not hold is a no-op, never an error.
--   • REVOKE ... FROM PUBLIC/anon/authenticated does NOT touch service_role's
--     own explicit grant, so trusted server callers are unaffected.
--   • No GRANT, no schema change, no data change. Re-runnable any number of times.
--
-- Exact identity signatures below were read from production
-- (vlyiqfawkrjvqcmkpfvs) on 2026-06-29 — they must match prod exactly so the
-- REVOKE targets the real overloads and is not a silent miss.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) add_tokens — mints platform tokens into business_tokens (token economy).
REVOKE EXECUTE ON FUNCTION public.add_tokens(
  p_business_id uuid, p_count integer, p_reason text, p_ref_id uuid, p_metadata jsonb
) FROM PUBLIC, anon, authenticated;

-- 2) reset_subscription_tokens — resets the monthly subscription token balance.
REVOKE EXECUTE ON FUNCTION public.reset_subscription_tokens(
  p_business_id uuid, p_count integer, p_ref_id uuid, p_metadata jsonb
) FROM PUBLIC, anon, authenticated;

-- 3) mark_gallery_paid — flips a gallery to one-time-paid (bypasses the ₪590 gate).
REVOKE EXECUTE ON FUNCTION public.mark_gallery_paid(
  p_business_id uuid, p_gallery_id uuid, p_ref_id uuid, p_months integer, p_metadata jsonb
) FROM PUBLIC, anon, authenticated;

-- 4) set_client_access_code — overwrites a client portal access (PIN) code.
REVOKE EXECUTE ON FUNCTION public.set_client_access_code(
  p_client_id uuid, p_code text
) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── Verification (run after apply; expect ONLY postgres + service_role) ───────
-- SELECT p.proname, COALESCE(r.rolname,'<default>') AS grantee, acl.privilege_type
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- LEFT JOIN LATERAL aclexplode(p.proacl) acl ON true
-- LEFT JOIN pg_roles r ON r.oid = acl.grantee
-- WHERE n.nspname='public'
--   AND p.proname IN ('add_tokens','reset_subscription_tokens',
--                     'mark_gallery_paid','set_client_access_code')
-- ORDER BY p.proname, grantee;
--
-- ── ROLLBACK (only if a legitimate caller is ever proven to need anon/auth, which
--    it should NOT — these are service_role-only by design) ──────────────────────
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.add_tokens(uuid,integer,text,uuid,jsonb) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.reset_subscription_tokens(uuid,integer,uuid,jsonb) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.mark_gallery_paid(uuid,uuid,uuid,integer,jsonb) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.set_client_access_code(uuid,text) TO authenticated;
-- COMMIT;
-- (Reintroducing the vulnerability. Prefer keeping these service_role-only.)
