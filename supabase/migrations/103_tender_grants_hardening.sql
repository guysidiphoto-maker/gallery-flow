-- 101_tender_grants_hardening.sql — Overnight 2026-07-24 security follow-up.
--
-- Closes a LOW least-privilege finding from the sprint security review:
-- migration 100 relied on Supabase's DEFAULT role grants for the two tender
-- tables instead of the explicit REVOKE-from-anon / GRANT-to-authenticated
-- convention used by 099 (import) and the CPV2 migrations. RLS already fails
-- closed on both tables (owner-scoped USING/WITH CHECK, no anon policy), so
-- this is hygiene/defense-in-depth, not an exploitable gap — it simply makes
-- the privilege posture explicit and consistent.
--
-- The tender tables use RLS to constrain rows; authenticated owners need the
-- full CRUD verbs (writes go direct under RLS, unlike the import tables which
-- are service-role-write-only and only GRANT SELECT). Service role bypasses
-- RLS by default for any server-side maintenance.
--
-- Additive + idempotent (REVOKE/GRANT are declarative). NOT applied to prod or
-- staging by this program (QA project pixflow-cpv2-qa2 only).
-- Paired rollback: 101_tender_grants_hardening_rollback.sql

BEGIN;

REVOKE ALL ON public.tender_collections, public.tender_collection_items FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.tender_collections, public.tender_collection_items
  TO authenticated;

COMMIT;

-- Verification (manual, after apply):
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_name IN ('tender_collections','tender_collection_items')
--       AND grantee IN ('anon','authenticated') ORDER BY grantee, privilege_type;
--   -- Expect: no 'anon' rows; 'authenticated' has SELECT/INSERT/UPDATE/DELETE.
--   -- RLS still governs WHICH rows: SET ROLE authenticated + a foreign
--   -- business's row is invisible/insert-rejected.
