-- ─────────────────────────────────────────────────────────────────────────────
-- _phase6_drafts/005_update_gallery_settings_rpc.sql
--
-- PROPOSAL — NOT WIRED INTO THE MIGRATION SEQUENCE.
-- See docs/PHASE6_ARCHITECTURE_PLAN_2026-05-30.md, concern (c).
--
-- update_gallery_settings(p_gallery_id, p_patch) is the SINGLE write boundary
-- for gallery configuration. The SPA stops doing direct
-- supabase.from('galleries').update(...) calls and routes everything through
-- this RPC. The RPC mirrors the DeliverySettingsPatchSchema (Zod) defined in
-- gallery-web/src/lib/deliverySettingsSchema.ts.
--
-- During the transition window the RPC dual-writes to delivery_settings
-- (legacy JSONB) AND to the promoted columns + presentation_settings so a
-- partial rollback or a stale browser tab cannot corrupt data.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Audit table for every settings change ──────────────────────────────
CREATE TABLE IF NOT EXISTS gallery_settings_audit (
  id          BIGSERIAL PRIMARY KEY,
  gallery_id  UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  changed_by  UUID REFERENCES auth.users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  patch       JSONB NOT NULL,
  before      JSONB NOT NULL,
  after       JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS gallery_settings_audit_gallery_idx
  ON gallery_settings_audit (gallery_id, changed_at DESC);

ALTER TABLE gallery_settings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY gallery_settings_audit_owner_select ON gallery_settings_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = gallery_settings_audit.gallery_id
        AND g.business_id = current_business_id()
    )
  );

-- ── 2. The single write boundary ──────────────────────────────────────────
-- p_patch is a JSONB object whose keys must be in the allowlist below.
-- Unknown keys → exception. Wrong type for a known key → exception.
-- Promoted keys go to typed columns; the rest merge into presentation_settings.
CREATE OR REPLACE FUNCTION update_gallery_settings(
  p_gallery_id UUID,
  p_patch      JSONB
) RETURNS galleries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Key allowlist. Adding a new setting = adding a key here + adding a
  -- matching field to DeliverySettingsSchema in gallery-web. Two-sided change
  -- prevents drift.
  c_allowed_keys CONSTANT TEXT[] := ARRAY[
    -- Promoted
    'accessType', 'password', 'clientCode',
    'eventDate', 'eventLocation', 'eventType',
    'downloadsEnabled', 'bulkDownloadEnabled', 'downloadQuality',
    'coverImageId', 'coverImageUrl', 'coverCrop',
    'faceIndexEnabled', 'facePrivacyMode',
    -- Presentation (stays in JSONB)
    'galleryTitle', 'clientName', 'galleryDescription', 'welcomeMessage',
    'studioName', 'studioWebsite', 'logoUrl', 'showFooterCredit',
    'layoutMode', 'imageSpacing', 'cornerStyle',
    'themeColor', 'feedLayout', 'welcomeStyle', 'navStyle',
    'watermarkEnabled', 'watermarkText', 'watermarkPosition',
    'generateStories', 'showStories',
    'clientHidePhotosEnabled', 'requireGalleryCode', 'galleryCode',
    'trackDownloads', 'clientSelectionEnabled'
  ];
  c_promoted_keys CONSTANT TEXT[] := ARRAY[
    'accessType', 'eventDate', 'eventLocation', 'eventType',
    'downloadsEnabled', 'downloadQuality', 'coverImageId',
    'faceIndexEnabled', 'facePrivacyMode', 'clientCode', 'password'
  ];

  v_business_id     UUID;
  v_before          JSONB;
  v_patch_keys      TEXT[];
  v_unknown_keys    TEXT[];
  v_presentation    JSONB;
  v_legacy_settings JSONB;
  v_gallery         galleries;
  v_val             TEXT;
BEGIN
  -- Ownership check.
  SELECT business_id INTO v_business_id FROM galleries WHERE id = p_gallery_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'gallery_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_business_id <> current_business_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'patch_must_be_object' USING ERRCODE = '22023';
  END IF;

  -- Reject unknown keys (mirrors Zod .strict()).
  SELECT array_agg(k) INTO v_patch_keys FROM jsonb_object_keys(p_patch) k;
  SELECT array_agg(k) INTO v_unknown_keys
  FROM unnest(v_patch_keys) k
  WHERE NOT (k = ANY (c_allowed_keys));

  IF v_unknown_keys IS NOT NULL AND array_length(v_unknown_keys, 1) > 0 THEN
    RAISE EXCEPTION 'unknown_settings_keys: %', v_unknown_keys
      USING ERRCODE = '22023';
  END IF;

  -- Per-key type / domain checks. Equivalent to the Zod schema.
  IF p_patch ? 'accessType' THEN
    v_val := p_patch->>'accessType';
    IF v_val NOT IN ('public', 'password') THEN
      RAISE EXCEPTION 'accessType must be public|password (got %)', v_val
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_patch ? 'downloadQuality' THEN
    v_val := p_patch->>'downloadQuality';
    IF v_val NOT IN ('web', 'high', 'original') THEN
      RAISE EXCEPTION 'downloadQuality must be web|high|original (got %)', v_val
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_patch ? 'eventDate' AND NULLIF(p_patch->>'eventDate', '') IS NOT NULL THEN
    BEGIN
      PERFORM (p_patch->>'eventDate')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'eventDate must be ISO date (got %)', p_patch->>'eventDate'
        USING ERRCODE = '22023';
    END;
  END IF;

  IF p_patch ? 'themeColor' THEN
    IF (p_patch->>'themeColor') !~ '^#[0-9a-fA-F]{6}$' THEN
      RAISE EXCEPTION 'themeColor must match #rrggbb (got %)', p_patch->>'themeColor'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_patch ? 'layoutMode'
     AND p_patch->>'layoutMode' NOT IN ('1-col','2-col','3-col') THEN
    RAISE EXCEPTION 'layoutMode invalid' USING ERRCODE = '22023';
  END IF;

  IF p_patch ? 'imageSpacing'
     AND p_patch->>'imageSpacing' NOT IN ('none','small','medium') THEN
    RAISE EXCEPTION 'imageSpacing invalid' USING ERRCODE = '22023';
  END IF;

  IF p_patch ? 'cornerStyle'
     AND p_patch->>'cornerStyle' NOT IN ('sharp','rounded') THEN
    RAISE EXCEPTION 'cornerStyle invalid' USING ERRCODE = '22023';
  END IF;

  IF p_patch ? 'feedLayout'
     AND p_patch->>'feedLayout' NOT IN ('grid','masonry','carousel') THEN
    RAISE EXCEPTION 'feedLayout invalid' USING ERRCODE = '22023';
  END IF;

  IF p_patch ? 'facePrivacyMode'
     AND p_patch->>'facePrivacyMode' NOT IN ('open','private') THEN
    RAISE EXCEPTION 'facePrivacyMode invalid' USING ERRCODE = '22023';
  END IF;

  -- Snapshot before-state for audit.
  SELECT jsonb_build_object(
    'access_type', access_type,
    'event_date', event_date,
    'event_location', event_location,
    'event_type', event_type,
    'downloads_enabled', downloads_enabled,
    'download_quality', download_quality,
    'cover_image_id', cover_image_id,
    'face_index_enabled', face_index_enabled,
    'face_privacy_mode', face_privacy_mode,
    'presentation', presentation_settings,
    'delivery_settings', delivery_settings
  )
  INTO v_before
  FROM galleries WHERE id = p_gallery_id;

  -- Apply promoted-column writes only for keys present in the patch.
  UPDATE galleries g SET
    access_type = CASE WHEN p_patch ? 'accessType'
                       THEN p_patch->>'accessType' ELSE g.access_type END,
    event_date = CASE WHEN p_patch ? 'eventDate'
                      THEN NULLIF(p_patch->>'eventDate','')::date ELSE g.event_date END,
    event_location = CASE WHEN p_patch ? 'eventLocation'
                          THEN p_patch->>'eventLocation' ELSE g.event_location END,
    event_type = CASE WHEN p_patch ? 'eventType'
                      THEN p_patch->>'eventType' ELSE g.event_type END,
    downloads_enabled = CASE WHEN p_patch ? 'downloadsEnabled'
                             THEN (p_patch->>'downloadsEnabled')::boolean ELSE g.downloads_enabled END,
    download_quality = CASE WHEN p_patch ? 'downloadQuality'
                            THEN p_patch->>'downloadQuality' ELSE g.download_quality END,
    cover_image_id = CASE WHEN p_patch ? 'coverImageId'
                          THEN NULLIF(p_patch->>'coverImageId','')::uuid ELSE g.cover_image_id END,
    face_index_enabled = CASE WHEN p_patch ? 'faceIndexEnabled'
                              THEN (p_patch->>'faceIndexEnabled')::boolean ELSE g.face_index_enabled END,
    face_privacy_mode = CASE WHEN p_patch ? 'facePrivacyMode'
                             THEN p_patch->>'facePrivacyMode' ELSE g.face_privacy_mode END,
    client_code_hash = CASE
      WHEN p_patch ? 'clientCode' AND NULLIF(p_patch->>'clientCode','') IS NOT NULL
        THEN crypt(p_patch->>'clientCode', gen_salt('bf', 10))
      WHEN p_patch ? 'clientCode' THEN NULL
      ELSE g.client_code_hash
    END,
    -- Non-promoted keys merge into presentation_settings.
    presentation_settings = g.presentation_settings || (
      SELECT COALESCE(jsonb_object_agg(k.key, k.value), '{}'::jsonb)
      FROM jsonb_each(p_patch) k
      WHERE NOT (k.key = ANY (c_promoted_keys))
    ),
    -- Dual-write the legacy blob for the transition window. Drop in cleanup.
    delivery_settings = g.delivery_settings || p_patch
  WHERE g.id = p_gallery_id
  RETURNING * INTO v_gallery;

  -- Audit row.
  INSERT INTO gallery_settings_audit (gallery_id, changed_by, patch, before, after)
  VALUES (
    p_gallery_id,
    auth.uid(),
    p_patch,
    v_before,
    jsonb_build_object(
      'access_type', v_gallery.access_type,
      'event_date', v_gallery.event_date,
      'event_location', v_gallery.event_location,
      'event_type', v_gallery.event_type,
      'downloads_enabled', v_gallery.downloads_enabled,
      'download_quality', v_gallery.download_quality,
      'cover_image_id', v_gallery.cover_image_id,
      'face_index_enabled', v_gallery.face_index_enabled,
      'face_privacy_mode', v_gallery.face_privacy_mode,
      'presentation', v_gallery.presentation_settings
    )
  );

  RETURN v_gallery;
END;
$$;

REVOKE ALL ON FUNCTION update_gallery_settings(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_gallery_settings(UUID, JSONB) TO authenticated;

-- ── 3. After cutover (NOT in this migration) ──────────────────────────────
-- A follow-up cleanup migration should:
--   - DROP COLUMN galleries.delivery_settings  (after 2 weeks of stable RPC traffic)
--   - REVOKE UPDATE (delivery_settings, presentation_settings, access_type, ...)
--     FROM authenticated ON TABLE galleries
--   - Leave SELECT in place for the owner Dashboard query.
--
-- That cleanup pass is intentionally NOT in this batch. We want the RPC to
-- bake in production first.

COMMIT;
