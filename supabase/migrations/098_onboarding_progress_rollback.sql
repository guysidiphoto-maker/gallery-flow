-- 096_onboarding_progress_rollback.sql: reverse 096_onboarding_progress.sql.
-- Additive-only migration → safe drop. Progress state is non-critical UX data
-- (the client falls back to its localStorage copy automatically).

BEGIN;

DROP TRIGGER IF EXISTS trg_onboarding_progress_updated_at ON public.onboarding_progress;

DROP TABLE IF EXISTS public.onboarding_progress;

-- cpv2_set_updated_at() is shared with 088+ CPV2 tables; intentionally left
-- in place so rollbacks stay independent and idempotent (same rule as 088's
-- rollback). The pgcrypto extension is likewise left untouched.

COMMIT;
