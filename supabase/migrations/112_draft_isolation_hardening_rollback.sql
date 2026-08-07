-- Rollback for 112_draft_isolation_hardening.sql — restores the pre-112 bodies
-- of _gallery_authz (041), gallery_get_meta (109) and gallery_bootstrap (078).
-- NOTE: reverting re-introduces the draft-metadata exposure this migration fixed.
BEGIN;

-- restore _gallery_authz (041, live-only, no owner bypass)
CREATE OR REPLACE FUNCTION _gallery_authz(p_gallery_id UUID, p_token UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE has_pw BOOLEAN; gated BOOLEAN; status_ TEXT; ok BOOLEAN;
BEGIN
  SELECT password_hash IS NOT NULL, signed_gate_enabled, status
    INTO has_pw, gated, status_ FROM galleries WHERE id = p_gallery_id;
  IF status_ IS NULL OR status_ <> 'live' THEN RETURN false; END IF;
  IF has_pw AND gated THEN
    IF p_token IS NULL THEN RETURN false; END IF;
    SELECT EXISTS (SELECT 1 FROM gallery_unlock_tokens
       WHERE token = p_token AND gallery_id = p_gallery_id AND expires_at > now()) INTO ok;
    RETURN ok;
  END IF;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION _gallery_authz(uuid, uuid) TO anon, authenticated;

-- restore gallery_get_meta (109 body)
CREATE OR REPLACE FUNCTION public.gallery_get_meta(p_gallery_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE result JSONB; status_ TEXT; ds JSONB; logo TEXT; has_pw BOOLEAN; v_bk JSONB; v_brand JSONB := NULL;
BEGIN
  SELECT status, (password_hash IS NOT NULL) INTO status_, has_pw FROM galleries WHERE id = p_gallery_id;
  IF status_ IS NULL OR status_ NOT IN ('live', 'published', 'draft') THEN RETURN NULL; END IF;
  SELECT (to_jsonb(g) - 'password_hash') INTO result FROM galleries g WHERE g.id = p_gallery_id;
  ds := result -> 'delivery_settings';
  IF ds IS NULL OR jsonb_typeof(ds) <> 'object' THEN ds := '{}'::jsonb; END IF;
  ds := ds - 'password';
  logo := ds ->> 'logoUrl';
  IF logo IS NOT NULL AND (logo LIKE '/Users/%' OR logo LIKE '/home/%' OR logo LIKE '/var/%' OR logo ~ '^[A-Za-z]:\\') THEN ds := ds - 'logoUrl'; END IF;
  SELECT b.brand_kit INTO v_bk FROM galleries g JOIN businesses b ON b.id = g.business_id WHERE g.id = p_gallery_id;
  IF v_bk IS NOT NULL AND COALESCE((v_bk ->> 'apply_to_galleries')::boolean, false) THEN
    v_brand := jsonb_strip_nulls(jsonb_build_object(
      'accentHex', v_bk -> 'colors' ->> 'accent', 'headingFont', v_bk -> 'typography' ->> 'heading_family',
      'bodyFont', v_bk -> 'typography' ->> 'body_family', 'logoUrl', v_bk -> 'logo' ->> 'url',
      'appearance', v_bk ->> 'appearance'));
  END IF;
  result := jsonb_set(result, '{delivery_settings}', ds) || jsonb_build_object('has_password', has_pw, 'brand', v_brand);
  RETURN result;
END $function$;
GRANT EXECUTE ON FUNCTION public.gallery_get_meta(uuid) TO anon, authenticated;

-- restore gallery_bootstrap (078 body)
CREATE OR REPLACE FUNCTION gallery_bootstrap(p_business_slug TEXT, p_gallery_slug TEXT, p_token UUID DEFAULT NULL, p_limit INT DEFAULT 300)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_gid UUID; v_meta JSONB; v_imgs JSONB; v_secs JSONB;
BEGIN
  SELECT g.id INTO v_gid FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE lower(b.slug) = lower(p_business_slug) AND lower(g.slug) = lower(p_gallery_slug)
     AND g.status IN ('live', 'draft') ORDER BY (g.status = 'live') DESC LIMIT 1;
  IF v_gid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  v_meta := gallery_get_meta(v_gid);
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_imgs FROM (
    SELECT id, filename, web_preview_path, original_path, thumbnail_path, section_id, sort_order, width, height, is_top_pick, mime_type, original_uploaded, public_thumb_present
      FROM gallery_get_images(v_gid, p_token, p_limit, 0)) t;
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order), '[]'::jsonb) INTO v_secs FROM (
    SELECT id, name, slug, sort_order, description FROM gallery_sections WHERE gallery_id = v_gid ORDER BY sort_order) s;
  RETURN jsonb_build_object('ok', true, 'gallery_id', v_gid, 'meta', v_meta, 'images', v_imgs, 'sections', v_secs, 'locked', gallery_is_locked(v_gid));
END $$;
GRANT EXECUTE ON FUNCTION gallery_bootstrap(TEXT, TEXT, UUID, INT) TO anon, authenticated;

COMMIT;
