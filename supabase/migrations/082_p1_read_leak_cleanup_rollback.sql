-- 082_p1_read_leak_cleanup_rollback.sql — dedicated rollback for migration 082.
--
-- Restores the EXACT pre-082 state of the three objects 082 changed, captured
-- from production (2026-07-18, before 082 was applied):
--   • vendors.vendors_public_read       — SELECT TO anon USING (true)
--   • image_ai_scores.image_scores_public_read — SELECT TO {authenticated,anon} USING (true)
--   • public.gallery_get_meta(uuid)      — pre-082 body (no draft owner-gate)
-- and drops the scoped policy 082 introduced (image_scores_owner_read).
--
-- ⚠️ This RE-OPENS the three anon read-leaks 082 closed. Only run to revert 082.
-- Validated on staging: after forward 082 + this rollback, the policy roles /
-- USING expressions and the gallery_get_meta body match the pre-082 originals,
-- and a draft gallery's metadata is again returned to anon.

BEGIN;

-- 1. vendors — restore the anon read policy 082 dropped.
DROP POLICY IF EXISTS vendors_public_read ON public.vendors;
CREATE POLICY vendors_public_read ON public.vendors
  FOR SELECT TO anon USING (true);

-- 2. image_ai_scores — drop 082's scoped owner policy, restore the all-roles read.
DROP POLICY IF EXISTS image_scores_owner_read ON public.image_ai_scores;
DROP POLICY IF EXISTS image_scores_public_read ON public.image_ai_scores;
CREATE POLICY image_scores_public_read ON public.image_ai_scores
  FOR SELECT TO authenticated, anon USING (true);

-- 3. gallery_get_meta — restore the exact pre-082 body (published/live/draft all
--    returned to anyone with the UUID; no owner gate on draft).
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
