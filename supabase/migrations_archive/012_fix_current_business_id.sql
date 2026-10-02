-- ─────────────────────────────────────────────────────────────────────────────
-- 012_fix_current_business_id.sql
-- Removes SECURITY DEFINER from current_business_id().
--
-- Symptom: INSERT into gallery_sections (and any other table whose RLS uses
-- `EXISTS (SELECT FROM galleries WHERE business_id = current_business_id())`)
-- failed with "new row violates row-level security policy", even though the
-- preceding INSERT into galleries succeeded with the exact same RLS pattern.
--
-- Root cause: SECURITY DEFINER + STABLE on a function that reads auth.uid()
-- can lose the JWT/auth context when invoked from inside a nested EXISTS
-- subquery during RLS expansion. The outer WITH CHECK on galleries works
-- because the function is called directly from the request context, but the
-- nested call from the gallery_sections policy resolves auth.uid() to NULL
-- inside the planner-rewritten subquery.
--
-- Fix: run as SECURITY INVOKER (the default) so the function executes in
-- the caller's role and JWT context. The businesses_owner_select policy
-- already lets the owner read their own businesses row.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION current_business_id()
RETURNS UUID
LANGUAGE SQL STABLE
AS $$
  SELECT id FROM businesses WHERE user_id = auth.uid() LIMIT 1
$$;

COMMIT;
