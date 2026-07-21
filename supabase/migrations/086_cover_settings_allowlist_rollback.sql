-- ─────────────────────────────────────────────────────────────────────────────
-- 086_cover_settings_allowlist_rollback.sql
--
-- Reverts 086 by restoring the pre-086 _validate_delivery_settings_patch
-- (the definition deployed before this feature). After running this, the
-- coverEnabled / coverSource keys reject as unknown_key again — any already
-- persisted values in delivery_settings JSONB remain (harmless, ignored by
-- the viewer's backward-compat defaults) but can no longer be written.
--
-- Run this ONLY to roll back migration 086. It does not touch any other
-- object. Idempotent.
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
    'facePrivacyMode',jsonb_build_array('open','private'));
  v_bool_keys CONSTANT TEXT[] := ARRAY[
    'requireGalleryCode','downloadsEnabled','allowDownloads',
    'bulkDownloadEnabled','trackDownloads','showFooterCredit',
    'generateStories','autoGenerateStories','showStories',
    'faceIndexEnabled','clientHidePhotosEnabled','clientSelectionEnabled',
    'watermarkEnabled','faceRecognition'];
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
