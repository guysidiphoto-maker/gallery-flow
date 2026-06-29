-- ─────────────────────────────────────────────────────────────────────────────
-- 082_p1_read_leak_cleanup.sql — P1 anonymous read-leak cleanup
--
-- ⚠️ NOT YET APPLIED TO PRODUCTION. Reviewed + staging-proven (2026-07-18).
-- These are P1 (not P0 launch blockers): the two USING(true) tables are empty
-- today, and the gallery_get_meta leak is unpublished METADATA only (no images).
-- Apply before heavy public traffic. All three target objects confirmed present
-- in production. Validated on the staging project inside a BEGIN/ROLLBACK
-- transaction (7/7): both leak policies dropped; a scoped authenticated-only
-- read created; gallery_get_meta returns NULL for a DRAFT to anon while
-- PUBLISHED (anon) and DRAFT-to-owner (preview) still return metadata.
-- Kept entirely separate from the face-index billing migration — this is 082
-- and MUST be applied before 083.
--
-- Fixes three over-broad anon reads found in the audit:
--
--  1. vendors.vendors_public_read  — anon SELECT USING (true): leaks ALL
--     businesses' vendor rows (incl. PII) cross-tenant. A scoped owner policy
--     (vendors_owner, business_id = current_business_id()) already exists, so
--     this anon policy is pure leak → DROP it. (rows today: ~0.)
--
--  2. image_ai_scores.image_scores_public_read — a SINGLE policy granting BOTH
--     {anon, authenticated} SELECT USING (true): leaks every business's AI image
--     scores cross-tenant. There is NO other policy, so a bare DROP would also
--     cut off the dashboard (FeedStudio reads its own scores as `authenticated`).
--     → DROP, then CREATE a scoped `authenticated` policy (image → gallery →
--     business = current_business_id()). anon loses access (the public viewer
--     never reads scores).
--
--  3. gallery_get_meta(uuid) — returns metadata for status IN
--     ('live','published','DRAFT'); since it's SECURITY DEFINER + granted to
--     anon, any anon caller passing a draft gallery's UUID gets its name +
--     delivery settings (NOT its images — those stay gated). → gate draft behind
--     an owner check (auth.uid() = the gallery's business owner). Published/live
--     stay public; the owner can still preview their own draft.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. vendors: drop the anon read; owner policy remains ─────────────────────
DROP POLICY IF EXISTS vendors_public_read ON public.vendors;

-- ── 2. image_ai_scores: drop the all-roles read, add a scoped owner read ─────
DROP POLICY IF EXISTS image_scores_public_read ON public.image_ai_scores;

CREATE POLICY image_scores_owner_read ON public.image_ai_scores
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.images i
    JOIN public.galleries g ON g.id = i.gallery_id
    WHERE i.id = image_ai_scores.image_id
      AND g.business_id = current_business_id()
  ));

-- ── 3. gallery_get_meta: stop leaking DRAFT metadata to anon ─────────────────
CREATE OR REPLACE FUNCTION public.gallery_get_meta(p_gallery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result   JSONB;
  status_  TEXT;
  ds       JSONB;
  logo     TEXT;
  has_pw   BOOLEAN;
BEGIN
  SELECT status, (password_hash IS NOT NULL)
    INTO status_, has_pw
    FROM galleries WHERE id = p_gallery_id;

  IF status_ IS NULL OR status_ NOT IN ('live', 'published', 'draft') THEN
    RETURN NULL;
  END IF;

  -- NEW: draft (or any non-public) metadata is owner-only. Published/live stay
  -- public exactly as before. auth.uid() is NULL for anon → drafts return NULL.
  IF status_ NOT IN ('live', 'published') THEN
    IF NOT EXISTS (
      SELECT 1 FROM galleries g
      JOIN businesses b ON b.id = g.business_id
      WHERE g.id = p_gallery_id AND b.user_id = auth.uid()
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT (to_jsonb(g) - 'password_hash') INTO result
    FROM galleries g WHERE g.id = p_gallery_id;

  ds := COALESCE(result -> 'delivery_settings', '{}'::jsonb) - 'password';
  logo := ds ->> 'logoUrl';
  IF logo IS NOT NULL AND (
       logo LIKE '/Users/%' OR logo LIKE '/home/%'
       OR logo LIKE '/var/%' OR logo ~ '^[A-Za-z]:\\'
     ) THEN
    ds := ds - 'logoUrl';
  END IF;

  result := jsonb_set(result, '{delivery_settings}', ds)
            || jsonb_build_object('has_password', has_pw);
  RETURN result;
END
$function$;

COMMIT;

-- ── VERIFICATION (run after apply; or pre-prove in a rolled-back tx) ─────────
-- vendors / image_ai_scores leaks closed:
--   BEGIN; SET LOCAL ROLE anon;
--   SELECT count(*) FROM public.vendors;          -- expect 0 (denied)
--   SELECT count(*) FROM public.image_ai_scores;  -- expect 0 (denied)
--   ROLLBACK;
-- dashboard (owner) still reads its own scores — confirm FeedStudio loads scores.
-- gallery_get_meta:
--   • as anon, a PUBLISHED gallery UUID  → returns meta (unchanged).
--   • as anon, a DRAFT gallery UUID      → returns NULL (leak closed).
--   • as the owner (authenticated), a draft → returns meta (preview preserved).
--   ⚠️ MUST confirm the public viewer still loads published galleries and that
--     no draft-preview flow that relied on anon gallery_get_meta breaks.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
-- CREATE POLICY vendors_public_read ON public.vendors FOR SELECT TO anon USING (true);
-- DROP POLICY IF EXISTS image_scores_owner_read ON public.image_ai_scores;
-- CREATE POLICY image_scores_public_read ON public.image_ai_scores
--   FOR SELECT TO anon, authenticated USING (true);
-- -- and restore the prior gallery_get_meta body (without the owner draft gate),
-- --   available in migration 073_gallery_bootstrap.sql.
-- COMMIT;
