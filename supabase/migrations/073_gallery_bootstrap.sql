-- 073_gallery_bootstrap.sql — Phase 1 (gallery first-load speed + payload hygiene)
--
-- NON-DESTRUCTIVE. No DROP, no data change. Two CREATE OR REPLACE + one new
-- function + one optional index. Reviewed by the user before apply.
--
-- WHAT THIS DOES
-- 1. Hardens gallery_get_meta: strips the plaintext `password` key and nulls
--    local-filesystem `logoUrl` values (e.g. /Users/...) from delivery_settings
--    before returning. (clientCode is intentionally LEFT for now — one live
--    gallery's code-gate still depends on the plaintext fallback path in
--    verify_client_code; hardening it needs a hash backfill, deferred to a
--    later phase.)
-- 2. Adds gallery_bootstrap(): resolves business+gallery slug, returns
--    meta + first image page (curated columns) + sections in ONE round trip,
--    replacing the current 4-5 serial Sydney round trips on first load.
-- 3. (Optional, run SEPARATELY) a composite index for the hot image query.
--
-- The viewer falls back to the existing multi-call path if this RPC is absent,
-- so the web PR is safe to merge before/after this migration is applied.

BEGIN;

-- ── 1. gallery_get_meta: strip sensitive delivery_settings keys ──────────────
CREATE OR REPLACE FUNCTION gallery_get_meta(p_gallery_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Sanitize delivery_settings: drop plaintext password; null local-path logos.
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
$$;
GRANT EXECUTE ON FUNCTION gallery_get_meta(UUID) TO anon, authenticated;

-- ── 2. gallery_bootstrap: one round-trip first load ──────────────────────────
-- Composes the existing (gated) gallery_get_images + the sanitized
-- gallery_get_meta. Image projection is curated to the columns the viewer
-- actually renders — drops internal noise (face_index_error,
-- original_failed_reason, upload_status, *_size_bytes, upload_method) from the
-- first (largest) page. Gating is preserved: gallery_get_images returns no rows
-- without a valid token for a gated gallery, so bootstrap returns []
-- images + meta (so the gate UI can render), exactly like today.
CREATE OR REPLACE FUNCTION gallery_bootstrap(
  p_business_slug TEXT,
  p_gallery_slug  TEXT,
  p_token         UUID DEFAULT NULL,
  p_limit         INT  DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gid   UUID;
  v_meta  JSONB;
  v_imgs  JSONB;
  v_secs  JSONB;
BEGIN
  -- Resolve business + gallery by slug (matches the viewer's clean-URL form).
  SELECT g.id INTO v_gid
    FROM galleries g
    JOIN businesses b ON b.id = g.business_id
   WHERE lower(b.slug) = lower(p_business_slug)
     AND lower(g.slug) = lower(p_gallery_slug)
     AND g.status IN ('live', 'draft')
   ORDER BY (g.status = 'live') DESC
   LIMIT 1;

  IF v_gid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_meta := gallery_get_meta(v_gid);

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_imgs
    FROM (
      SELECT id, filename, web_preview_path, original_path, thumbnail_path,
             section_id, sort_order, width, height, is_top_pick,
             mime_type, original_uploaded, public_thumb_present
        FROM gallery_get_images(v_gid, p_token, p_limit, 0)
    ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order), '[]'::jsonb) INTO v_secs
    FROM (
      SELECT id, name, slug, sort_order, description
        FROM gallery_sections WHERE gallery_id = v_gid
       ORDER BY sort_order
    ) s;

  RETURN jsonb_build_object(
    'ok', true,
    'gallery_id', v_gid,
    'meta', v_meta,
    'images', v_imgs,
    'sections', v_secs
  );
END
$$;
GRANT EXECUTE ON FUNCTION gallery_bootstrap(TEXT, TEXT, UUID, INT) TO anon, authenticated;

COMMIT;

-- ── 3. OPTIONAL — run SEPARATELY, off-peak (CONCURRENTLY can't run in a txn) ──
-- Backs the hot viewer query (gallery_id + sort_order, scoped by section).
-- Safe/non-blocking with CONCURRENTLY; takes a moment on the ~50K-row table.
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS images_gallery_section_sort_idx
--     ON public.images (gallery_id, section_id, sort_order);
