-- ─────────────────────────────────────────────────────────────────────────────
-- 115_private_face_mode_enforcement.sql — Enforce "private face mode" server-side.
--
-- ⚠️ DRAFT — NOT APPLIED. For owner review; apply manually.
--
-- Defect: a gallery with delivery_settings.facePrivacyMode = 'private' promises
-- that a guest only sees the photos matched to their selfie (rekognition edge
-- function, service role, returns ONLY the matched rows). The viewer honours
-- this by never requesting the bulk list — but the server did not:
--   (a) gallery_get_images (078) checked only _gallery_authz (live / password
--       token / owner) + the retired paywall, so any anonymous caller could
--       page through every image of a private gallery;
--   (b) gallery_bootstrap (114) embeds the first page of gallery_get_images, so
--       the slug bootstrap leaked the first N rows as well;
--   (c) the anon RLS policy images_public_live_select (063) lets anyone run
--       `from('images').select('*').eq('gallery_id', …)` on any LIVE gallery,
--       bypassing every RPC gate;
--   (d) the anon storage.objects SELECT policies (063) let anyone LIST the
--       gallery's folder in gallery-images / gallery-images-thumbs-public,
--       which yields every object path (the buckets are public-URL buckets).
--
-- Contract enforced here (in the canonical DB path, not the frontend):
--   • Private-face gallery, anonymous or non-owner caller → gallery_get_images
--     returns 0 rows; gallery_bootstrap's `images` is [] (it reads through
--     gallery_get_images, so it inherits the guard with no body change); direct
--     anon SELECT on images returns 0 rows; anon storage LIST returns nothing.
--   • Authenticated gallery OWNER (auth.uid() = businesses.user_id) → unchanged,
--     full list (RPC guard admits the owner; direct reads go through
--     images_owner_all, which is TO authenticated and untouched).
--   • Face search (rekognition edge function) → unchanged: service role, returns
--     only the matched rows. This becomes the ONLY guest path to image rows.
--   • ZIP / watermark / signed_url APIs → unchanged: service role, operate only
--     on image ids / paths the caller already holds (the matched rows).
--   • Client members (authenticated, client portal) → unchanged (images_member_
--     select is TO authenticated; the portal reads only a cover thumbnail).
--   • Vendor portal → vendors previously read their tagged images through the
--     anon images policy (c). That path is closed for private galleries, so a
--     code-authenticated RPC get_vendor_images(p_code) is added; the frontend
--     prefers it and falls back to the legacy read if it is missing.
--   • Open (non-private) galleries → byte-identical behaviour everywhere.
--
-- "Private" mirrors the viewer exactly (useGalleryData.isPrivateFace):
--   galleries.delivery_settings ->> 'facePrivacyMode' = 'private'
-- on the LIVE row (not the published snapshot).
--
-- NOT covered (flagged in the PR): stories (curated highlight videos) stay
-- visible in private mode; gallery_get_hidden still returns hidden image ids.
--
-- Signatures preserved; SECURITY DEFINER + pinned search_path; explicit grants.
-- Reversible: 115_private_face_mode_enforcement_rollback.sql restores the
-- 078 gallery_get_images body and the 063 policies, and drops get_vendor_images.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. gallery_get_images: add the private-face-mode guard ──────────────────
-- 078 body + one guard. Signature, return type, ordering and page clamp are
-- unchanged so the current viewer and gallery_bootstrap keep working.
CREATE OR REPLACE FUNCTION public.gallery_get_images(
  p_gallery_id uuid,
  p_token uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS SETOF images
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_private BOOLEAN;
  v_owner   UUID;
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN RETURN; END IF;
  -- Retired paywall (106: always false); kept so the 078 contract is intact.
  IF gallery_is_locked(p_gallery_id) THEN RETURN; END IF;

  -- Private face mode: guests get rows ONLY from the face-search function
  -- (service role, matched rows). The bulk list is owner-only.
  SELECT (g.delivery_settings ->> 'facePrivacyMode') = 'private', b.user_id
    INTO v_private, v_owner
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  IF COALESCE(v_private, false)
     AND NOT (auth.uid() IS NOT NULL AND v_owner = auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT * FROM images
     WHERE gallery_id = p_gallery_id
     ORDER BY sort_order ASC
     LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 500), 2000))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.gallery_get_images(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.gallery_get_images(uuid, uuid, integer, integer) TO anon, authenticated, service_role;

-- gallery_bootstrap (114) is intentionally NOT redefined: its `images` field is
-- `SELECT … FROM gallery_get_images(v_gid, p_token, p_limit, 0)`, so the guard
-- above applies to the embedded first page automatically (auth.uid() reads the
-- request JWT, so the owner exemption also holds inside the nested call).

-- ── 2. images: anon direct read excludes private-face galleries ─────────────
-- Same shape as 063, plus the private exclusion. Anon is never the owner, so no
-- owner clause is needed here (the owner reads via images_owner_all).
DROP POLICY IF EXISTS images_public_live_select ON public.images;
CREATE POLICY images_public_live_select ON public.images
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.galleries g
      WHERE g.id = images.gallery_id
        AND g.status = 'live'::gallery_status
        AND (g.delivery_settings ->> 'facePrivacyMode') IS DISTINCT FROM 'private'
    )
  );

-- ── 3. storage.objects: no anon LIST of a private gallery's image folders ───
-- Public-URL GETs (/object/public, /render/image/public) do not consult these
-- policies, so matched photos returned by face search still render. What this
-- closes is enumerating every object path via the storage list/search API.
-- gallery-stories keeps the 063 rule (stories are out of scope, see header).
DROP POLICY IF EXISTS gallery_storage_public_read ON storage.objects;
CREATE POLICY gallery_storage_public_read ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])
    AND EXISTS (
      SELECT 1 FROM public.galleries g
      WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
        AND g.status = 'live'::gallery_status
        AND (
          storage.objects.bucket_id = 'gallery-stories'
          OR (g.delivery_settings ->> 'facePrivacyMode') IS DISTINCT FROM 'private'
        )
    )
  );

DROP POLICY IF EXISTS thumbs_public_anon_read ON storage.objects;
CREATE POLICY thumbs_public_anon_read ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'gallery-images-thumbs-public'::text
    AND EXISTS (
      SELECT 1 FROM public.galleries g
      WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
        AND g.status = 'live'::gallery_status
        AND (g.delivery_settings ->> 'facePrivacyMode') IS DISTINCT FROM 'private'
    )
  );

-- ── 4. get_vendor_images: code-authenticated vendor read ────────────────────
-- Replaces the vendor portal's anon `images` read (closed above for private
-- galleries). Returns ONLY images tagged to the vendor whose access code
-- matches, in LIVE galleries of that vendor's own business.
CREATE OR REPLACE FUNCTION public.get_vendor_images(p_code TEXT)
RETURNS TABLE (
  id             UUID,
  gallery_id     UUID,
  filename       TEXT,
  storage_path   TEXT,
  thumbnail_path TEXT,
  sort_order     INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.gallery_id, i.filename, i.web_preview_path, i.thumbnail_path, i.sort_order
    FROM vendors v
    JOIN image_vendor_tags t ON t.vendor_id = v.id
    JOIN images i            ON i.id = t.image_id
    JOIN galleries g         ON g.id = i.gallery_id
   WHERE p_code IS NOT NULL
     AND length(btrim(p_code)) > 0
     AND UPPER(v.access_code) = UPPER(btrim(p_code))
     AND g.business_id = v.business_id
     AND g.status = 'live'::gallery_status
   ORDER BY i.sort_order ASC, i.id ASC
   LIMIT 5000;
$$;
REVOKE EXECUTE ON FUNCTION public.get_vendor_images(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vendor_images(text) TO anon, authenticated, service_role;

COMMIT;

-- Post-conditions (run manually on staging; <priv> = a live private-face
-- gallery, <open> = a live open gallery):
--   SET ROLE anon;
--   SELECT count(*) FROM gallery_get_images('<priv>');                 -- 0
--   SELECT gallery_bootstrap('<biz>','<priv-slug>') -> 'images';        -- []
--   SELECT count(*) FROM images WHERE gallery_id = '<priv>';           -- 0
--   SELECT count(*) FROM gallery_get_images('<open>');                 -- unchanged
--   SELECT count(*) FROM images WHERE gallery_id = '<open>';           -- unchanged
--   RESET ROLE;
--   -- as the owner's JWT (authenticated): gallery_get_images('<priv>') → full list
