-- ─────────────────────────────────────────────────────────────────────────────
-- 107_gallery_meta_null_safe.sql — Harden gallery_get_meta against a JSON-null
-- delivery_settings (fixes "short gallery route returns not found").
--
-- Root cause: gallery_get_meta computed
--     ds := COALESCE(result -> 'delivery_settings', '{}') - 'password';
-- When a gallery's delivery_settings column is SQL NULL, to_jsonb(row) yields a
-- JSON `null` VALUE (not SQL NULL), so COALESCE does not substitute '{}', and
-- `jsonb 'null' - 'password'` raises `cannot delete from scalar`. That made
-- gallery_get_meta (and therefore gallery_bootstrap) throw for any gallery with
-- a null delivery_settings, which the public viewer surfaced as "not found".
-- Production never hit this (its galleries always carry an object), but it is a
-- real latent fragility.
--
-- Fix: treat a missing / null / non-object delivery_settings as '{}' before the
-- key-removal. Everything else (password/logo sanitize, has_password, the 106
-- brand subset) is unchanged. Additive CREATE OR REPLACE; does not modify the
-- applied 104/105/106. Reversible.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.gallery_get_meta(p_gallery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB; status_ TEXT; ds JSONB; logo TEXT; has_pw BOOLEAN;
  v_bk JSONB; v_brand JSONB := NULL;
BEGIN
  SELECT status, (password_hash IS NOT NULL) INTO status_, has_pw FROM galleries WHERE id = p_gallery_id;
  IF status_ IS NULL OR status_ NOT IN ('live', 'published', 'draft') THEN RETURN NULL; END IF;
  SELECT (to_jsonb(g) - 'password_hash') INTO result FROM galleries g WHERE g.id = p_gallery_id;

  -- Null-safe: a SQL-NULL delivery_settings becomes JSON `null` in to_jsonb;
  -- coerce anything that isn't an object to '{}' before removing keys.
  ds := result -> 'delivery_settings';
  IF ds IS NULL OR jsonb_typeof(ds) <> 'object' THEN
    ds := '{}'::jsonb;
  END IF;
  ds := ds - 'password';

  logo := ds ->> 'logoUrl';
  IF logo IS NOT NULL AND (logo LIKE '/Users/%' OR logo LIKE '/home/%' OR logo LIKE '/var/%' OR logo ~ '^[A-Za-z]:\\') THEN
    ds := ds - 'logoUrl';
  END IF;

  SELECT b.brand_kit INTO v_bk
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  IF v_bk IS NOT NULL AND COALESCE((v_bk ->> 'apply_to_galleries')::boolean, false) THEN
    v_brand := jsonb_strip_nulls(jsonb_build_object(
      'accentHex',   v_bk -> 'colors'     ->> 'accent',
      'headingFont', v_bk -> 'typography' ->> 'heading_family',
      'bodyFont',    v_bk -> 'typography' ->> 'body_family',
      'logoUrl',     v_bk -> 'logo'       ->> 'url'
    ));
  END IF;

  result := jsonb_set(result, '{delivery_settings}', ds)
            || jsonb_build_object('has_password', has_pw, 'brand', v_brand);
  RETURN result;
END
$function$;
GRANT EXECUTE ON FUNCTION public.gallery_get_meta(uuid) TO anon, authenticated;

COMMIT;
