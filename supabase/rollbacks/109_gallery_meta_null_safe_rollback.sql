-- Rollback for 109_gallery_meta_null_safe.sql — restores the pre-109 (108)
-- gallery_get_meta: the brand-subset body with the original COALESCE-based
-- delivery_settings handling (not the null-safe coercion). Reproduced executably
-- so the down-path actually restores the function (previously a comment-only
-- no-op). Only fully safe where every gallery has an object delivery_settings.

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
  ds := COALESCE(result -> 'delivery_settings', '{}'::jsonb) - 'password';
  logo := ds ->> 'logoUrl';
  IF logo IS NOT NULL AND (logo LIKE '/Users/%' OR logo LIKE '/home/%' OR logo LIKE '/var/%' OR logo ~ '^[A-Za-z]:\\') THEN
    ds := ds - 'logoUrl';
  END IF;

  -- Brand Kit defaults (opt-in via apply_to_galleries). Safe subset only.
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
