-- Rollback for 115_private_face_mode_enforcement.sql — restores the 078 body of
-- gallery_get_images, the 063 anon policies on images / storage.objects, and
-- drops get_vendor_images.
-- NOTE: reverting RE-OPENS the private-face-mode exposure (anonymous callers can
-- list every image of a private gallery). Roll back the frontend vendor-portal
-- change too only if you want the legacy path exclusively — it falls back on
-- its own when get_vendor_images is missing.
BEGIN;

-- restore gallery_get_images (078 body, 078 grants)
CREATE OR REPLACE FUNCTION public.gallery_get_images(
  p_gallery_id uuid,
  p_token uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS SETOF images
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN RETURN; END IF;
  IF gallery_is_locked(p_gallery_id) THEN RETURN; END IF;
  RETURN QUERY
    SELECT * FROM images
     WHERE gallery_id = p_gallery_id
     ORDER BY sort_order ASC
     LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 500), 2000))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$function$;
GRANT EXECUTE ON FUNCTION public.gallery_get_images(uuid, uuid, integer, integer) TO PUBLIC, anon, authenticated;

-- restore images_public_live_select as it was in production before 115
-- (063 plus the password-gallery exclusion)
DROP POLICY IF EXISTS images_public_live_select ON public.images;
CREATE POLICY images_public_live_select ON public.images
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.galleries g
      WHERE g.id = images.gallery_id
        AND g.status = 'live'::gallery_status
        AND g.password_hash IS NULL
    )
  );

-- restore gallery_storage_public_read (063)
DROP POLICY IF EXISTS gallery_storage_public_read ON storage.objects;
CREATE POLICY gallery_storage_public_read ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])
    AND EXISTS (
      SELECT 1 FROM public.galleries g
      WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
        AND g.status = 'live'::gallery_status
    )
  );

-- restore thumbs_public_anon_read (063)
DROP POLICY IF EXISTS thumbs_public_anon_read ON storage.objects;
CREATE POLICY thumbs_public_anon_read ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'gallery-images-thumbs-public'::text
    AND EXISTS (
      SELECT 1 FROM public.galleries g
      WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
        AND g.status = 'live'::gallery_status
    )
  );

-- drop the vendor RPC added by 115
DROP FUNCTION IF EXISTS public.get_vendor_images(text);

COMMIT;
