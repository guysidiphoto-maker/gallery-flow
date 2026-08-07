-- ─────────────────────────────────────────────────────────────────────────────
-- 110_replace_image_rpc.sql — Owner-scoped "Replace photo" server operation.
--
-- Lets a photographer swap the pixels behind an existing images row WITHOUT
-- changing the photo's logical identity. The row id, gallery_id, section_id,
-- sort_order and is_top_pick are all preserved — so favourites, references,
-- top-pick state and the photo's position in the grid survive the swap. Only
-- the storage paths + intrinsic file metadata (filename, size, mime, dims)
-- change.
--
-- CONTRACT (mirrors record_image_upload's authz, but consumes NO token — a
-- replacement is not a new photo):
--   • Caller must be the gallery's owning business user (auth.uid()).
--   • The image must belong to p_gallery_id — blocks cross-gallery and
--     cross-business replacement.
--   • The new storage objects are uploaded by the client FIRST (content-
--     addressed keys, so they never collide with the old object). This RPC is
--     called only AFTER the upload succeeds, and it flips the row atomically.
--   • Face-index records for the OLD pixels are invalidated: every image_faces
--     row for this image is deleted and images.face_indexed_at / face_count are
--     reset to NULL so the photo re-indexes on the next face-index run. (The
--     AWS Rekognition face vectors for the old pixels are NOT purged from the
--     collection here — that is a background reconciliation concern; what
--     matters for correctness is that recognition data is no longer ATTRIBUTED
--     to the replaced image. Documented in docs/GALLERY-WORKFLOW-COMPLETION.md.)
--   • Returns the OLD paths so the client can delete the now-orphaned storage
--     objects AFTER this DB flip succeeds. A failed flip leaves the original
--     image completely usable (the client simply drops its freshly-uploaded
--     object on the next reconciliation; the row is untouched).
--
-- Cover handling: this RPC does NOT touch delivery_settings. When the replaced
-- image is the gallery cover (delivery_settings.coverImageId = image id) the
-- client re-points the cover via update_gallery_settings, which owns the
-- transform-URL construction. was_cover is returned as a hint.
--
-- Additive; does not modify applied 104–109. Reversible.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.replace_image(
  p_gallery_id     UUID,
  p_image_id       UUID,
  p_web_preview_path TEXT,
  p_thumbnail_path   TEXT,
  p_original_path    TEXT,
  p_filename       TEXT,
  p_original_size  BIGINT DEFAULT NULL,
  p_mime_type      TEXT   DEFAULT NULL,
  p_width          INTEGER DEFAULT NULL,
  p_height         INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_owner_user  UUID;
  v_old_web     TEXT;
  v_old_thumb   TEXT;
  v_old_orig    TEXT;
  v_cover_id    TEXT;
  v_was_cover   BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Authz: caller must own the gallery's business.
  SELECT g.business_id, b.user_id, (g.delivery_settings->>'coverImageId')
    INTO v_business_id, v_owner_user, v_cover_id
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'gallery_not_found';
  END IF;
  IF v_owner_user IS NULL OR v_owner_user <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- The image must belong to this gallery. This is the cross-gallery /
  -- cross-business guard: an image id from another gallery yields no row and
  -- the UPDATE below affects zero rows.
  SELECT web_preview_path, thumbnail_path, original_path
    INTO v_old_web, v_old_thumb, v_old_orig
    FROM images
   WHERE id = p_image_id AND gallery_id = p_gallery_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'image_not_found';
  END IF;

  v_was_cover := (v_cover_id IS NOT NULL AND v_cover_id = p_image_id::text);

  -- Flip the pixels. Identity columns (id, gallery_id, section_id, sort_order,
  -- is_top_pick) are deliberately untouched.
  UPDATE images SET
    web_preview_path     = p_web_preview_path,
    thumbnail_path       = p_thumbnail_path,
    original_path        = p_original_path,
    filename             = p_filename,
    original_size_bytes  = COALESCE(p_original_size, original_size_bytes),
    mime_type            = COALESCE(p_mime_type, mime_type),
    width                = p_width,
    height               = p_height,
    original_uploaded    = (p_original_path IS NOT NULL),
    web_preview_uploaded = true,
    preview_ready        = true,
    upload_status        = 'original_ready',
    public_thumb_present = false,
    -- Invalidate recognition for the OLD pixels.
    face_indexed_at      = NULL,
    face_count           = NULL,
    updated_at           = now()
  WHERE id = p_image_id AND gallery_id = p_gallery_id;

  -- Drop the old per-face rows so recognition is no longer attributed to the
  -- replaced pixels. New faces are inserted by the face-index job on re-run.
  DELETE FROM image_faces WHERE image_id = p_image_id;

  RETURN jsonb_build_object(
    'ok', true,
    'old_web_path',      v_old_web,
    'old_thumb_path',    v_old_thumb,
    'old_original_path', v_old_orig,
    'was_cover',         v_was_cover
  );
END;
$$;

-- Owner-only: least privilege, matching 108's editor-RPC grant posture.
REVOKE EXECUTE ON FUNCTION public.replace_image(uuid, uuid, text, text, text, text, bigint, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_image(uuid, uuid, text, text, text, text, bigint, text, integer, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.replace_image(uuid, uuid, text, text, text, text, bigint, text, integer, integer) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.replace_image(uuid, uuid, text, text, text, text, bigint, text, integer, integer) TO service_role;

COMMIT;

-- Post-conditions (run manually):
-- SELECT has_function_privilege('anon','public.replace_image(uuid,uuid,text,text,text,text,bigint,text,integer,integer)','EXECUTE');          -- expect false
-- SELECT has_function_privilege('authenticated','public.replace_image(uuid,uuid,text,text,text,text,bigint,text,integer,integer)','EXECUTE'); -- expect true
