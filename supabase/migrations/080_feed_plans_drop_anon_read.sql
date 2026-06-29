-- ─────────────────────────────────────────────────────────────────────────────
-- 080_feed_plans_drop_anon_read.sql — P0 security: close anon cross-tenant read
--
-- BUG: policy `feed_plans_public_select` grants role `anon` SELECT on
-- public.feed_plans with `USING (status IN ('draft','accepted','published'))` —
-- NO business scoping. Any anonymous visitor (anon key) could read EVERY
-- business's AI feed plans, including unpublished DRAFTS. This is the flagship
-- paid feature's content leaking cross-tenant.
--
-- Verified on prod (2026-06-29, read-only): anon could read 6 rows across 1
-- business, 3 of them drafts. It is the ONLY policy granting anon SELECT here.
--
-- FIX: drop the anon SELECT policy. No public/anon surface reads feed_plans —
-- the only non-service-role reader is the authenticated photographer dashboard
-- (FeedStudio.tsx), covered by `feed_plans_owner_select`
-- (business.user_id = auth.uid()). The server paths (plan-event, generate-feed,
-- append-event-posts) use service_role, which bypasses RLS. So dropping the
-- anon policy removes the leak with ZERO functional impact.
--
-- SAFE & REVERSIBLE: drops one permissive policy; touches no data, no other
-- policy, no other table. Idempotent (IF EXISTS). Rollback below.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP POLICY IF EXISTS feed_plans_public_select ON public.feed_plans;

COMMIT;

-- ── Verification (after apply) ──────────────────────────────────────────────
-- As anon, this must now return 0 / be denied:
--   SET ROLE anon; SELECT count(*) FROM public.feed_plans; RESET ROLE;
-- The authenticated owner must STILL read their own (via feed_plans_owner_select).
-- Confirm no anon SELECT policy remains:
--   SELECT polname FROM pg_policy
--   WHERE polrelid='public.feed_plans'::regclass
--     AND 'anon' = ANY(SELECT rolname FROM pg_roles WHERE oid = ANY(polroles));
--
-- ── ROLLBACK (recreates the exact prior policy — reopens the leak; do NOT keep) ─
-- BEGIN;
-- CREATE POLICY feed_plans_public_select ON public.feed_plans
--   FOR SELECT TO anon
--   USING (status = ANY (ARRAY['draft','accepted','published']));
-- COMMIT;
