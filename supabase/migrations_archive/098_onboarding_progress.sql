-- 096_onboarding_progress.sql: Client Portal V2: per-user onboarding state.
--
-- ADDITIVE table that remembers where each authenticated user stands in a
-- guided surface (first-run owner tour, checklists, portal welcome…), keyed
-- by (user_id, surface, version). Bumping the client-side version constant
-- re-shows a surface after major changes without touching old rows.
--
-- Scope guarantees (contract C2):
--   • self-only RLS: a user can SELECT/INSERT/UPDATE only rows where
--     user_id = auth.uid(); authenticated role only; anon fully blocked.
--   • NO DELETE policy: progress rows are never deleted by clients
--     (restart = UPDATE status back to 'pending'); rows die with the user
--     via ON DELETE CASCADE.
--   • reuses the shared cpv2_set_updated_at() trigger fn (defined in 088;
--     re-declared here CREATE OR REPLACE-safe so 096 applies standalone).
--
-- NOT APPLIED to any environment by this program (QA project only, later).
-- Paired rollback: 096_onboarding_progress_rollback.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared updated_at trigger fn (identical body to migration 088; safe to
-- re-declare, safe if 088 already created it).
CREATE OR REPLACE FUNCTION public.cpv2_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ============================================================
-- onboarding_progress
-- ============================================================
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface     text NOT NULL
                CHECK (char_length(surface) BETWEEN 1 AND 60),
  version     int  NOT NULL DEFAULT 1
                CHECK (version >= 1),
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','completed','dismissed')),
  step        int  NOT NULL DEFAULT 0
                CHECK (step >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.onboarding_progress IS
  'Per-user progress of guided surfaces (owner_tour, owner_checklist, portal_welcome). Self-only RLS; one row per (user, surface, version).';

-- One row per user per surface per version (also the ON CONFLICT target for
-- the client-side upsert on (user_id, surface, version)).
CREATE UNIQUE INDEX IF NOT EXISTS ux_onboarding_progress_user_surface_version
  ON public.onboarding_progress (user_id, surface, version);

DROP TRIGGER IF EXISTS trg_onboarding_progress_updated_at ON public.onboarding_progress;
CREATE TRIGGER trg_onboarding_progress_updated_at
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.cpv2_set_updated_at();

-- ============================================================
-- RLS: self-only, authenticated-only, fail closed
-- ============================================================
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_progress_self_select ON public.onboarding_progress;
CREATE POLICY onboarding_progress_self_select ON public.onboarding_progress
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS onboarding_progress_self_insert ON public.onboarding_progress;
CREATE POLICY onboarding_progress_self_insert ON public.onboarding_progress
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS onboarding_progress_self_update ON public.onboarding_progress;
CREATE POLICY onboarding_progress_self_update ON public.onboarding_progress
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy → deletes are impossible for client roles (fail closed).
-- Anon has no policies at all.

-- Least privilege at the grant layer too (RLS is the real gate; this removes
-- even the theoretical anon surface and the client-side DELETE verb).
REVOKE ALL ON public.onboarding_progress FROM anon;
REVOKE ALL ON public.onboarding_progress FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.onboarding_progress TO authenticated;

COMMIT;

-- ============================================================
-- Verification (run manually AFTER a controlled apply; NOT in this program)
-- ============================================================
--   SELECT to_regclass('public.onboarding_progress');                        -- table exists
--   SELECT relrowsecurity FROM pg_class WHERE relname='onboarding_progress'; -- t
--   -- anon must be locked out entirely:
--   SET ROLE anon;  SELECT count(*) FROM public.onboarding_progress;  -- permission denied
--   RESET ROLE;
--   -- authenticated cannot DELETE (no grant, no policy):
--   SET ROLE authenticated; DELETE FROM public.onboarding_progress;   -- permission denied
--   RESET ROLE;
