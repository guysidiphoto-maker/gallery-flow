-- ─────────────────────────────────────────────────────────────────────────────
-- 081_free_tier_gallery_cap.sql — launch guardrail: cap galleries on NEW free
-- accounts (abuse prevention for public self-serve signup).
--
-- PROBLEM: before public signup, a free account had NO enforced gallery limit
-- (the 100-token grant caps photos, but galleries were unlimited). Open signup
-- → unbounded gallery/storage creation per stranger.
--
-- DESIGN (smallest safe limit; NOT a billing system):
--   • New column businesses.gallery_limit INT.  NULL = unlimited.
--   • EXISTING businesses are GRANDFATHERED to NULL (unlimited) — verified on
--     prod 2026-06-29 there are 4 businesses, 2 with >3 galleries (max 99), all
--     the owner's. A hard cap WITHOUT grandfathering would instantly break the
--     owner. ADD COLUMN with no DEFAULT leaves existing rows NULL → safe.
--   • DEFAULT 3 applies only to FUTURE inserts (new signups) that don't set it.
--   • A BEFORE INSERT trigger on galleries enforces the cap regardless of insert
--     path (direct client insert AND duplicate_gallery RPC both go through it).
--     If gallery_limit IS NULL → never blocks. To lift the cap for a paying
--     customer later: UPDATE businesses SET gallery_limit = NULL (or higher).
--
-- SAFE & REVERSIBLE: additive column + one trigger; no data rewrite; existing
-- accounts unaffected (NULL). Rollback at bottom. Idempotent guards included.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) Column. Existing rows → NULL (unlimited / grandfathered).
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS gallery_limit INT;

-- 2) Future new businesses default to the free cap (existing rows untouched).
ALTER TABLE public.businesses ALTER COLUMN gallery_limit SET DEFAULT 3;

-- 3) Enforcement trigger — fires on every gallery INSERT, any path.
CREATE OR REPLACE FUNCTION public.enforce_gallery_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  SELECT gallery_limit INTO v_limit FROM public.businesses WHERE id = NEW.business_id;

  -- NULL limit = unlimited (grandfathered / paid). Never blocks.
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count FROM public.galleries WHERE business_id = NEW.business_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'gallery_limit_reached'
      USING ERRCODE = 'check_violation',
            HINT = format('Free plan allows up to %s galleries.', v_limit);
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_gallery_limit ON public.galleries;
CREATE TRIGGER trg_enforce_gallery_limit
  BEFORE INSERT ON public.galleries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_gallery_limit();

COMMIT;

-- ── Verification (after apply) ──────────────────────────────────────────────
--  Existing businesses must remain NULL (unlimited):
--    SELECT id, gallery_limit FROM businesses;   -- all existing → NULL
--  New business default:
--    INSERT ... a test business ... → gallery_limit = 3 (then clean up).
--  Cap fires only for limited businesses past the cap; never for NULL.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_enforce_gallery_limit ON public.galleries;
-- DROP FUNCTION IF EXISTS public.enforce_gallery_limit();
-- ALTER TABLE public.businesses DROP COLUMN IF EXISTS gallery_limit;
-- COMMIT;
