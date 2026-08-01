-- Rollback for 106 — restores gallery_get_meta WITHOUT the brand subset
-- (the pre-106 canonical definition). The viewer then falls back to editorial
-- defaults for galleries with no per-gallery branding override.

BEGIN;

CREATE OR REPLACE FUNCTION public.gallery_get_meta(p_gallery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE result JSONB; status_ TEXT; ds JSONB; logo TEXT; has_pw BOOLEAN;
BEGIN
  SELECT status, (password_hash IS NOT NULL) INTO status_, has_pw FROM galleries WHERE id = p_gallery_id;
  IF status_ IS NULL OR status_ NOT IN ('live', 'published', 'draft') THEN RETURN NULL; END IF;
  SELECT (to_jsonb(g) - 'password_hash') INTO result FROM galleries g WHERE g.id = p_gallery_id;
  ds := COALESCE(result -> 'delivery_settings', '{}'::jsonb) - 'password';
  logo := ds ->> 'logoUrl';
  IF logo IS NOT NULL AND (logo LIKE '/Users/%' OR logo LIKE '/home/%' OR logo LIKE '/var/%' OR logo ~ '^[A-Za-z]:\\') THEN
    ds := ds - 'logoUrl';
  END IF;
  result := jsonb_set(result, '{delivery_settings}', ds) || jsonb_build_object('has_password', has_pw);
  RETURN result;
END
$function$;
GRANT EXECUTE ON FUNCTION public.gallery_get_meta(uuid) TO anon, authenticated;

COMMIT;
