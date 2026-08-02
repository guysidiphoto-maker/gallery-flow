-- ═══════════════════════════════════════════════════════════════════════════
-- STAGING_provision_editor_rpcs.sql
--
-- ⚠️  STAGING ENVIRONMENT PROVISIONING — NOT a product migration.
--     Apply ONLY to pixflow-cpv2-staging (project ref idzeizesynyjcyfqfznh).
--     Do NOT number this into supabase/migrations/. Do NOT apply to Production
--     or the old pixflow-staging project.
--
-- WHY THIS EXISTS
--   The CPV2 staging DB was reconstructed as a VIEWER-parity environment: it has
--   the public read RPCs (gallery_bootstrap / gallery_get_images / gallery_get_meta
--   / gallery_is_locked) but is MISSING the editor WRITE RPCs. Without them the
--   dashboard editor cannot save any delivery_settings, so cover/grid/branding QA
--   is impossible and migration 105 (which widens _validate_delivery_settings_patch)
--   has no target.
--
--   The historical migrations that created these (069, 070, 086) cannot be
--   replayed verbatim: 069's REVOKE/GRANT lockdown hard-codes a galleries column
--   list, and this staging DB has NEWER columns (event_keywords, industry,
--   venue_type, time_of_day, event_size_bucket, …) that predate-independent work
--   added. Replaying the fixed list would strip UPDATE on those newer columns.
--
--   So this script provisions the THREE required editor functions with the EXACT
--   canonical bodies from the repo (which were verified byte-for-contract against
--   Production read-only on 2026-08-01: same signatures, owner=postgres,
--   SECURITY DEFINER where applicable, search_path=public, same grants), and
--   replaces 069's fixed-list lockdown with a DYNAMIC equivalent that re-grants
--   every current galleries column EXCEPT delivery_settings — preserving the prod
--   contract ("the RPC is the only delivery_settings write path") without
--   disturbing this DB's other columns/flows.
--
-- CONTRACTS PROVISIONED (all verified against Production read-only):
--   • _validate_delivery_settings_patch(jsonb)      — 086 canonical (has coverSource,
--       coverEnabled, widened coverCrop). Migration 105 widens it further afterwards.
--   • update_gallery_settings(uuid, jsonb)          — 069 canonical. Owner-checked via
--       current_business_id(); rejects unknown keys / invalid values / cross-business.
--   • reorder_images(uuid, uuid[], int[])           — 070 canonical. Owner + gallery-scope
--       checked; foreign image ids filtered out.
--   • gallery_settings_audit table (+RLS owner-select) — 069 canonical.
--
--   mark_gallery_paid is deliberately NOT provisioned — the gallery-payment
--   feature is retired and nothing calls it.
--
-- Idempotent (CREATE OR REPLACE / IF NOT EXISTS / guarded policy).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Audit table (canonical from 069) ─────────────────────────────────────
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

ALTER TABLE public.gallery_settings_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='gallery_settings_audit'
      AND policyname='gallery_settings_audit_owner_select'
  ) THEN
    CREATE POLICY gallery_settings_audit_owner_select
      ON public.gallery_settings_audit FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.galleries g
        WHERE g.id = gallery_settings_audit.gallery_id
          AND g.business_id = public.current_business_id()));
  END IF;
END $$;

-- ── 2. _validate_delivery_settings_patch — 086 canonical level ──────────────
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
    'coverSource',jsonb_build_array('none','gallery_asset','custom_upload'));
  v_bool_keys CONSTANT TEXT[] := ARRAY[
    'requireGalleryCode','downloadsEnabled','allowDownloads',
    'bulkDownloadEnabled','trackDownloads','showFooterCredit',
    'generateStories','autoGenerateStories','showStories',
    'faceIndexEnabled','clientHidePhotosEnabled','clientSelectionEnabled',
    'watermarkEnabled','faceRecognition','coverEnabled'];
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

-- ── 3. update_gallery_settings — 069 canonical ─────────────────────────────
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
      jsonb_build_object('key', '_auth', 'error', 'not_authenticated')));
  END IF;
  IF p_gallery_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array(
      jsonb_build_object('key', '_gallery_id', 'error', 'missing')));
  END IF;
  v_biz_id := public.current_business_id();
  IF v_biz_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array(
      jsonb_build_object('key', '_business', 'error', 'no_business')));
  END IF;
  SELECT business_id, delivery_settings INTO v_owner_biz, v_prev
  FROM public.galleries WHERE id = p_gallery_id;
  IF v_owner_biz IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array(
      jsonb_build_object('key', '_gallery', 'error', 'not_found')));
  END IF;
  IF v_owner_biz <> v_biz_id THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array(
      jsonb_build_object('key', '_gallery', 'error', 'not_owner')));
  END IF;
  v_errors := public._validate_delivery_settings_patch(p_patch);
  IF v_errors IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;
  UPDATE public.galleries
     SET delivery_settings = COALESCE(delivery_settings, '{}'::jsonb) || p_patch,
         event_date = CASE
           WHEN p_patch ? 'eventDate' THEN
             CASE WHEN NULLIF(p_patch ->> 'eventDate', '') IS NULL THEN NULL
                  ELSE (p_patch ->> 'eventDate')::date END
           ELSE event_date END,
         event_type = CASE
           WHEN p_patch ? 'eventType' THEN NULLIF(p_patch ->> 'eventType', '')
           ELSE event_type END,
         event_location = CASE
           WHEN p_patch ? 'eventLocation' THEN NULLIF(p_patch ->> 'eventLocation', '')
           ELSE event_location END,
         access_type = CASE
           WHEN p_patch ? 'accessType' THEN COALESCE(NULLIF(p_patch ->> 'accessType', ''), 'public')
           ELSE access_type END
   WHERE id = p_gallery_id
   RETURNING delivery_settings INTO v_new;
  INSERT INTO public.gallery_settings_audit (gallery_id, user_id, patch, prev_settings)
  VALUES (p_gallery_id, v_uid, p_patch, v_prev);
  RETURN jsonb_build_object('ok', true, 'delivery_settings', v_new);
END;
$$;

-- ── 4. reorder_images — 070 canonical ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reorder_images(
  p_gallery_id UUID,
  p_ids        UUID[],
  p_orders     INT[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_owner_id    UUID;
  v_updated     INT;
BEGIN
  IF p_ids IS NULL OR p_orders IS NULL OR array_length(p_ids, 1) IS DISTINCT FROM array_length(p_orders, 1) THEN
    RAISE NOTICE 'reorder_images: length mismatch (ids=%, orders=%)',
      coalesce(array_length(p_ids, 1), 0), coalesce(array_length(p_orders, 1), 0);
    RETURN 0;
  END IF;
  IF array_length(p_ids, 1) = 0 THEN RETURN 0; END IF;
  v_business_id := public.current_business_id();
  IF v_business_id IS NULL THEN
    RAISE NOTICE 'reorder_images: no current_business_id (unauthenticated?)';
    RETURN 0;
  END IF;
  SELECT g.business_id INTO v_owner_id FROM public.galleries g WHERE g.id = p_gallery_id;
  IF v_owner_id IS NULL OR v_owner_id <> v_business_id THEN
    RAISE NOTICE 'reorder_images: gallery % not owned by business %', p_gallery_id, v_business_id;
    RETURN 0;
  END IF;
  WITH pairs AS (SELECT * FROM unnest(p_ids, p_orders) AS u(id, new_order))
  UPDATE public.images i
  SET    sort_order = pairs.new_order
  FROM   pairs
  WHERE  i.id = pairs.id AND i.gallery_id = p_gallery_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- ── 5. Grants (canonical, matching Production) ──────────────────────────────
GRANT EXECUTE ON FUNCTION public.update_gallery_settings(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public._validate_delivery_settings_patch(JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.reorder_images(UUID, UUID[], INT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_images(UUID, UUID[], INT[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reorder_images(UUID, UUID[], INT[]) TO authenticated;

COMMENT ON FUNCTION public.reorder_images(UUID, UUID[], INT[]) IS
  'Batched image reorder. Owner-gated via current_business_id() + gallery business_id check.';

-- ── 6. Direct delivery_settings write-lockdown — DYNAMIC (staging-safe) ──────
-- Canonical prod behavior: revoke table-level UPDATE and re-grant every column
-- EXCEPT delivery_settings, so the RPC is the only validated write path. Here we
-- compute the column list from the CURRENT galleries schema instead of a fixed
-- list, so this DB's newer columns keep their UPDATE grant.
DO $lock$
DECLARE v_cols text;
BEGIN
  REVOKE UPDATE ON public.galleries FROM authenticated;
  REVOKE UPDATE ON public.galleries FROM anon;
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='galleries'
     AND column_name <> 'delivery_settings';
  EXECUTE format('GRANT UPDATE (%s) ON public.galleries TO authenticated', v_cols);
  EXECUTE format('GRANT UPDATE (%s) ON public.galleries TO anon', v_cols);
END $lock$;

COMMIT;
