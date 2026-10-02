-- ─────────────────────────────────────────────────────────────────────────────
-- 106_gallery_meta_brand_defaults.sql — Live Brand Kit inheritance for the
-- public viewer.
--
-- Surfaces a SMALL, safe subset of the owning business's Brand Kit on the
-- public gallery meta so the viewer can inherit it as the DEFAULT when a gallery
-- has no per-gallery override:
--   brand = { accentHex, headingFont, bodyFont, logoUrl }
--
-- Only these four fields are exposed — never the full brand_kit (which holds
-- voice, social handles, watermark config). Gated on apply_to_galleries so the
-- owner's opt-in is respected; when off, brand is null and galleries keep the
-- editorial default. Gallery-level overrides (delivery_settings.themeColor /
-- headingFont / bodyFont) always win — resolved client-side in
-- src/lib/galleryBranding.ts (resolveGalleryBranding).
--
-- Everything else about gallery_get_meta is unchanged (password/logo sanitize,
-- has_password). Idempotent CREATE OR REPLACE. Reversible via rollback.
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
