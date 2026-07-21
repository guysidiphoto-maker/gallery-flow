-- ─────────────────────────────────────────────────────────────────────────────
-- 086_cover_settings_allowlist.sql — Gallery cover image feature
--
-- Widens the server-side delivery_settings validator so the two new cover
-- keys survive the update_gallery_settings RPC's allowlist:
--
--   • coverEnabled  (boolean)  — owner's explicit "show cover" switch,
--                                independent of the gallery privacy setting.
--   • coverSource   (enum)     — 'none' | 'gallery_asset' | 'custom_upload'
--                                where a cover comes from.
--
-- The existing cover keys (coverImagePath, coverImageUrl, coverImageId,
-- coverCrop) are already allow-listed — no change to those. No new columns,
-- no RLS change, no bucket change, no grant change. Everything stays inside
-- the delivery_settings JSONB, matching how every other cover field is stored.
--
-- This CREATE OR REPLACE reproduces the CURRENTLY DEPLOYED function verbatim
-- (read from prod via pg_get_functiondef on 2026-07-21 — note it is wider than
-- migration 069: extra text keys, 'feed' in feedLayout, coverCrop x/y accept
-- the -100..100 desktop convention) and adds ONLY the two lines for the new
-- keys. Do not regress the widened allowlist.
--
-- Idempotent (CREATE OR REPLACE). Fully reversible — see
-- 086_cover_settings_allowlist_rollback.sql, which restores the pre-086
-- definition (the two new keys then simply reject as unknown_key again).
--
-- BACKWARD COMPATIBLE: existing galleries have neither key in their JSONB, so
-- nothing changes for them until an owner opts in.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public._validate_delivery_settings_patch(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
DECLARE
  v_errors JSONB := '[]'::jsonb;
  v_key    TEXT;
  v_value  JSONB;
  v_type   TEXT;
  v_text_keys CONSTANT JSONB := jsonb_build_object(
    'galleryTitle',120,'galleryDescription',500,'clientName',120,
    'welcomeMessage',500,'studioName',120,'studioWebsite',300,
    'eventLocation',120,'eventType',60,'coverImagePath',500,
    'coverImageUrl',500,'coverImageId',64,'password',120,
    'clientCode',32,'galleryCode',32,'logoUrl',300,'themeColor',32,
    'navStyle',32,'watermarkText',120,'watermarkPosition',32,
    'headingFont',60,'bodyFont',60,'language',8,'thumbnailSize',16,
    'welcomeTextAnimation',24,'welcomeAnimationSpeed',16,
    'gridDirection',8,'creditsSystem',24);
  v_oneof_keys CONSTANT JSONB := jsonb_build_object(
    'accessType',jsonb_build_array('public','password','code'),
    'downloadQuality',jsonb_build_array('web','high','original'),
    'layoutMode',jsonb_build_array('1-col','2-col','3-col'),
    'imageSpacing',jsonb_build_array('none','small','medium'),
    'cornerStyle',jsonb_build_array('sharp','rounded'),
    'feedLayout',jsonb_build_array('grid','masonry','carousel','feed'),
    'welcomeStyle',jsonb_build_array('mosaic','cinematic','minimal'),
    'facePrivacyMode',jsonb_build_array('open','private'),
    -- NEW (086): where the gallery cover comes from.
    'coverSource',jsonb_build_array('none','gallery_asset','custom_upload'));
  v_bool_keys CONSTANT TEXT[] := ARRAY[
    'requireGalleryCode','downloadsEnabled','allowDownloads',
    'bulkDownloadEnabled','trackDownloads','showFooterCredit',
    'generateStories','autoGenerateStories','showStories',
    'faceIndexEnabled','clientHidePhotosEnabled','clientSelectionEnabled',
    'watermarkEnabled','faceRecognition',
    -- NEW (086): owner's explicit show-cover switch.
    'coverEnabled'];
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN jsonb_build_array(jsonb_build_object('key','_root','error','patch_must_be_object'));
  END IF;
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_patch) LOOP
    v_type := jsonb_typeof(v_value);
    IF v_text_keys ? v_key THEN
      IF v_type = 'null' THEN CONTINUE;
      ELSIF v_type <> 'string' THEN
        v_errors := v_errors || jsonb_build_object('key',v_key,'error','expected_string');
      ELSIF char_length(v_value #>> '{}') > (v_text_keys ->> v_key)::int THEN
        v_errors := v_errors || jsonb_build_object('key',v_key,'error','too_long');
      END IF;
    ELSIF v_oneof_keys ? v_key THEN
      IF v_type = 'null' THEN CONTINUE;
      ELSIF v_type <> 'string' THEN
        v_errors := v_errors || jsonb_build_object('key',v_key,'error','expected_string');
      ELSIF NOT (v_oneof_keys -> v_key) @> to_jsonb(v_value #>> '{}') THEN
        v_errors := v_errors || jsonb_build_object('key',v_key,'error','not_in_allowed_values');
      END IF;
    ELSIF v_key = ANY(v_bool_keys) THEN
      IF v_type NOT IN ('boolean','null') THEN
        v_errors := v_errors || jsonb_build_object('key',v_key,'error','expected_boolean');
      END IF;
    ELSIF v_key = 'eventDate' THEN
      IF v_type = 'null' OR (v_type = 'string' AND (v_value #>> '{}') = '') THEN CONTINUE;
      ELSIF v_type <> 'string' THEN
        v_errors := v_errors || jsonb_build_object('key',v_key,'error','expected_string');
      ELSE
        BEGIN
          PERFORM (v_value #>> '{}')::date;
        EXCEPTION WHEN OTHERS THEN
          v_errors := v_errors || jsonb_build_object('key',v_key,'error','invalid_date');
        END;
      END IF;
    ELSIF v_key = 'coverCrop' THEN
      IF v_type = 'null' THEN CONTINUE;
      ELSIF v_type <> 'object' THEN
        v_errors := v_errors || jsonb_build_object('key',v_key,'error','expected_object');
      ELSE
        DECLARE v_zoom NUMERIC; v_x NUMERIC; v_y NUMERIC;
        BEGIN
          v_zoom := (v_value ->> 'zoom')::numeric;
          v_x    := (v_value ->> 'x')::numeric;
          v_y    := (v_value ->> 'y')::numeric;
          -- x/y accept both web (-1..1) and desktop (0..100) conventions.
          IF v_zoom IS NULL OR v_zoom < 0.5 OR v_zoom > 4
             OR v_x IS NULL OR v_x < -100 OR v_x > 100
             OR v_y IS NULL OR v_y < -100 OR v_y > 100 THEN
            v_errors := v_errors || jsonb_build_object('key',v_key,'error','crop_out_of_range');
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_errors := v_errors || jsonb_build_object('key',v_key,'error','crop_invalid');
        END;
      END IF;
    ELSE
      v_errors := v_errors || jsonb_build_object('key',v_key,'error','unknown_key');
    END IF;
  END LOOP;
  IF jsonb_array_length(v_errors) = 0 THEN RETURN NULL; END IF;
  RETURN v_errors;
END;
$function$;

COMMIT;

-- ── Post-condition sanity (run manually) ─────────────────────────────────────
-- SELECT public._validate_delivery_settings_patch(
--   jsonb_build_object('coverEnabled', true, 'coverSource', 'custom_upload')
-- );  -- expect NULL (valid)
-- SELECT public._validate_delivery_settings_patch(
--   jsonb_build_object('coverSource', 'bogus')
-- );  -- expect [{"key":"coverSource","error":"not_in_allowed_values"}]
-- SELECT public._validate_delivery_settings_patch(
--   jsonb_build_object('coverEnabled', 'yes')
-- );  -- expect [{"key":"coverEnabled","error":"expected_boolean"}]
