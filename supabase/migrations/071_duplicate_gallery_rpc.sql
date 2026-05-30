-- 071_duplicate_gallery_rpc.sql
--
-- Adds public.duplicate_gallery(p_source_gallery_id uuid, p_new_name text)
-- so the photographer can clone an existing gallery's SETTINGS + SECTIONS
-- into a fresh draft. The brief that justifies this: photographers shooting
-- 20 weddings a year were re-applying the same studio identity, watermark,
-- layout, downloads policy on every new gallery. Now they pick a template
-- gallery, give the duplicate a new name, and adjust + upload.
--
-- IMPORTANT: This does NOT copy images. Each event has its own shoot, and
-- copying tens-of-GB of objects across storage is both expensive and almost
-- never what the photographer wants. The new gallery starts at image_count = 0
-- and the photographer uploads fresh photos into the cloned section layout.
--
-- Ownership: SECURITY DEFINER + an explicit business_id check against
-- current_business_id(), matching the pattern used by update_gallery_settings
-- and the other owner-scoped RPCs added in 069/070.

CREATE OR REPLACE FUNCTION public.duplicate_gallery(
  p_source_gallery_id uuid,
  p_new_name          text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_biz_id     uuid;
  v_owner_biz  uuid;
  v_new_name   text;
  v_new_id     uuid;
BEGIN
  -- ── Validate caller + input ──────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_source_gallery_id IS NULL THEN
    RAISE EXCEPTION 'missing_source_gallery_id' USING ERRCODE = '22023';
  END IF;

  v_new_name := NULLIF(btrim(COALESCE(p_new_name, '')), '');
  IF v_new_name IS NULL THEN
    RAISE EXCEPTION 'missing_new_name' USING ERRCODE = '22023';
  END IF;

  v_biz_id := public.current_business_id();
  IF v_biz_id IS NULL THEN
    RAISE EXCEPTION 'no_business' USING ERRCODE = '42501';
  END IF;

  -- ── Owner check on the source gallery ────────────────────────────────────
  SELECT business_id INTO v_owner_biz
    FROM public.galleries
   WHERE id = p_source_gallery_id;

  IF v_owner_biz IS NULL THEN
    RAISE EXCEPTION 'source_gallery_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner_biz <> v_biz_id THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  -- ── Clone the gallery row ────────────────────────────────────────────────
  -- Copy: delivery_settings + typed columns + the configuration toggles.
  -- Skip: id, created_at, updated_at, published_at, published_revision_id,
  --       slug (let the BEFORE INSERT slug trigger generate a fresh one),
  --       image_count + all upload/face counters (this is a new event),
  --       password/code hashes (force the photographer to re-set the secret),
  --       custom_domain-derived fields (none on galleries today),
  --       demo_* fields (clone is not a demo).
  --
  -- delivery_settings is JSONB — we overwrite galleryTitle inside it so the
  -- cloned settings reflect the new name, otherwise the public viewer would
  -- still show the source gallery's title in any UI that reads from settings.
  INSERT INTO public.galleries (
    business_id,
    name,
    status,
    delivery_settings,
    event_date,
    event_type,
    event_location,
    access_type,
    face_index_enabled,
    image_count,
    download_count,
    favorite_count,
    signed_gate_enabled,
    publish_status,
    total_images,
    preview_uploaded_count,
    original_uploaded_count,
    original_failed_count,
    preview_ready,
    originals_ready
  )
  SELECT
    g.business_id,
    v_new_name,
    'draft'::gallery_status,
    CASE
      WHEN g.delivery_settings IS NULL THEN NULL
      ELSE g.delivery_settings || jsonb_build_object('galleryTitle', v_new_name)
    END,
    g.event_date,
    g.event_type,
    g.event_location,
    g.access_type,
    g.face_index_enabled,
    0,            -- image_count
    0,            -- download_count
    0,            -- favorite_count
    false,        -- signed_gate_enabled — fresh, no token issued yet
    'draft',      -- publish_status
    0,            -- total_images
    0,            -- preview_uploaded_count
    0,            -- original_uploaded_count
    0,            -- original_failed_count
    false,        -- preview_ready
    false         -- originals_ready
    FROM public.galleries g
   WHERE g.id = p_source_gallery_id
  RETURNING id INTO v_new_id;

  -- ── Reset the auto-created default section ───────────────────────────────
  -- The AFTER INSERT trigger `galleries_ensure_default_section` unconditionally
  -- inserts "סקשן 1" for every new gallery. We don't want it to coexist with
  -- the cloned sections, so we delete it before inserting the real clones.
  -- (We delete by gallery_id rather than by name so it can't accidentally
  -- wipe a real section if the trigger's default text ever changes.)
  DELETE FROM public.gallery_sections
   WHERE gallery_id = v_new_id;

  -- ── Clone the sections, preserving order + inline description ────────────
  -- We don't pass `id` (let the default fill it), we don't pass `slug` (let
  -- the gallery_sections_set_slug_trg generate one based on the new name),
  -- and we don't pass timestamps (defaults handle them).
  INSERT INTO public.gallery_sections (gallery_id, name, sort_order, description)
  SELECT v_new_id, s.name, s.sort_order, s.description
    FROM public.gallery_sections s
   WHERE s.gallery_id = p_source_gallery_id
   ORDER BY s.sort_order;

  RETURN v_new_id;
END;
$function$;

COMMENT ON FUNCTION public.duplicate_gallery(uuid, text) IS
  'Clones an existing gallery''s delivery_settings + typed columns + sections '
  'into a new draft owned by the same business. Does NOT copy images — each '
  'event has its own shoot, so the photographer uploads fresh photos into '
  'the cloned layout. Returns the new gallery id.';

-- Allow authenticated photographers to call the RPC. The function body
-- does its own owner check via current_business_id(), so this is safe.
REVOKE ALL ON FUNCTION public.duplicate_gallery(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.duplicate_gallery(uuid, text) TO authenticated;
