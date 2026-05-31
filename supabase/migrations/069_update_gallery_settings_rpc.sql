-- ─────────────────────────────────────────────────────────────────────────────
-- 069_update_gallery_settings_rpc.sql — Phase 6 Step 4
--
-- Server-side validation boundary for delivery_settings writes. Mirrors the
-- client Zod allowlist in gallery-web/src/lib/deliverySettingsSchema.ts —
-- unknown keys reject, oneOf / maxLength / boolean / date rules match, and
-- the four typed columns promoted in Step 2 (event_date, event_type,
-- event_location, access_type) are dual-written atomically when the patch
-- includes those keys.
--
-- The dashboard's update helpers call this RPC; direct UPDATEs on
-- galleries.delivery_settings from anon/authenticated are revoked at the
-- end of this migration so the RPC becomes the only path. SELECT and other
-- column UPDATEs remain intact to avoid breaking unrelated code paths.
--
-- Failure mode for forensics: every call writes a row to
-- gallery_settings_audit with {user_id, gallery_id, patch, prev_settings,
-- created_at}. We keep the audit row narrow (no full-row snapshot) so the
-- table stays cheap; the patch + prev are enough to reconstruct intent
-- when a bug surfaces.
--
-- Idempotent: CREATE OR REPLACE function, CREATE TABLE IF NOT EXISTS,
-- DO-block guards on grants.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Audit table ───────────────────────────────────────────────────────────
-- Narrow on purpose. patch + prev_settings are the minimum needed to replay
-- a setting change; we don't snapshot the full galleries row.
CREATE TABLE IF NOT EXISTS public.gallery_settings_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id    UUID NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  user_id       UUID,
  patch         JSONB NOT NULL,
  prev_settings JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gallery_settings_audit_gallery_idx
  ON public.gallery_settings_audit (gallery_id, created_at DESC);

-- Audit is internal — only the RPC (running as SECURITY DEFINER) needs to
-- write, and only owners should read. No direct grants for anon/authenticated.
ALTER TABLE public.gallery_settings_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gallery_settings_audit'
      AND policyname = 'gallery_settings_audit_owner_select'
  ) THEN
    CREATE POLICY gallery_settings_audit_owner_select
      ON public.gallery_settings_audit
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.galleries g
          WHERE g.id = gallery_settings_audit.gallery_id
            AND g.business_id = public.current_business_id()
        )
      );
  END IF;
END $$;

-- ── 2. Validation helper ─────────────────────────────────────────────────────
-- SQL mirror of the client validateDeliverySettingsPatch.
-- Returns NULL on success or a jsonb array of {key, error} on failure.
--
-- IMMUTABLE so the planner can fold this. PARALLEL SAFE so it never blocks
-- worker dispatch. search_path locked for SECURITY DEFINER hygiene.
CREATE OR REPLACE FUNCTION public._validate_delivery_settings_patch(p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  v_errors JSONB := '[]'::jsonb;
  v_key    TEXT;
  v_value  JSONB;
  v_type   TEXT;

  -- Allowlist of (key, expected_type, [max_len|oneof_values]). The Postgres
  -- arrays keep this declarative and dirt-cheap to scan.
  v_text_keys CONSTANT JSONB := jsonb_build_object(
    'galleryTitle',          120,
    'galleryDescription',    500,
    'clientName',            120,
    'welcomeMessage',        500,
    'studioName',            120,
    'studioWebsite',         300,
    'eventLocation',         120,
    'eventType',              60,
    'coverImagePath',        500,
    'coverImageUrl',         500,
    'coverImageId',           64,
    'password',              120,
    'clientCode',             32,
    'galleryCode',            32,
    'logoUrl',               300,
    'themeColor',             32,
    'navStyle',               32,
    'watermarkText',         120,
    'watermarkPosition',      32
  );

  v_oneof_keys CONSTANT JSONB := jsonb_build_object(
    'accessType',       jsonb_build_array('public', 'password', 'code'),
    'downloadQuality',  jsonb_build_array('web', 'high', 'original'),
    'layoutMode',       jsonb_build_array('1-col', '2-col', '3-col'),
    'imageSpacing',     jsonb_build_array('none', 'small', 'medium'),
    'cornerStyle',      jsonb_build_array('sharp', 'rounded'),
    'feedLayout',       jsonb_build_array('grid', 'masonry', 'carousel'),
    'welcomeStyle',     jsonb_build_array('mosaic', 'cinematic', 'minimal'),
    'facePrivacyMode',  jsonb_build_array('open', 'private')
  );

  -- Booleans are checked by jsonb type. List kept in sync with the client
  -- schema's `boolean(...)` rules.
  v_bool_keys CONSTANT TEXT[] := ARRAY[
    'requireGalleryCode', 'downloadsEnabled', 'allowDownloads',
    'bulkDownloadEnabled', 'trackDownloads', 'showFooterCredit',
    'generateStories', 'autoGenerateStories', 'showStories',
    'faceIndexEnabled', 'clientHidePhotosEnabled', 'clientSelectionEnabled',
    'watermarkEnabled'
  ];

  -- Special-cased: eventDate must parse as DATE; coverCrop is an object.
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN jsonb_build_array(
      jsonb_build_object('key', '_root', 'error', 'patch_must_be_object')
    );
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_patch) LOOP
    v_type := jsonb_typeof(v_value);

    -- ── Text fields with max-length ─────────────────────────────────────────
    IF v_text_keys ? v_key THEN
      IF v_type = 'null' THEN
        CONTINUE;
      ELSIF v_type <> 'string' THEN
        v_errors := v_errors || jsonb_build_object('key', v_key, 'error', 'expected_string');
      ELSIF char_length(v_value #>> '{}') > (v_text_keys ->> v_key)::int THEN
        v_errors := v_errors || jsonb_build_object('key', v_key, 'error', 'too_long');
      END IF;

    -- ── Enum / one-of fields ────────────────────────────────────────────────
    ELSIF v_oneof_keys ? v_key THEN
      IF v_type = 'null' THEN
        CONTINUE;
      ELSIF v_type <> 'string' THEN
        v_errors := v_errors || jsonb_build_object('key', v_key, 'error', 'expected_string');
      ELSIF NOT (v_oneof_keys -> v_key) @> to_jsonb(v_value #>> '{}') THEN
        v_errors := v_errors || jsonb_build_object('key', v_key, 'error', 'not_in_allowed_values');
      END IF;

    -- ── Boolean fields ──────────────────────────────────────────────────────
    ELSIF v_key = ANY(v_bool_keys) THEN
      IF v_type NOT IN ('boolean', 'null') THEN
        v_errors := v_errors || jsonb_build_object('key', v_key, 'error', 'expected_boolean');
      END IF;

    -- ── eventDate: must parse as DATE ───────────────────────────────────────
    ELSIF v_key = 'eventDate' THEN
      IF v_type = 'null' OR (v_type = 'string' AND (v_value #>> '{}') = '') THEN
        CONTINUE;
      ELSIF v_type <> 'string' THEN
        v_errors := v_errors || jsonb_build_object('key', v_key, 'error', 'expected_string');
      ELSE
        BEGIN
          PERFORM (v_value #>> '{}')::date;
        EXCEPTION WHEN OTHERS THEN
          v_errors := v_errors || jsonb_build_object('key', v_key, 'error', 'invalid_date');
        END;
      END IF;

    -- ── coverCrop: nested {zoom, x, y} numbers in range ─────────────────────
    ELSIF v_key = 'coverCrop' THEN
      IF v_type = 'null' THEN
        CONTINUE;
      ELSIF v_type <> 'object' THEN
        v_errors := v_errors || jsonb_build_object('key', v_key, 'error', 'expected_object');
      ELSE
        DECLARE
          v_zoom NUMERIC := (v_value ->> 'zoom')::numeric;
          v_x    NUMERIC := (v_value ->> 'x')::numeric;
          v_y    NUMERIC := (v_value ->> 'y')::numeric;
        BEGIN
          IF v_zoom IS NULL OR v_zoom < 0.5 OR v_zoom > 4
             OR v_x IS NULL OR v_x < -1 OR v_x > 1
             OR v_y IS NULL OR v_y < -1 OR v_y > 1 THEN
            v_errors := v_errors || jsonb_build_object('key', v_key, 'error', 'crop_out_of_range');
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_errors := v_errors || jsonb_build_object('key', v_key, 'error', 'crop_invalid');
        END;
      END IF;

    -- ── Anything else → unknown key (drift) ─────────────────────────────────
    ELSE
      v_errors := v_errors || jsonb_build_object('key', v_key, 'error', 'unknown_key');
    END IF;
  END LOOP;

  IF jsonb_array_length(v_errors) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN v_errors;
END;
$$;

-- ── 3. The RPC ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_gallery_settings(
  p_gallery_id UUID,
  p_patch      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_biz_id    UUID;
  v_prev      JSONB;
  v_new       JSONB;
  v_errors    JSONB;
  v_owner_biz UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array(
      jsonb_build_object('key', '_auth', 'error', 'not_authenticated')
    ));
  END IF;

  IF p_gallery_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array(
      jsonb_build_object('key', '_gallery_id', 'error', 'missing')
    ));
  END IF;

  -- Owner check via current_business_id() — same pattern as other RPCs.
  v_biz_id := public.current_business_id();
  IF v_biz_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array(
      jsonb_build_object('key', '_business', 'error', 'no_business')
    ));
  END IF;

  SELECT business_id, delivery_settings
    INTO v_owner_biz, v_prev
  FROM public.galleries
  WHERE id = p_gallery_id;

  IF v_owner_biz IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array(
      jsonb_build_object('key', '_gallery', 'error', 'not_found')
    ));
  END IF;

  IF v_owner_biz <> v_biz_id THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array(
      jsonb_build_object('key', '_gallery', 'error', 'not_owner')
    ));
  END IF;

  -- Validate. Mirrors the client Zod allowlist exactly.
  v_errors := public._validate_delivery_settings_patch(p_patch);
  IF v_errors IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  -- Atomic dual-write: JSONB merge + the four typed Step-2 columns when the
  -- patch touches them. Single UPDATE so the row never sees a half-applied
  -- state and the audit row below captures the exact transition.
  UPDATE public.galleries
     SET delivery_settings = COALESCE(delivery_settings, '{}'::jsonb) || p_patch,

         event_date = CASE
           WHEN p_patch ? 'eventDate' THEN
             CASE
               WHEN NULLIF(p_patch ->> 'eventDate', '') IS NULL THEN NULL
               ELSE (p_patch ->> 'eventDate')::date
             END
           ELSE event_date
         END,

         event_type = CASE
           WHEN p_patch ? 'eventType' THEN NULLIF(p_patch ->> 'eventType', '')
           ELSE event_type
         END,

         event_location = CASE
           WHEN p_patch ? 'eventLocation' THEN NULLIF(p_patch ->> 'eventLocation', '')
           ELSE event_location
         END,

         access_type = CASE
           WHEN p_patch ? 'accessType' THEN COALESCE(NULLIF(p_patch ->> 'accessType', ''), 'public')
           ELSE access_type
         END

   WHERE id = p_gallery_id
   RETURNING delivery_settings INTO v_new;

  -- Audit — best effort, but inside the same transaction so a failed insert
  -- rolls back the settings update too.
  INSERT INTO public.gallery_settings_audit (gallery_id, user_id, patch, prev_settings)
  VALUES (p_gallery_id, v_uid, p_patch, v_prev);

  RETURN jsonb_build_object('ok', true, 'delivery_settings', v_new);
END;
$$;

-- ── 4. Grants ────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.update_gallery_settings(UUID, JSONB) TO authenticated;
-- Validation helper is internal but harmless to expose; granting EXECUTE so
-- the dashboard could call it directly for a dry-run if we ever want one.
GRANT EXECUTE ON FUNCTION public._validate_delivery_settings_patch(JSONB) TO authenticated;

-- ── 5. Lock down direct delivery_settings UPDATE ────────────────────────────
-- The RPC becomes the only write path. Postgres can't subtract a single
-- column from a table-level UPDATE grant; we have to revoke the table-level
-- grant and re-grant UPDATE on every column EXCEPT delivery_settings.
--
-- RLS still gates everything; this is a defense-in-depth measure so a
-- direct `from('galleries').update({ delivery_settings: ... })` fails fast
-- with a permission error instead of silently bypassing validation. The
-- explicit column list is hand-maintained — when new columns are added,
-- the migration that adds them should also extend these GRANTs.
REVOKE UPDATE ON public.galleries FROM authenticated;
REVOKE UPDATE ON public.galleries FROM anon;

GRANT UPDATE (
  name, client_id, status, public_url, created_at, published_at,
  client_name, image_count, local_id, business_id, project_slug, updated_at,
  demo_expires_at, demo_ip_hash, face_index_enabled, face_index_status,
  rekognition_collection_id, face_indexed_count, face_index_error,
  face_indexed_at, slug, preview_ready, originals_ready, publish_status,
  total_images, preview_uploaded_count, original_uploaded_count,
  original_failed_count, last_upload_resume_at, password_hash,
  signed_gate_enabled, download_count, favorite_count, last_publish_error,
  event_date, event_type, event_location, access_type, client_code_hash,
  published_revision_id
) ON public.galleries TO authenticated;

GRANT UPDATE (
  name, client_id, status, public_url, created_at, published_at,
  client_name, image_count, local_id, business_id, project_slug, updated_at,
  demo_expires_at, demo_ip_hash, face_index_enabled, face_index_status,
  rekognition_collection_id, face_indexed_count, face_index_error,
  face_indexed_at, slug, preview_ready, originals_ready, publish_status,
  total_images, preview_uploaded_count, original_uploaded_count,
  original_failed_count, last_upload_resume_at, password_hash,
  signed_gate_enabled, download_count, favorite_count, last_publish_error,
  event_date, event_type, event_location, access_type, client_code_hash,
  published_revision_id
) ON public.galleries TO anon;

COMMIT;

-- ── Post-condition sanity (run manually) ─────────────────────────────────────
-- SELECT update_gallery_settings(
--   (SELECT id FROM galleries LIMIT 1),
--   jsonb_build_object('coverImageURL', 'typo')   -- should reject as unknown_key
-- );
-- SELECT update_gallery_settings(
--   (SELECT id FROM galleries LIMIT 1),
--   jsonb_build_object('accessType', 'public', 'eventDate', '2026-05-30')
-- );  -- should succeed and dual-write access_type + event_date.
