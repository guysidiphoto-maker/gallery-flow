-- =============================================================================
-- Migration: 056_feed_plans_draft_visibility.sql
-- Phase:    2 (stopgap)
-- Audit:    Finding A5 — draft feed plans invisible to anon client dashboard
-- =============================================================================
--
-- WHAT
-- ----
-- Drops the existing anon SELECT policy `feed_plans_public_select` on
-- `public.feed_plans` and recreates it with `'draft'` added to the allowed
-- status set. The new USING clause:
--
--     status IN ('draft','accepted','published')
--
-- WHY
-- ---
-- `/api/generate-feed` inserts freshly-generated plans with `status='draft'`.
-- The public client dashboard reads `feed_plans` via the anon key. The current
-- policy excludes `'draft'`, so on refresh the plan vanishes from the UI even
-- though the row is committed to the database. This is purely an RLS
-- visibility bug — no data is missing.
--
-- Verified against production (project vlyiqfawkrjvqcmkpfvs) on 2026-05-06:
--   polname:  feed_plans_public_select
--   polcmd:   r (SELECT)
--   polroles: {anon}
--   qual:     (status = ANY (ARRAY['accepted'::text, 'published'::text]))
-- The policy name and shape match this migration's DROP target exactly.
--
-- RISK ASSESSMENT
-- ---------------
-- This widens anon read access. Consequences:
--   1. Anyone holding a client URL can now read draft plans for that client.
--   2. The policy is NOT scoped by `client_id` — it gates only on `status` —
--      so technically any anon caller who guesses a feed_plans row id (or
--      enumerates business_id / client_id UUIDs) can read any draft. This
--      same scoping gap already exists today for 'accepted' and 'published'
--      rows; this migration does not introduce a new class of leak, only
--      enlarges the existing one to include drafts.
--   3. Drafts may contain unreleased AI-generated copy / image picks the
--      photographer has not yet approved. Treat this as "internal-but-
--      url-guessable" until Phase 3 lands.
--
-- PHASE 3 FOLLOW-UP (planned)
-- ---------------------------
-- Phase 3 will replace this status-only USING clause with a session-token-
-- scoped predicate that restricts SELECTs to plans whose `client_id` matches
-- the verified-client identity carried in the request (signed gate token).
-- At that point, the `'draft'` inclusion here becomes safe by construction
-- because the policy will require a valid client session, not just the anon
-- role. Tracking: Phase 3 RLS hardening epic.
--
-- ROLLBACK
-- --------
-- See the inline rollback block at the bottom of this file.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS feed_plans_public_select ON public.feed_plans;

CREATE POLICY feed_plans_public_select ON public.feed_plans
  FOR SELECT
  TO anon
  USING (status IN ('draft', 'accepted', 'published'));

COMMIT;

-- =============================================================================
-- ROLLBACK (run manually if you need to revert to pre-056 behavior)
-- =============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS feed_plans_public_select ON public.feed_plans;
-- CREATE POLICY feed_plans_public_select ON public.feed_plans
--   FOR SELECT
--   TO anon
--   USING (status IN ('accepted', 'published'));
-- COMMIT;
-- =============================================================================

-- =============================================================================
-- VERIFICATION (run after applying — confirms new policy is in place)
-- =============================================================================
-- SELECT polname, polcmd, polroles::regrole[], qual
-- FROM pg_policy
-- WHERE polrelid = 'feed_plans'::regclass;
--
-- Expected row for this migration:
--   polname  = feed_plans_public_select
--   polcmd   = r
--   polroles = {anon}
--   qual     = (status = ANY (ARRAY['draft'::text, 'accepted'::text, 'published'::text]))
-- =============================================================================
