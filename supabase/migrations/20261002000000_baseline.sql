-- Baseline: production's schema as of 2026-10-03, dumped with
-- `supabase db dump --linked`. It replaces migrations 002-115, which are kept in
-- supabase/migrations_archive/ for history. Production applied many changes
-- directly (some never committed), so this dump, not the archive, is the source
-- of truth. New changes go in new timestamped files after this one.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."gallery_status" AS ENUM (
    'draft',
    'live',
    'archived'
);


ALTER TYPE "public"."gallery_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_bump_gallery_download_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE galleries SET download_count = download_count + 1
   WHERE id = NEW.gallery_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_bump_gallery_download_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_bump_gallery_favorite_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE galleries SET favorite_count = favorite_count + 1
     WHERE id = NEW.gallery_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE galleries SET favorite_count = GREATEST(0, favorite_count - 1)
     WHERE id = OLD.gallery_id;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."_bump_gallery_favorite_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_gallery_authz"("p_gallery_id" "uuid", "p_token" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  has_pw   BOOLEAN;
  gated    BOOLEAN;
  status_  TEXT;
  v_owner  UUID;
  ok       BOOLEAN;
BEGIN
  SELECT g.password_hash IS NOT NULL, g.signed_gate_enabled, g.status, b.user_id
    INTO has_pw, gated, status_, v_owner
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  IF status_ IS NULL THEN RETURN false; END IF;
  -- Authenticated owner → full access to their own gallery, any status.
  IF auth.uid() IS NOT NULL AND v_owner = auth.uid() THEN RETURN true; END IF;
  -- Everyone else → live only.
  IF status_ <> 'live' THEN RETURN false; END IF;
  IF has_pw AND gated THEN
    IF p_token IS NULL THEN RETURN false; END IF;
    SELECT EXISTS (
      SELECT 1 FROM gallery_unlock_tokens
       WHERE token = p_token AND gallery_id = p_gallery_id AND expires_at > now()
    ) INTO ok;
    RETURN ok;
  END IF;
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."_gallery_authz"("p_gallery_id" "uuid", "p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_gallery_presets_biu"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.settings := public._sanitize_preset_settings(NEW.settings);
  NEW.updated_at := now();
  -- Enforce a single default per business by clearing the others.
  IF NEW.is_default THEN
    UPDATE public.gallery_presets
       SET is_default = false, updated_at = now()
     WHERE business_id = NEW.business_id
       AND id <> NEW.id
       AND is_default;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_gallery_presets_biu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_grant_signup_tokens"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO business_tokens (business_id, balance, lifetime_purchased)
  VALUES (NEW.id, 100, 100)
  ON CONFLICT (business_id) DO NOTHING;
  IF FOUND THEN
    INSERT INTO token_ledger (business_id, delta, reason, metadata)
    VALUES (NEW.id, 100, 'signup_grant',
            jsonb_build_object('source', 'business_insert_trigger'));
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_grant_signup_tokens"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_sanitize_preset_settings"("p_settings" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_allowed TEXT[] := ARRAY[
    -- Downloads
    'downloadsEnabled','bulkDownloadEnabled','trackDownloads','downloadQuality',
    -- Access mode default (NOT the password / codes)
    'accessType','facePrivacyMode','clientSelectionEnabled',
    -- Watermark
    'watermarkEnabled','watermarkText','watermarkPosition','watermarkSource',
    'watermarkScalePercent','watermarkOpacityPercent','watermarkContrastAware',
    -- Grid / layout
    'gridSpacing','layoutMode','imageSpacing','cornerStyle','thumbnailSize','feedLayout',
    -- Appearance / branding policy (NOT logoUrl — that is a per-gallery asset)
    'appearance','themeColor','headingFont','bodyFont','showFooterCredit',
    -- Welcome / viewer
    'welcomeStyle','generateStories','showStories'
  ];
  v_out JSONB := '{}'::jsonb;
  v_key TEXT;
BEGIN
  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  FOREACH v_key IN ARRAY v_allowed LOOP
    IF p_settings ? v_key THEN
      v_out := v_out || jsonb_build_object(v_key, p_settings -> v_key);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;


ALTER FUNCTION "public"."_sanitize_preset_settings"("p_settings" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_validate_delivery_settings_patch"("p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'public'
    AS $$
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
    'imageSpacing',jsonb_build_array('none','small','medium','wide'),
    'cornerStyle',jsonb_build_array('sharp','rounded'),
    'feedLayout',jsonb_build_array('grid','masonry','carousel','feed'),
    'welcomeStyle',jsonb_build_array('mosaic','cinematic','minimal'),
    'facePrivacyMode',jsonb_build_array('open','private'),
    'coverSource',jsonb_build_array('none','gallery_asset','custom_upload'),
    'gridSpacing',jsonb_build_array('regular','large'),
    'appearance',jsonb_build_array('editorial','light','dark'));
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
        BEGIN PERFORM (v_value #>> '{}')::date;
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
$$;


ALTER FUNCTION "public"."_validate_delivery_settings_patch"("p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_tokens"("p_business_id" "uuid", "p_count" integer, "p_reason" "text", "p_ref_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_count <= 0 THEN RAISE EXCEPTION 'count must be positive'; END IF;
  IF p_reason NOT IN ('purchase', 'refund', 'admin_grant') THEN
    RAISE EXCEPTION 'invalid reason for credit: %', p_reason;
  END IF;

  INSERT INTO business_tokens (business_id, balance, lifetime_purchased)
  VALUES (p_business_id, p_count, CASE WHEN p_reason = 'purchase' THEN p_count ELSE 0 END)
  ON CONFLICT (business_id) DO UPDATE
     SET balance = business_tokens.balance + EXCLUDED.balance,
         lifetime_purchased = business_tokens.lifetime_purchased
                            + CASE WHEN p_reason = 'purchase' THEN p_count ELSE 0 END,
         updated_at = now()
  RETURNING balance INTO v_balance;

  INSERT INTO token_ledger (business_id, delta, reason, ref_id, metadata)
  VALUES (p_business_id, p_count, p_reason, p_ref_id, p_metadata);

  RETURN v_balance;
END;
$$;


ALTER FUNCTION "public"."add_tokens"("p_business_id" "uuid", "p_count" integer, "p_reason" "text", "p_ref_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_grant_credits"("p_business_id" "uuid", "p_count" integer, "p_reason" "text", "p_admin_id" "uuid", "p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_ins uuid; v_balance integer; v_max constant integer := 1000000;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'request_id required'; END IF;
  IF p_admin_id IS NULL THEN RAISE EXCEPTION 'admin_id required'; END IF;
  IF p_count IS NULL OR p_count <= 0 THEN RAISE EXCEPTION 'count must be a positive integer'; END IF;
  IF p_count > v_max THEN RAISE EXCEPTION 'count exceeds max %', v_max; END IF;
  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN RAISE EXCEPTION 'business_not_found'; END IF;
  INSERT INTO token_ledger (business_id, delta, reason, ref_id, metadata)
  VALUES (p_business_id, p_count, 'admin_grant', p_request_id,
          jsonb_build_object('admin_id', p_admin_id, 'reason', left(COALESCE(p_reason,''),500),
                             'request_id', p_request_id, 'granted_at', now()))
  ON CONFLICT (ref_id) WHERE reason='admin_grant' AND ref_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_ins;
  IF v_ins IS NULL THEN
    SELECT COALESCE(balance,0) INTO v_balance FROM business_tokens WHERE business_id = p_business_id;
    RETURN jsonb_build_object('granted', false, 'duplicate', true, 'balance', COALESCE(v_balance,0), 'business_id', p_business_id);
  END IF;
  INSERT INTO business_tokens (business_id, balance)
  VALUES (p_business_id, p_count)
  ON CONFLICT (business_id) DO UPDATE
    SET balance = business_tokens.balance + EXCLUDED.balance, updated_at = now()
  RETURNING balance INTO v_balance;
  RETURN jsonb_build_object('granted', true, 'duplicate', false, 'balance', v_balance, 'business_id', p_business_id);
END $$;


ALTER FUNCTION "public"."admin_grant_credits"("p_business_id" "uuid", "p_count" integer, "p_reason" "text", "p_admin_id" "uuid", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_businesses"("p_search" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 25, "p_offset" integer DEFAULT 0) RETURNS TABLE("business_id" "uuid", "email" "text", "business_name" "text", "slug" "text", "created_at" timestamp with time zone, "plan_id" "text", "plan_name" "text", "subscription_status" "text", "balance" integer, "gallery_count" integer, "total_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH filtered AS (
    SELECT b.id, u.email::text AS email, b.business_name, b.slug, b.created_at,
           s.plan_id, p.name AS plan_name, s.status AS subscription_status,
           COALESCE(bt.balance,0) AS balance,
           (SELECT count(*) FROM galleries g WHERE g.business_id = b.id)::int AS gallery_count
    FROM businesses b
    LEFT JOIN auth.users u ON u.id = b.user_id
    LEFT JOIN business_tokens bt ON bt.business_id = b.id
    LEFT JOIN subscriptions s ON s.business_id = b.id AND s.status IN ('active','trial')
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE p_search IS NULL OR p_search = ''
       OR u.email ILIKE '%'||p_search||'%'
       OR b.business_name ILIKE '%'||p_search||'%'
       OR b.id::text = p_search
  )
  SELECT f.id, f.email, f.business_name, f.slug, f.created_at, f.plan_id, f.plan_name,
         f.subscription_status, f.balance, f.gallery_count, count(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC NULLS LAST, f.business_name ASC
  LIMIT GREATEST(LEAST(COALESCE(p_limit,25), 200), 1)
  OFFSET GREATEST(COALESCE(p_offset,0), 0);
$$;


ALTER FUNCTION "public"."admin_list_businesses"("p_search" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_recent_grants"("p_limit" integer DEFAULT 50) RETURNS TABLE("ledger_id" "uuid", "business_id" "uuid", "business_name" "text", "amount" integer, "admin_id" "uuid", "admin_email" "text", "reason" "text", "request_id" "uuid", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT tl.id, tl.business_id, b.business_name, tl.delta,
         (tl.metadata->>'admin_id')::uuid AS admin_id,
         au.email::text AS admin_email,
         tl.metadata->>'reason' AS reason,
         tl.ref_id AS request_id,
         tl.created_at
  FROM token_ledger tl
  LEFT JOIN businesses b ON b.id = tl.business_id
  LEFT JOIN auth.users au ON au.id = (tl.metadata->>'admin_id')::uuid
  WHERE tl.reason = 'admin_grant'
  ORDER BY tl.created_at DESC
  LIMIT GREATEST(LEAST(COALESCE(p_limit,50), 500), 1);
$$;


ALTER FUNCTION "public"."admin_recent_grants"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."append_client_audit"("p_business_id" "uuid", "p_client_id" "uuid", "p_actor_type" "text", "p_actor_user_id" "uuid", "p_action" "text", "p_target_type" "text" DEFAULT NULL::"text", "p_target_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_id uuid;
BEGIN
  IF p_business_id IS NULL THEN RAISE EXCEPTION 'business_id required'; END IF;
  INSERT INTO public.client_access_audit
    (business_id, client_id, actor_type, actor_user_id, action, target_type, target_id, metadata)
  VALUES
    (p_business_id, p_client_id, p_actor_type, p_actor_user_id, p_action,
     p_target_type, p_target_id, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;


ALTER FUNCTION "public"."append_client_audit"("p_business_id" "uuid", "p_client_id" "uuid", "p_actor_type" "text", "p_actor_user_id" "uuid", "p_action" "text", "p_target_type" "text", "p_target_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_gallery_face_index_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  total_images   INT;
  indexed_images INT;
BEGIN
  -- Only act when face_indexed_at transitions from NULL to non-NULL.
  IF NEW.face_indexed_at IS NULL OR OLD.face_indexed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO total_images
    FROM images WHERE gallery_id = NEW.gallery_id;
  SELECT count(*) INTO indexed_images
    FROM images WHERE gallery_id = NEW.gallery_id AND face_indexed_at IS NOT NULL;

  -- Flip the gallery to 'done' once every image is indexed. Conditional on
  -- status='indexing' so we don't overwrite a 'failed' state.
  IF indexed_images >= total_images AND total_images > 0 THEN
    UPDATE galleries
       SET face_index_status = 'done',
           face_indexed_at   = now(),
           face_indexed_count = indexed_images
     WHERE id = NEW.gallery_id
       AND face_index_status = 'indexing';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_gallery_face_index_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_demo_galleries"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$                                                                                                                                                     
  DECLARE expired_id UUID;                                     
  BEGIN                                                                                                                                                                                   
    FOR expired_id IN
      SELECT id FROM galleries                                                                                                                                                            
      WHERE demo_expires_at IS NOT NULL AND demo_expires_at < now()
    LOOP                                                                                                                                                                                  
      DELETE FROM storage.objects WHERE bucket_id = 'demo-uploads' AND name LIKE expired_id::text || '/%';
      DELETE FROM galleries WHERE id = expired_id;                                                                                                                                        
    END LOOP;                                                  
  END $$;


ALTER FUNCTION "public"."cleanup_expired_demo_galleries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."client_portal_bootstrap"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false, 'memberships', '[]'::jsonb, 'galleries', '[]'::jsonb);
  END IF;

  UPDATE public.client_memberships
    SET last_access_at = now()
    WHERE auth_user_id = v_uid AND status = 'active';

  SELECT jsonb_build_object(
    'authenticated', true,
    'memberships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'membership_id', m.id,
        'client_id',     m.client_id,
        'business_id',   m.business_id,
        'client_name',   c.name,
        'client_slug',   c.slug,
        'role',          m.role,
        -- Production Suite entitlement for THIS membership's business (default deny).
        'production_suite', EXISTS (
          SELECT 1 FROM public.business_entitlements be
          WHERE be.business_id = m.business_id
            AND be.capability = 'production_suite'
            AND be.active = true
            AND (be.expires_at IS NULL OR be.expires_at > now())
        )))
      FROM public.client_memberships m
      JOIN public.clients c ON c.id = m.client_id
      WHERE m.auth_user_id = v_uid AND m.status = 'active'
    ), '[]'::jsonb),
    'galleries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',         g.id,
        'client_id',  g.client_id,
        'name',       g.name,
        'slug',       g.slug,
        'status',     g.status,
        'event_date', g.event_date))
      FROM public.galleries g
      WHERE g.status = 'live'
        AND g.client_id IN (
          SELECT m.client_id FROM public.client_memberships m
          WHERE m.auth_user_id = v_uid AND m.status = 'active'
        )
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $$;


ALTER FUNCTION "public"."client_portal_bootstrap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clients_set_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INT := 1;
BEGIN
  IF NEW.slug IS NOT NULL AND length(trim(NEW.slug)) > 0 THEN
    NEW.slug := slugify(NEW.slug);
    IF NEW.slug IS NULL THEN
      NEW.slug := 'client-' || substr(NEW.id::text, 1, 6);
    END IF;
  ELSE
    NEW.slug := COALESCE(slugify(NEW.name), 'client-' || substr(NEW.id::text, 1, 6));
  END IF;
  base_slug := NEW.slug;
  candidate := base_slug;
  WHILE EXISTS (SELECT 1 FROM clients WHERE business_id = NEW.business_id AND slug = candidate AND id <> NEW.id) LOOP
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."clients_set_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpv2_accept_invitation"("p_token_hash" "text", "p_auth_user_id" "uuid", "p_email" "public"."citext") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv  public.client_invitations%ROWTYPE;
  v_mid  uuid;
BEGIN
  SELECT * INTO v_inv FROM public.client_invitations WHERE token_hash = p_token_hash;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  IF v_inv.expires_at <= now() THEN
    UPDATE public.client_invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'invitation_expired';
  END IF;
  IF lower(v_inv.email::text) <> lower(p_email::text) THEN
    RAISE EXCEPTION 'invitation_email_mismatch';
  END IF;

  UPDATE public.client_memberships
    SET status = 'active', auth_user_id = p_auth_user_id, accepted_at = now()
    WHERE id = v_inv.membership_id
    RETURNING id INTO v_mid;

  UPDATE public.client_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = v_inv.id;

  RETURN jsonb_build_object('membership_id', v_mid, 'client_id', v_inv.client_id,
                            'business_id', v_inv.business_id);
END $$;


ALTER FUNCTION "public"."cpv2_accept_invitation"("p_token_hash" "text", "p_auth_user_id" "uuid", "p_email" "public"."citext") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpv2_assign_gallery"("p_business_id" "uuid", "p_gallery_id" "uuid", "p_client_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_prev uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.galleries
                 WHERE id = p_gallery_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'gallery_not_in_business';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients
                 WHERE id = p_client_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'client_not_in_business';
  END IF;

  SELECT client_id INTO v_prev FROM public.galleries WHERE id = p_gallery_id;
  UPDATE public.galleries SET client_id = p_client_id WHERE id = p_gallery_id;

  RETURN jsonb_build_object('gallery_id', p_gallery_id, 'client_id', p_client_id,
                            'previous_client_id', v_prev);
END $$;


ALTER FUNCTION "public"."cpv2_assign_gallery"("p_business_id" "uuid", "p_gallery_id" "uuid", "p_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpv2_auth_user_id_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;


ALTER FUNCTION "public"."cpv2_auth_user_id_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpv2_owner_assignable_galleries"() RETURNS TABLE("gallery_id" "uuid", "name" "text", "slug" "text", "status" "text", "client_id" "uuid", "client_name" "text", "event_date" "date")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT g.id, g.name, g.slug, g.status::text, g.client_id, c.name, g.event_date
  FROM public.galleries g
  LEFT JOIN public.clients c ON c.id = g.client_id
  WHERE g.business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
  ORDER BY g.published_at DESC NULLS LAST, g.name;
$$;


ALTER FUNCTION "public"."cpv2_owner_assignable_galleries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpv2_owner_client_detail"("p_client_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_biz uuid;
BEGIN
  SELECT business_id INTO v_biz FROM public.clients WHERE id = p_client_id;
  IF v_biz IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = v_biz AND user_id = auth.uid()) THEN
    RETURN NULL;   -- not found or not owner → fail closed
  END IF;

  RETURN jsonb_build_object(
    'client', (SELECT to_jsonb(c) - 'access_code_hash' FROM public.clients c WHERE c.id = p_client_id),
    'galleries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'slug', g.slug,
        'status', g.status, 'event_date', g.event_date)
        ORDER BY g.published_at DESC NULLS LAST)
      FROM public.galleries g WHERE g.client_id = p_client_id), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'email', m.email, 'role', m.role, 'status', m.status,
        'invited_at', m.invited_at, 'accepted_at', m.accepted_at,
        'last_access_at', m.last_access_at)
        ORDER BY m.created_at)
      FROM public.client_memberships m WHERE m.client_id = p_client_id), '[]'::jsonb),
    'invitations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', i.email, 'status', i.status,
        'expires_at', i.expires_at, 'created_at', i.created_at,
        'resent_count', i.resent_count)
        ORDER BY i.created_at DESC)
      FROM public.client_invitations i WHERE i.client_id = p_client_id), '[]'::jsonb),
    'audit', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'action', a.action, 'actor_type', a.actor_type,
        'created_at', a.created_at, 'metadata', a.metadata)
        ORDER BY a.created_at DESC)
      FROM (SELECT * FROM public.client_access_audit
            WHERE client_id = p_client_id ORDER BY created_at DESC LIMIT 50) a), '[]'::jsonb)
  );
END $$;


ALTER FUNCTION "public"."cpv2_owner_client_detail"("p_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpv2_owner_clients_overview"() RETURNS TABLE("client_id" "uuid", "name" "text", "slug" "text", "gallery_count" bigint, "member_count" bigint, "active_member_count" bigint, "pending_invites" bigint, "last_access_at" timestamp with time zone, "has_legacy_pin" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    c.id, c.name, c.slug,
    (SELECT count(*) FROM public.galleries g WHERE g.client_id = c.id),
    (SELECT count(*) FROM public.client_memberships m WHERE m.client_id = c.id),
    (SELECT count(*) FROM public.client_memberships m WHERE m.client_id = c.id AND m.status = 'active'),
    (SELECT count(*) FROM public.client_invitations i WHERE i.client_id = c.id AND i.status = 'pending'),
    (SELECT max(m.last_access_at) FROM public.client_memberships m WHERE m.client_id = c.id),
    (c.access_code_hash IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.galleries g
                 WHERE g.client_id = c.id AND g.status = 'live'
                   AND coalesce(g.delivery_settings->>'clientCode','') <> '')
  FROM public.clients c
  WHERE c.business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
  ORDER BY c.name;
$$;


ALTER FUNCTION "public"."cpv2_owner_clients_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpv2_set_membership_status"("p_business_id" "uuid", "p_membership_id" "uuid", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_status NOT IN ('active','disabled','revoked') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.client_memberships
                 WHERE id = p_membership_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'membership_not_in_business';
  END IF;
  UPDATE public.client_memberships
    SET status = p_status
    WHERE id = p_membership_id AND business_id = p_business_id;
  RETURN jsonb_build_object('membership_id', p_membership_id, 'status', p_status);
END $$;


ALTER FUNCTION "public"."cpv2_set_membership_status"("p_business_id" "uuid", "p_membership_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpv2_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."cpv2_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpv2_unassign_gallery"("p_business_id" "uuid", "p_gallery_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_prev uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.galleries
                 WHERE id = p_gallery_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'gallery_not_in_business';
  END IF;
  SELECT client_id INTO v_prev FROM public.galleries WHERE id = p_gallery_id;
  UPDATE public.galleries SET client_id = NULL WHERE id = p_gallery_id;
  RETURN jsonb_build_object('gallery_id', p_gallery_id, 'previous_client_id', v_prev);
END $$;


ALTER FUNCTION "public"."cpv2_unassign_gallery"("p_business_id" "uuid", "p_gallery_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_business_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT id 
  FROM businesses 
  WHERE user_id = auth.uid() 
  LIMIT 1;
$$;


ALTER FUNCTION "public"."current_business_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debug_auth_state"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT jsonb_build_object(
    'auth_uid', auth.uid(),
    'auth_role', auth.role(),
    'current_business_id', current_business_id(),
    'jwt_claim_sub', current_setting('request.jwt.claim.sub', true),
    'jwt_claims', current_setting('request.jwt.claims', true)
  );
$$;


ALTER FUNCTION "public"."debug_auth_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."duplicate_gallery"("p_source_gallery_id" "uuid", "p_new_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_biz_id     uuid;
  v_owner_biz  uuid;
  v_new_name   text;
  v_new_id     uuid;
BEGIN
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

  SELECT business_id INTO v_owner_biz
    FROM public.galleries
   WHERE id = p_source_gallery_id;

  IF v_owner_biz IS NULL THEN
    RAISE EXCEPTION 'source_gallery_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner_biz <> v_biz_id THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

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
    0,
    0,
    0,
    false,
    'draft',
    0,
    0,
    0,
    0,
    false,
    false
    FROM public.galleries g
   WHERE g.id = p_source_gallery_id
  RETURNING id INTO v_new_id;

  -- The AFTER INSERT trigger `galleries_ensure_default_section` unconditionally
  -- inserts "סקשן 1" for every new gallery. We don't want it to coexist with
  -- the cloned sections, so we delete it before inserting the real clones.
  DELETE FROM public.gallery_sections
   WHERE gallery_id = v_new_id;

  INSERT INTO public.gallery_sections (gallery_id, name, sort_order, description)
  SELECT v_new_id, s.name, s.sort_order, s.description
    FROM public.gallery_sections s
   WHERE s.gallery_id = p_source_gallery_id
   ORDER BY s.sort_order;

  RETURN v_new_id;
END;
$$;


ALTER FUNCTION "public"."duplicate_gallery"("p_source_gallery_id" "uuid", "p_new_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."duplicate_gallery"("p_source_gallery_id" "uuid", "p_new_name" "text") IS 'Clones an existing gallery''s delivery_settings + typed columns + sections into a new draft owned by the same business. Does NOT copy images — each event has its own shoot, so the photographer uploads fresh photos into the cloned layout. Returns the new gallery id.';



CREATE OR REPLACE FUNCTION "public"."enforce_gallery_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  SELECT gallery_limit INTO v_limit FROM public.businesses WHERE id = NEW.business_id;
  IF v_limit IS NULL THEN
    RETURN NEW;  -- unlimited (grandfathered / paid)
  END IF;
  SELECT count(*) INTO v_count FROM public.galleries WHERE business_id = NEW.business_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'gallery_limit_reached'
      USING ERRCODE = 'check_violation',
            HINT = format('Free plan allows up to %s galleries.', v_limit);
  END IF;
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."enforce_gallery_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_default_section_for_gallery"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO gallery_sections (gallery_id, name, sort_order)
  VALUES (NEW.id, 'סקשן 1', 0);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_default_section_for_gallery"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_activity_summary"("p_gallery_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_business UUID;
  v_caller_business UUID;
  v_result JSONB;
BEGIN
  SELECT business_id INTO v_business FROM galleries WHERE id = p_gallery_id;
  SELECT id INTO v_caller_business FROM businesses WHERE user_id = auth.uid() LIMIT 1;
  IF v_business IS NULL OR v_caller_business IS NULL OR v_business <> v_caller_business THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT jsonb_build_object(
    'downloads_total',  (SELECT count(*) FROM gallery_download_log WHERE gallery_id = p_gallery_id),
    'favorites_total',  (SELECT count(*) FROM gallery_favorites    WHERE gallery_id = p_gallery_id),
    'emails_total',     (SELECT count(*) FROM gallery_email_log    WHERE gallery_id = p_gallery_id),
    'recent_downloads', COALESCE((
      SELECT jsonb_agg(d.*) FROM (
        SELECT id, image_id, resolution, download_kind, guest_email, guest_name, created_at
          FROM gallery_download_log
         WHERE gallery_id = p_gallery_id
         ORDER BY created_at DESC LIMIT 50
      ) d
    ), '[]'::jsonb),
    'downloaders', COALESCE((
      SELECT jsonb_agg(x.*) FROM (
        SELECT guest_email,
               max(guest_name)  FILTER (WHERE guest_name IS NOT NULL) AS guest_name,
               count(*)         AS downloads,
               max(created_at)  AS last_at
          FROM gallery_download_log
         WHERE gallery_id = p_gallery_id AND guest_email IS NOT NULL
         GROUP BY guest_email
         ORDER BY max(created_at) DESC LIMIT 100
      ) x
    ), '[]'::jsonb),
    'recent_favorites', COALESCE((
      SELECT jsonb_agg(f.*) FROM (
        SELECT id, image_id, guest_name, note, created_at
          FROM gallery_favorites
         WHERE gallery_id = p_gallery_id
         ORDER BY created_at DESC LIMIT 50
      ) f
    ), '[]'::jsonb),
    'recent_emails', COALESCE((
      SELECT jsonb_agg(e.*) FROM (
        SELECT id, recipient_email, subject, status, created_at
          FROM gallery_email_log
         WHERE gallery_id = p_gallery_id
         ORDER BY created_at DESC LIMIT 50
      ) e
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."gallery_activity_summary"("p_gallery_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_bootstrap"("p_business_slug" "text", "p_gallery_slug" "text", "p_token" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 300) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_gid   UUID;
  v_meta  JSONB;
  v_imgs  JSONB;
  v_secs  JSONB;
BEGIN
  SELECT g.id INTO v_gid
    FROM galleries g
    JOIN businesses b ON b.id = g.business_id
   WHERE lower(b.slug) = lower(p_business_slug)
     AND lower(g.slug) = lower(p_gallery_slug)
     AND (
       g.status = 'live'
       OR (auth.uid() IS NOT NULL AND b.user_id = auth.uid())  -- owner preview only
     )
   ORDER BY (g.status = 'live') DESC
   LIMIT 1;

  IF v_gid IS NULL THEN
    -- Uniform fail-closed response for unavailable (draft/non-owner) AND
    -- nonexistent slugs — the two are indistinguishable.
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_meta := gallery_get_meta(v_gid);

  -- Images: _gallery_authz gates (owner → all; live+no-pw → all; live+pw+token →
  -- all; live+pw+no-token → none). Withheld for a locked gallery until unlock.
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_imgs
    FROM (
      SELECT id, filename, web_preview_path, original_path, thumbnail_path,
             section_id, sort_order, width, height, is_top_pick,
             mime_type, original_uploaded, public_thumb_present
        FROM gallery_get_images(v_gid, p_token, p_limit, 0)
    ) t;

  -- Sections: the gallery is resolved (live, or the owner's own), so returning
  -- section labels here matches the existing status='live' RLS on the direct
  -- gallery_sections read the viewer also uses. Draft sections never reach a
  -- non-owner because such a gallery is never resolved above.
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
    'sections', v_secs,
    'locked', gallery_is_locked(v_gid)
  );
END
$$;


ALTER FUNCTION "public"."gallery_bootstrap"("p_business_slug" "text", "p_gallery_slug" "text", "p_token" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_cover_thumbs"("p_gallery_ids" "uuid"[]) RETURNS TABLE("gallery_id" "uuid", "thumbnail_path" "text", "web_preview_path" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT g.id, i.thumbnail_path, i.web_preview_path
  FROM unnest(p_gallery_ids) AS g(id)
  CROSS JOIN LATERAL (
    SELECT thumbnail_path, web_preview_path
    FROM images
    WHERE gallery_id = g.id
    ORDER BY sort_order
    LIMIT 1
  ) i
$$;


ALTER FUNCTION "public"."gallery_cover_thumbs"("p_gallery_ids" "uuid"[]) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."gallery_hidden_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "image_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gallery_hidden_images" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_get_hidden"("p_gallery_id" "uuid", "p_token" "uuid" DEFAULT NULL::"uuid") RETURNS SETOF "public"."gallery_hidden_images"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN RETURN; END IF;
  RETURN QUERY
    SELECT * FROM gallery_hidden_images WHERE gallery_id = p_gallery_id;
END;
$$;


ALTER FUNCTION "public"."gallery_get_hidden"("p_gallery_id" "uuid", "p_token" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "filename" "text",
    "web_preview_path" "text",
    "thumbnail_path" "text",
    "is_top_pick" boolean DEFAULT false,
    "sort_order" integer,
    "original_path" "text",
    "section_id" "uuid" NOT NULL,
    "face_indexed_at" timestamp with time zone,
    "face_count" integer,
    "original_uploaded" boolean DEFAULT false,
    "original_size_bytes" bigint,
    "thumbnail_uploaded" boolean DEFAULT false,
    "thumbnail_size_bytes" bigint,
    "web_preview_uploaded" boolean DEFAULT false,
    "web_preview_size_bytes" bigint,
    "original_upload_method" "text",
    "original_failed_reason" "text",
    "width" integer,
    "height" integer,
    "mime_type" "text",
    "upload_status" "text" DEFAULT 'pending'::"text",
    "preview_ready" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "face_index_attempts" integer DEFAULT 0 NOT NULL,
    "face_index_error" "text",
    "public_thumb_present" boolean DEFAULT false NOT NULL,
    CONSTRAINT "images_original_upload_method_check" CHECK (("original_upload_method" = ANY (ARRAY['standard'::"text", 'tus'::"text"]))),
    CONSTRAINT "images_upload_status_check" CHECK (("upload_status" = ANY (ARRAY['pending'::"text", 'generating_assets'::"text", 'uploading_thumbnail'::"text", 'uploading_preview'::"text", 'preview_ready'::"text", 'uploading_original'::"text", 'original_ready'::"text", 'original_failed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."images" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_get_images"("p_gallery_id" "uuid", "p_token" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 500, "p_offset" integer DEFAULT 0) RETURNS SETOF "public"."images"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."gallery_get_images"("p_gallery_id" "uuid", "p_token" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_get_meta"("p_gallery_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSONB; status_ TEXT; ds JSONB; logo TEXT; has_pw BOOLEAN;
  v_owner UUID; v_bk JSONB; v_brand JSONB := NULL;
BEGIN
  SELECT g.status, (g.password_hash IS NOT NULL), b.user_id
    INTO status_, has_pw, v_owner
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  -- Fail-closed: only a live gallery, or the authenticated owner's own gallery,
  -- may have its metadata read. Non-live to a non-owner → NULL (same as a
  -- nonexistent id). Closes the draft-metadata-by-id path.
  IF status_ IS NULL THEN RETURN NULL; END IF;
  IF status_ <> 'live' AND NOT (auth.uid() IS NOT NULL AND v_owner = auth.uid()) THEN
    RETURN NULL;
  END IF;

  SELECT (to_jsonb(g) - 'password_hash' - 'client_id') INTO result
    FROM galleries g WHERE g.id = p_gallery_id;

  ds := result -> 'delivery_settings';
  IF ds IS NULL OR jsonb_typeof(ds) <> 'object' THEN ds := '{}'::jsonb; END IF;
  ds := ds - 'password';
  logo := ds ->> 'logoUrl';
  IF logo IS NOT NULL AND (logo LIKE '/Users/%' OR logo LIKE '/home/%' OR logo LIKE '/var/%' OR logo ~ '^[A-Za-z]:\\') THEN
    ds := ds - 'logoUrl';
  END IF;

  SELECT b.brand_kit INTO v_bk
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  IF v_bk IS NOT NULL AND COALESCE((v_bk ->> 'apply_to_galleries')::boolean, false) THEN
    v_brand := jsonb_strip_nulls(jsonb_build_object(
      'accentHex',   v_bk -> 'colors'     ->> 'accent',
      'headingFont', v_bk -> 'typography' ->> 'heading_family',
      'bodyFont',    v_bk -> 'typography' ->> 'body_family',
      'logoUrl',     v_bk -> 'logo'       ->> 'url',
      'appearance',  v_bk ->> 'appearance'
    ));
  END IF;

  result := jsonb_set(result, '{delivery_settings}', ds)
            || jsonb_build_object('has_password', has_pw, 'brand', v_brand);
  RETURN result;
END
$$;


ALTER FUNCTION "public"."gallery_get_meta"("p_gallery_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_get_published_snapshot"("p_gallery_id" "uuid") RETURNS TABLE("revision_id" "uuid", "revision_index" integer, "settings" "jsonb", "section_data" "jsonb", "name" "text", "status" "public"."gallery_status", "access_type" "text", "event_date" "date", "event_type" "text", "event_location" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    r.id              AS revision_id,
    r.revision_index,
    r.settings,
    r.section_data,
    r.name,
    r.status,
    r.access_type,
    r.event_date,
    r.event_type,
    r.event_location,
    r.created_at
    FROM public.galleries g
    JOIN public.gallery_revisions r
      ON r.id = g.published_revision_id
   WHERE g.id = p_gallery_id
     AND g.published_revision_id IS NOT NULL
   LIMIT 1;
$$;


ALTER FUNCTION "public"."gallery_get_published_snapshot"("p_gallery_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "style" "text",
    "storage_path" "text",
    "duration" integer,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "section_id" "uuid"
);


ALTER TABLE "public"."stories" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_get_stories"("p_gallery_id" "uuid", "p_token" "uuid" DEFAULT NULL::"uuid") RETURNS SETOF "public"."stories"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN RETURN; END IF;
  RETURN QUERY
    SELECT * FROM stories WHERE gallery_id = p_gallery_id ORDER BY created_at ASC;
END;
$$;


ALTER FUNCTION "public"."gallery_get_stories"("p_gallery_id" "uuid", "p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_is_locked"("p_gallery_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  -- Paywall retired: a gallery is never locked by payment state. The argument
  -- is intentionally unused; the signature is preserved so callers
  -- (gallery_get_images, gallery_bootstrap) need no change.
  SELECT false;
$$;


ALTER FUNCTION "public"."gallery_is_locked"("p_gallery_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."gallery_is_locked"("p_gallery_id" "uuid") IS 'Retired one-time paywall gate (migration 104): always returns false so a gallery is never locked by payment state. Columns requires_payment / one_time_paid / paid_expires_at are retained for history but no longer gate.';



CREATE OR REPLACE FUNCTION "public"."gallery_publish"("p_gallery_id" "uuid", "p_publish_note" "text" DEFAULT NULL::"text") RETURNS TABLE("revision_id" "uuid", "revision_index" integer, "published_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_business_id      UUID;
  v_gallery_business UUID;
  v_settings         JSONB;
  v_section_data     JSONB;
  v_name             TEXT;
  v_status           public.gallery_status;
  v_access_type      TEXT;
  v_event_date       DATE;
  v_event_type       TEXT;
  v_event_location   TEXT;
  v_next_index       INT;
  v_revision_id      UUID;
  v_published_at     TIMESTAMPTZ := now();
BEGIN
  v_business_id := public.current_business_id();
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT g.business_id,
         COALESCE(g.delivery_settings, '{}'::jsonb),
         g.name, g.status, g.access_type, g.event_date, g.event_type, g.event_location
    INTO v_gallery_business, v_settings, v_name, v_status,
         v_access_type, v_event_date, v_event_type, v_event_location
    FROM public.galleries g
   WHERE g.id = p_gallery_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gallery_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_gallery_business <> v_business_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',          s.id,
               'name',        s.name,
               'slug',        s.slug,
               'sort_order',  s.sort_order,
               'description', s.description
             )
             ORDER BY s.sort_order, s.created_at
           ),
           '[]'::jsonb
         )
    INTO v_section_data
    FROM public.gallery_sections s
   WHERE s.gallery_id = p_gallery_id;

  SELECT COALESCE(MAX(r.revision_index), 0) + 1
    INTO v_next_index
    FROM public.gallery_revisions r
   WHERE r.gallery_id = p_gallery_id;

  INSERT INTO public.gallery_revisions (
    gallery_id, settings, section_data, name, status,
    access_type, event_date, event_type, event_location,
    revision_index, created_at, created_by, publish_note
  ) VALUES (
    p_gallery_id, v_settings, v_section_data, v_name, 'live'::public.gallery_status,
    v_access_type, v_event_date, v_event_type, v_event_location,
    v_next_index, v_published_at, auth.uid(), p_publish_note
  ) RETURNING id INTO v_revision_id;

  UPDATE public.galleries
     SET status = 'live'::public.gallery_status,
         published_at = v_published_at,
         published_revision_id = v_revision_id,
         updated_at = v_published_at
   WHERE id = p_gallery_id;

  revision_id    := v_revision_id;
  revision_index := v_next_index;
  published_at   := v_published_at;
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."gallery_publish"("p_gallery_id" "uuid", "p_publish_note" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."gallery_publish"("p_gallery_id" "uuid", "p_publish_note" "text") IS 'Phase 6 Step 5. Atomically snapshots a gallery into gallery_revisions then flips status=live + published_revision_id. Caller must own the gallery.';



CREATE OR REPLACE FUNCTION "public"."gallery_sections_set_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INT := 1;
BEGIN
  IF NEW.slug IS NOT NULL AND length(trim(NEW.slug)) > 0 THEN
    NEW.slug := slugify(NEW.slug);
    IF NEW.slug IS NULL THEN NEW.slug := 'section-' || substr(NEW.id::text, 1, 6); END IF;
  ELSE
    NEW.slug := COALESCE(slugify(NEW.name), 'section-' || substr(NEW.id::text, 1, 6));
  END IF;
  base_slug := NEW.slug;
  candidate := base_slug;
  WHILE EXISTS (SELECT 1 FROM gallery_sections WHERE gallery_id = NEW.gallery_id AND slug = candidate AND id <> NEW.id) LOOP
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."gallery_sections_set_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_set_hidden"("p_gallery_id" "uuid", "p_image_id" "uuid", "p_hidden" boolean, "p_token" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_hidden THEN
    INSERT INTO gallery_hidden_images (gallery_id, image_id)
    VALUES (p_gallery_id, p_image_id)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM gallery_hidden_images
     WHERE gallery_id = p_gallery_id AND image_id = p_image_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."gallery_set_hidden"("p_gallery_id" "uuid", "p_image_id" "uuid", "p_hidden" boolean, "p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gallery_token_is_valid"("p_gallery_id" "uuid", "p_token" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN _gallery_authz(p_gallery_id, p_token);
END;
$$;


ALTER FUNCTION "public"."gallery_token_is_valid"("p_gallery_id" "uuid", "p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_business_by_slug"("p_slug" "text") RETURNS TABLE("id" "uuid", "business_name" "text", "slug" "text", "logo_url" "text", "website_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$                                                                                                
    SELECT id, business_name, slug, logo_url, website_url       
    FROM businesses WHERE LOWER(slug) = LOWER(p_slug) LIMIT 1                                                                                                        
  $$;


ALTER FUNCTION "public"."get_business_by_slug"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_plan"() RETURNS TABLE("plan_id" "text", "name" "text", "max_galleries" integer, "max_photos_per_month" integer, "storage_limit_bytes" bigint, "watermark_enabled" boolean, "stories_enabled" boolean, "custom_branding_enabled" boolean, "custom_domain_enabled" boolean, "status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.name, p.max_galleries, p.max_photos_per_month, p.storage_limit_bytes,
         p.watermark_enabled, p.stories_enabled, p.custom_branding_enabled, p.custom_domain_enabled,
         s.status
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.business_id = current_business_id()
    AND s.status IN ('active', 'trial')
  LIMIT 1
$$;


ALTER FUNCTION "public"."get_my_plan"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_token_balance"() RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_business_id UUID;
  v_balance INTEGER;
BEGIN
  SELECT id INTO v_business_id FROM businesses WHERE user_id = auth.uid() LIMIT 1;
  IF v_business_id IS NULL THEN RETURN 0; END IF;
  SELECT balance INTO v_balance FROM business_tokens WHERE business_id = v_business_id;
  RETURN COALESCE(v_balance, 0);
END;
$$;


ALTER FUNCTION "public"."get_my_token_balance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_vendor_by_code"("p_code" "text") RETURNS TABLE("id" "uuid", "business_id" "uuid", "name" "text", "category" "text", "email" "text", "instagram" "text", "website" "text", "logo_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$                                                                                                
    SELECT id, business_id, name, category, email, instagram, website, logo_url
    FROM vendors WHERE UPPER(access_code) = UPPER(p_code) LIMIT 1                                                                                                    
  $$;


ALTER FUNCTION "public"."get_vendor_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_vendor_images"("p_code" "text") RETURNS TABLE("id" "uuid", "gallery_id" "uuid", "filename" "text", "storage_path" "text", "thumbnail_path" "text", "sort_order" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_vendor_images"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_business_entitlement"("p_business_id" "uuid", "p_capability" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_entitlements be
    WHERE be.business_id = p_business_id
      AND be.capability  = p_capability
      AND be.active      = true
      AND (be.expires_at IS NULL OR be.expires_at > now())
  );
$$;


ALTER FUNCTION "public"."has_business_entitlement"("p_business_id" "uuid", "p_capability" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."images_needing_derivative"("p_gallery_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 100) RETURNS TABLE("id" "uuid", "original_path" "text", "gallery_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select i.id, i.original_path, i.gallery_id
    from images i
    join galleries g on g.id = i.gallery_id
   where g.status = 'live'
     and (i.web_preview_path ~ '/originals/' or i.thumbnail_path ~ '/originals/')
     and (p_gallery_id is null or i.gallery_id = p_gallery_id)
   order by i.gallery_id, i.sort_order
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;


ALTER FUNCTION "public"."images_needing_derivative"("p_gallery_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_face_indexed_count"("p_gallery_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE galleries
     SET face_indexed_count = COALESCE(face_indexed_count, 0) + 1
   WHERE id = p_gallery_id
$$;


ALTER FUNCTION "public"."increment_face_indexed_count"("p_gallery_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_business_slug_taken"("p_slug" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$                                                     
    SELECT EXISTS (SELECT 1 FROM businesses WHERE LOWER(slug) = LOWER(p_slug))                                                                                                            
  $$;


ALTER FUNCTION "public"."is_business_slug_taken"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_public_gallery_session"("p_gallery_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_turnstile_validated" boolean) RETURNS TABLE("token" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status   TEXT;
  v_token    TEXT;
  v_expires  TIMESTAMPTZ;
  v_existing_token   TEXT;
  v_existing_expires TIMESTAMPTZ;
BEGIN
  SELECT g.status INTO v_status FROM galleries g WHERE g.id = p_gallery_id;
  IF v_status IS NULL OR v_status NOT IN ('live', 'published') THEN
    RAISE EXCEPTION 'gallery_not_live';
  END IF;

  SELECT s.token, s.expires_at
    INTO v_existing_token, v_existing_expires
    FROM public_gallery_sessions s
   WHERE s.gallery_id = p_gallery_id
     AND s.ip = p_ip
     AND s.expires_at > now() + interval '5 minutes'
   ORDER BY s.expires_at DESC
   LIMIT 1;
  IF v_existing_token IS NOT NULL THEN
    UPDATE public_gallery_sessions
       SET last_used_at = now(),
           refresh_count = public_gallery_sessions.refresh_count + 1,
           user_agent = COALESCE(p_user_agent, public_gallery_sessions.user_agent)
     WHERE public_gallery_sessions.token = v_existing_token;
    RETURN QUERY SELECT v_existing_token, v_existing_expires;
    RETURN;
  END IF;

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_expires := now() + interval '60 minutes';

  INSERT INTO public_gallery_sessions
    (token, gallery_id, expires_at, ip, user_agent, turnstile_validated)
  VALUES
    (v_token, p_gallery_id, v_expires, p_ip, p_user_agent, p_turnstile_validated);

  RETURN QUERY SELECT v_token, v_expires;
END;
$$;


ALTER FUNCTION "public"."issue_public_gallery_session"("p_gallery_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_turnstile_validated" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_gallery_paid"("p_business_id" "uuid", "p_gallery_id" "uuid", "p_ref_id" "uuid" DEFAULT NULL::"uuid", "p_months" integer DEFAULT 12, "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_owner UUID;
  v_existing_ref UUID;
BEGIN
  SELECT business_id, one_time_order_ref
    INTO v_owner, v_existing_ref
    FROM galleries WHERE id = p_gallery_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'gallery_not_found'; END IF;
  IF v_owner <> p_business_id THEN RAISE EXCEPTION 'gallery_business_mismatch'; END IF;

  IF p_ref_id IS NOT NULL AND v_existing_ref = p_ref_id THEN
    RETURN false;
  END IF;

  UPDATE galleries
     SET one_time_paid      = true,
         one_time_paid_at   = now(),
         paid_expires_at    = now() + make_interval(months => GREATEST(p_months, 1)),
         one_time_order_ref = COALESCE(p_ref_id, one_time_order_ref)
   WHERE id = p_gallery_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."mark_gallery_paid"("p_business_id" "uuid", "p_gallery_id" "uuid", "p_ref_id" "uuid", "p_months" integer, "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_business_entitlements"() RETURNS TABLE("capability" "text", "active" boolean, "expires_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT be.capability, be.active, be.expires_at
  FROM public.business_entitlements be
  JOIN public.businesses b ON b.id = be.business_id
  WHERE b.user_id = auth.uid()
    AND be.active = true
    AND (be.expires_at IS NULL OR be.expires_at > now());
$$;


ALTER FUNCTION "public"."my_business_entitlements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_expired_unlock_tokens"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  n INTEGER;
BEGIN
  WITH d AS (
    DELETE FROM gallery_unlock_tokens WHERE expires_at < now() RETURNING 1
  )
  SELECT count(*) INTO n FROM d;
  RETURN n;
END;
$$;


ALTER FUNCTION "public"."purge_expired_unlock_tokens"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reap_expired_public_gallery_sessions"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public_gallery_sessions
   WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


ALTER FUNCTION "public"."reap_expired_public_gallery_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_face_indexed_count"("p_gallery_id" "uuid") RETURNS integer
    LANGUAGE "sql"
    AS $$
  UPDATE galleries
     SET image_count = (
           SELECT count(*)::int FROM images
            WHERE gallery_id = p_gallery_id
         ),
         face_indexed_count = (
           SELECT count(*)::int FROM images
            WHERE gallery_id = p_gallery_id
              AND face_indexed_at IS NOT NULL
         )
   WHERE id = p_gallery_id
   RETURNING face_indexed_count;
$$;


ALTER FUNCTION "public"."recompute_face_indexed_count"("p_gallery_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_image_upload"("p_gallery_id" "uuid", "p_filename" "text", "p_web_preview_path" "text", "p_thumbnail_path" "text", "p_original_path" "text", "p_original_size" bigint DEFAULT NULL::bigint, "p_section_id" "uuid" DEFAULT NULL::"uuid", "p_sort_order" integer DEFAULT 0, "p_public_thumb_present" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_business_id UUID;
  v_owner_user  UUID;
  v_balance     INTEGER;
  v_image_id    UUID;
  v_section_id  UUID := p_section_id;
BEGIN
  SELECT g.business_id, b.user_id
    INTO v_business_id, v_owner_user
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'gallery_not_found';
  END IF;
  IF v_owner_user IS NULL OR v_owner_user <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_section_id IS NULL THEN
    SELECT s.id INTO v_section_id
      FROM gallery_sections s
     WHERE s.gallery_id = p_gallery_id
     ORDER BY s.sort_order, s.created_at, s.id
     LIMIT 1;
    IF v_section_id IS NULL THEN
      RAISE EXCEPTION 'no_section_for_gallery';
    END IF;
  END IF;

  UPDATE business_tokens
     SET balance           = balance - 1,
         lifetime_consumed = lifetime_consumed + 1,
         updated_at        = now()
   WHERE business_id = v_business_id AND balance > 0
   RETURNING balance INTO v_balance;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient_tokens';
  END IF;

  INSERT INTO images (
    gallery_id, filename,
    web_preview_path, thumbnail_path, original_path,
    original_uploaded, original_size_bytes,
    section_id, sort_order, is_top_pick,
    public_thumb_present
  ) VALUES (
    p_gallery_id, p_filename,
    p_web_preview_path, p_thumbnail_path, p_original_path,
    p_original_path IS NOT NULL, p_original_size,
    v_section_id, COALESCE(p_sort_order, 0), false,
    COALESCE(p_public_thumb_present, false)
  )
  RETURNING id INTO v_image_id;

  INSERT INTO token_ledger (business_id, delta, reason, ref_id, metadata)
  VALUES (v_business_id, -1, 'image_upload', v_image_id,
          jsonb_build_object('gallery_id', p_gallery_id, 'filename', p_filename));

  UPDATE galleries SET image_count = COALESCE(image_count, 0) + 1
   WHERE id = p_gallery_id;

  RETURN v_image_id;
END;
$$;


ALTER FUNCTION "public"."record_image_upload"("p_gallery_id" "uuid", "p_filename" "text", "p_web_preview_path" "text", "p_thumbnail_path" "text", "p_original_path" "text", "p_original_size" bigint, "p_section_id" "uuid", "p_sort_order" integer, "p_public_thumb_present" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_images"("p_gallery_id" "uuid", "p_ids" "uuid"[], "p_orders" integer[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_business_id UUID;
  v_owner_id    UUID;
  v_updated     INT;
BEGIN
  IF p_ids IS NULL OR p_orders IS NULL OR array_length(p_ids, 1) IS DISTINCT FROM array_length(p_orders, 1) THEN
    RAISE NOTICE 'reorder_images: length mismatch (ids=%, orders=%)',
      coalesce(array_length(p_ids, 1), 0),
      coalesce(array_length(p_orders, 1), 0);
    RETURN 0;
  END IF;

  IF array_length(p_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  v_business_id := public.current_business_id();
  IF v_business_id IS NULL THEN
    RAISE NOTICE 'reorder_images: no current_business_id (unauthenticated?)';
    RETURN 0;
  END IF;

  SELECT g.business_id INTO v_owner_id
  FROM   public.galleries g
  WHERE  g.id = p_gallery_id;

  IF v_owner_id IS NULL OR v_owner_id <> v_business_id THEN
    RAISE NOTICE 'reorder_images: gallery % not owned by business %',
      p_gallery_id, v_business_id;
    RETURN 0;
  END IF;

  WITH pairs AS (
    SELECT * FROM unnest(p_ids, p_orders) AS u(id, new_order)
  )
  UPDATE public.images i
  SET    sort_order = pairs.new_order
  FROM   pairs
  WHERE  i.id = pairs.id
    AND  i.gallery_id = p_gallery_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;


ALTER FUNCTION "public"."reorder_images"("p_gallery_id" "uuid", "p_ids" "uuid"[], "p_orders" integer[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reorder_images"("p_gallery_id" "uuid", "p_ids" "uuid"[], "p_orders" integer[]) IS 'Batched image reorder. Returns rows updated. Caller compares to expected to detect partial failure. Owner-gated via current_business_id() + gallery business_id check.';



CREATE OR REPLACE FUNCTION "public"."replace_image"("p_gallery_id" "uuid", "p_image_id" "uuid", "p_web_preview_path" "text", "p_thumbnail_path" "text", "p_original_path" "text", "p_filename" "text", "p_original_size" bigint DEFAULT NULL::bigint, "p_mime_type" "text" DEFAULT NULL::"text", "p_width" integer DEFAULT NULL::integer, "p_height" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."replace_image"("p_gallery_id" "uuid", "p_image_id" "uuid", "p_web_preview_path" "text", "p_thumbnail_path" "text", "p_original_path" "text", "p_filename" "text", "p_original_size" bigint, "p_mime_type" "text", "p_width" integer, "p_height" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_subscription_tokens"("p_business_id" "uuid", "p_count" integer, "p_ref_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_old_balance INTEGER;
  v_delta       INTEGER;
BEGIN
  IF p_count < 0 THEN RAISE EXCEPTION 'count must be >= 0'; END IF;

  IF p_ref_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM token_ledger
     WHERE business_id = p_business_id
       AND ref_id = p_ref_id
       AND reason = 'subscription_reset'
  ) THEN
    SELECT balance INTO v_old_balance FROM business_tokens WHERE business_id = p_business_id;
    RETURN COALESCE(v_old_balance, 0);
  END IF;

  SELECT balance INTO v_old_balance FROM business_tokens WHERE business_id = p_business_id;
  v_old_balance := COALESCE(v_old_balance, 0);
  v_delta := p_count - v_old_balance;

  INSERT INTO business_tokens (business_id, balance, lifetime_purchased)
  VALUES (p_business_id, p_count, GREATEST(v_delta, 0))
  ON CONFLICT (business_id) DO UPDATE
     SET balance            = p_count,
         lifetime_purchased = business_tokens.lifetime_purchased + GREATEST(v_delta, 0),
         updated_at         = now();

  INSERT INTO token_ledger (business_id, delta, reason, ref_id, metadata)
  VALUES (p_business_id, v_delta, 'subscription_reset', p_ref_id,
          COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('reset_to', p_count));

  RETURN p_count;
END;
$$;


ALTER FUNCTION "public"."reset_subscription_tokens"("p_business_id" "uuid", "p_count" integer, "p_ref_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_client_portal"("p_business_slug" "text", "p_client_slug" "text") RETURNS TABLE("business_id" "uuid", "client_id" "uuid", "business_name" "text", "business_slug" "text", "client_slug" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH input AS (
    -- Trim + lower-case; reject null/empty/oversized slugs (fail closed → no rows).
    SELECT
      lower(btrim(p_business_slug)) AS b_slug,
      lower(btrim(p_client_slug))   AS c_slug
    WHERE p_business_slug IS NOT NULL
      AND p_client_slug   IS NOT NULL
      AND btrim(p_business_slug) <> ''
      AND btrim(p_client_slug)   <> ''
      AND length(p_business_slug) <= 200
      AND length(p_client_slug)   <= 200
  )
  SELECT
    b.id            AS business_id,
    c.id            AS client_id,
    b.business_name AS business_name,
    b.slug          AS business_slug,
    c.slug          AS client_slug
  FROM input i
  JOIN public.businesses b
    ON lower(b.slug) = i.b_slug
  JOIN public.clients c
    ON c.business_id = b.id
   AND lower(c.slug) = i.c_slug
  -- MEMBERSHIP GATE: only if the current caller actively belongs to this client.
  JOIN public.client_memberships m
    ON m.client_id = c.id
   AND m.auth_user_id = (SELECT auth.uid())
   AND m.status = 'active'
$$;


ALTER FUNCTION "public"."resolve_client_portal"("p_business_slug" "text", "p_client_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_client_portal_by_id"("p_client_id" "uuid") RETURNS TABLE("business_slug" "text", "client_slug" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    b.slug AS business_slug,
    c.slug AS client_slug
  FROM public.clients c
  JOIN public.businesses b
    ON b.id = c.business_id
  -- SAME membership gate: caller must actively belong to this client.
  JOIN public.client_memberships m
    ON m.client_id = c.id
   AND m.auth_user_id = (SELECT auth.uid())
   AND m.status = 'active'
  WHERE p_client_id IS NOT NULL
    AND c.id = p_client_id
$$;


ALTER FUNCTION "public"."resolve_client_portal_by_id"("p_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_owner_content"("p_query" "text", "p_filters" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_business_id uuid;
  v_q           text;
  v_pattern     text := NULL;   -- NULL → no text matching (filter-only browse)

  f_client_id         uuid;
  f_status            text;
  f_assigned          boolean;
  f_event_type        text;
  f_event_size_bucket text;
  f_industry          text;
  f_venue_type        text;
  f_time_of_day       text;
  f_year_from         int;
  f_year_to           int;
  f_keywords          text[];
  f_imported_source   text;

  v_clients   jsonb := '[]'::jsonb;
  v_galleries jsonb := '[]'::jsonb;
  v_images    jsonb := '[]'::jsonb;
BEGIN
  -- Tenant resolution. Fail CLOSED: no business → empty structure, not error.
  SELECT id INTO v_business_id
  FROM public.businesses
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RETURN jsonb_build_object(
      'clients', '[]'::jsonb, 'galleries', '[]'::jsonb, 'images', '[]'::jsonb);
  END IF;

  -- Query normalization: trim; escape ILIKE wildcards so 'a_b' matches
  -- literally. Hebrew and English both work: ILIKE is byte-order-agnostic
  -- substring matching over UTF-8 text.
  v_q := btrim(coalesce(p_query, ''));
  IF char_length(v_q) >= 1 THEN
    v_pattern := '%' ||
      replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  -- Filter extraction. Every value is validated; anything malformed is
  -- silently dropped (treated as "filter not set").
  p_filters := coalesce(p_filters, '{}'::jsonb);

  IF (p_filters->>'client_id') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    f_client_id := (p_filters->>'client_id')::uuid;
  END IF;

  IF p_filters->>'status' IN ('live', 'draft') THEN
    f_status := p_filters->>'status';
  END IF;

  IF jsonb_typeof(p_filters->'assigned') = 'boolean' THEN
    f_assigned := (p_filters->>'assigned')::boolean;
  END IF;

  f_event_type := left(nullif(btrim(coalesce(p_filters->>'event_type', '')), ''), 60);
  f_industry   := left(nullif(btrim(coalesce(p_filters->>'industry',   '')), ''), 60);

  IF p_filters->>'event_size_bucket' IN
     ('intimate', 'small', 'medium', 'large', 'massive') THEN
    f_event_size_bucket := p_filters->>'event_size_bucket';
  END IF;

  IF p_filters->>'venue_type' IN ('indoor', 'outdoor', 'mixed') THEN
    f_venue_type := p_filters->>'venue_type';
  END IF;

  IF p_filters->>'time_of_day' IN ('day', 'night', 'mixed') THEN
    f_time_of_day := p_filters->>'time_of_day';
  END IF;

  IF (p_filters->>'year_from') ~ '^\d{4}$' THEN
    f_year_from := (p_filters->>'year_from')::int;
  END IF;

  IF (p_filters->>'year_to') ~ '^\d{4}$' THEN
    f_year_to := (p_filters->>'year_to')::int;
  END IF;

  IF jsonb_typeof(p_filters->'keywords') = 'array' THEN
    SELECT array_agg(DISTINCT btrim(x)) INTO f_keywords
    FROM jsonb_array_elements_text(p_filters->'keywords') AS t(x)
    WHERE btrim(x) <> '';
  END IF;

  f_imported_source := left(nullif(btrim(coalesce(p_filters->>'imported_source', '')), ''), 40);

  -- ── Galleries: text match (when query present) AND every set filter.
  --    Empty query = filter-only browse over the same predicate set.
  SELECT coalesce(jsonb_agg(sub.row_j
           ORDER BY sub.ord_date DESC NULLS LAST, sub.ord_name), '[]'::jsonb)
  INTO v_galleries
  FROM (
    SELECT
      jsonb_build_object(
        'id',                g.id,
        'name',              g.name,
        'slug',              g.slug,
        'status',            g.status::text,
        'client_id',         g.client_id,
        'client_name',       coalesce(c.name, g.client_name),
        'event_date',        g.event_date,
        'event_type',        g.event_type,
        'event_location',    g.event_location,
        'event_size_bucket', g.event_size_bucket,
        'industry',          g.industry,
        'image_count',       g.image_count,
        'match_reason',      coalesce(to_jsonb(array_remove(ARRAY[
            CASE WHEN v_pattern IS NOT NULL AND g.name ILIKE v_pattern
                 THEN 'name' END,
            CASE WHEN v_pattern IS NOT NULL
                  AND coalesce(c.name, g.client_name) ILIKE v_pattern
                 THEN 'client_name' END,
            CASE WHEN v_pattern IS NOT NULL AND g.event_location ILIKE v_pattern
                 THEN 'event_location' END,
            CASE WHEN v_pattern IS NOT NULL AND g.event_type ILIKE v_pattern
                 THEN 'event_type' END
          ]::text[], NULL)), '[]'::jsonb)
      ) AS row_j,
      g.event_date AS ord_date,
      g.name       AS ord_name
    FROM public.galleries g
    LEFT JOIN public.clients c ON c.id = g.client_id
    WHERE g.business_id = v_business_id
      AND (v_pattern IS NULL OR (
               g.name ILIKE v_pattern
            OR coalesce(c.name, g.client_name) ILIKE v_pattern
            OR g.event_location ILIKE v_pattern
            OR g.event_type ILIKE v_pattern))
      AND (f_client_id IS NULL         OR g.client_id = f_client_id)
      AND (f_status IS NULL            OR g.status::text = f_status)
      AND (f_assigned IS NULL
           OR (f_assigned     AND g.client_id IS NOT NULL)
           OR (NOT f_assigned AND g.client_id IS NULL))
      AND (f_event_type IS NULL        OR g.event_type ILIKE f_event_type)
      AND (f_event_size_bucket IS NULL OR g.event_size_bucket = f_event_size_bucket)
      AND (f_industry IS NULL          OR g.industry ILIKE ('%' || f_industry || '%'))
      AND (f_venue_type IS NULL        OR g.venue_type = f_venue_type)
      AND (f_time_of_day IS NULL       OR g.time_of_day = f_time_of_day)
      AND (f_year_from IS NULL
           OR (g.event_date IS NOT NULL AND extract(year FROM g.event_date) >= f_year_from))
      AND (f_year_to IS NULL
           OR (g.event_date IS NOT NULL AND extract(year FROM g.event_date) <= f_year_to))
      AND (f_keywords IS NULL          OR g.event_keywords && f_keywords)
      AND (f_imported_source IS NULL
           OR g.delivery_settings->'importSource'->>'provider' = f_imported_source)
    ORDER BY g.event_date DESC NULLS LAST, g.name
    LIMIT 200
  ) sub;

  -- ── Clients + images: only meaningful with a text query.
  IF v_pattern IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id',           s.id,
             'name',         s.name,
             'slug',         s.slug,
             'match_reason', jsonb_build_array('name'))
             ORDER BY s.name), '[]'::jsonb)
    INTO v_clients
    FROM (
      SELECT c.id, c.name, c.slug
      FROM public.clients c
      WHERE c.business_id = v_business_id
        AND c.name ILIKE v_pattern
      ORDER BY c.name
      LIMIT 50
    ) s;

    -- Images: filename match, joined through the caller's galleries (never
    -- cross-tenant), same gallery filters applied, hard cap 60 rows,
    -- thumbnail path only (never original/full collection loads).
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id',             s.id,
             'gallery_id',     s.gallery_id,
             'gallery_name',   s.gallery_name,
             'filename',       s.filename,
             'thumbnail_path', s.thumbnail_path,
             'match_reason',   jsonb_build_array('filename'))), '[]'::jsonb)
    INTO v_images
    FROM (
      SELECT i.id, i.gallery_id, g.name AS gallery_name, i.filename,
             coalesce(i.thumbnail_path, i.web_preview_path) AS thumbnail_path
      FROM public.images i
      JOIN public.galleries g ON g.id = i.gallery_id
      WHERE g.business_id = v_business_id
        AND i.filename ILIKE v_pattern
        AND (f_client_id IS NULL         OR g.client_id = f_client_id)
        AND (f_status IS NULL            OR g.status::text = f_status)
        AND (f_assigned IS NULL
             OR (f_assigned     AND g.client_id IS NOT NULL)
             OR (NOT f_assigned AND g.client_id IS NULL))
        AND (f_event_type IS NULL        OR g.event_type ILIKE f_event_type)
        AND (f_event_size_bucket IS NULL OR g.event_size_bucket = f_event_size_bucket)
        AND (f_industry IS NULL          OR g.industry ILIKE ('%' || f_industry || '%'))
        AND (f_venue_type IS NULL        OR g.venue_type = f_venue_type)
        AND (f_time_of_day IS NULL       OR g.time_of_day = f_time_of_day)
        AND (f_year_from IS NULL
             OR (g.event_date IS NOT NULL AND extract(year FROM g.event_date) >= f_year_from))
        AND (f_year_to IS NULL
             OR (g.event_date IS NOT NULL AND extract(year FROM g.event_date) <= f_year_to))
        AND (f_keywords IS NULL          OR g.event_keywords && f_keywords)
        AND (f_imported_source IS NULL
             OR g.delivery_settings->'importSource'->>'provider' = f_imported_source)
      ORDER BY g.name, i.sort_order, i.filename
      LIMIT 60
    ) s;
  END IF;

  RETURN jsonb_build_object(
    'clients',   v_clients,
    'galleries', v_galleries,
    'images',    v_images);
END $_$;


ALTER FUNCTION "public"."search_owner_content"("p_query" "text", "p_filters" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_owner_content"("p_query" "text", "p_filters" "jsonb") IS 'Owner-side global search (CPV2). Self-scoped via auth.uid() -> businesses; ILIKE metadata matching over clients/galleries/images with jsonb filters. Fails closed to an empty result when the caller has no business.';



CREATE OR REPLACE FUNCTION "public"."set_business_custom_domain"("p_domain" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_uid UUID := auth.uid();
  v_biz_id UUID;
  v_domain TEXT;
  v_token TEXT;
  v_plan_allows BOOLEAN;
  v_taken BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT id INTO v_biz_id
  FROM businesses
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_biz_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_business');
  END IF;

  v_domain := lower(trim(coalesce(p_domain, '')));

  IF v_domain = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_domain');
  END IF;

  IF v_domain = 'pixflow-ai.com' OR v_domain LIKE '%.pixflow-ai.com' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reserved_domain');
  END IF;

  IF v_domain !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_format');
  END IF;

  SELECT COALESCE(p.custom_domain_enabled, false)
    INTO v_plan_allows
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.business_id = v_biz_id
    AND s.status IN ('active', 'trial')
  LIMIT 1;

  IF NOT COALESCE(v_plan_allows, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'plan_not_eligible');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM businesses
    WHERE custom_domain = v_domain
      AND id <> v_biz_id
  ) INTO v_taken;

  IF v_taken THEN
    RETURN jsonb_build_object('ok', false, 'error', 'domain_taken');
  END IF;

  v_token := encode(gen_random_bytes(16), 'hex');

  UPDATE businesses
     SET custom_domain = v_domain,
         custom_domain_status = 'pending_dns',
         custom_domain_verification_token = v_token,
         custom_domain_added_at = COALESCE(custom_domain_added_at, now()),
         custom_domain_verified_at = NULL
   WHERE id = v_biz_id;

  RETURN jsonb_build_object(
    'ok', true,
    'domain', v_domain,
    'verification_token', v_token,
    'dns_record', jsonb_build_object(
      'type', 'TXT',
      'name', '_pixflow-verify.' || v_domain,
      'value', v_token
    )
  );
END;
$_$;


ALTER FUNCTION "public"."set_business_custom_domain"("p_domain" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_client_access_code"("p_client_id" "uuid", "p_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_code IS NULL OR length(p_code) < 4 THEN
    RAISE EXCEPTION 'access code must be at least 4 characters';
  END IF;
  UPDATE clients
    SET access_code_hash = crypt(p_code, gen_salt('bf', 8)),
        access_code_set_at = now()
    WHERE id = p_client_id;
END
$$;


ALTER FUNCTION "public"."set_client_access_code"("p_client_id" "uuid", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_gallery_password"("p_gallery_id" "uuid", "p_password" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  owner_business UUID;
  caller_business UUID;
BEGIN
  SELECT business_id INTO owner_business FROM galleries WHERE id = p_gallery_id;
  IF owner_business IS NULL THEN
    RAISE EXCEPTION 'Gallery not found';
  END IF;
  SELECT id INTO caller_business FROM businesses WHERE user_id = auth.uid() LIMIT 1;
  IF caller_business IS NULL OR caller_business <> owner_business THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_password IS NULL OR length(p_password) = 0 THEN
    UPDATE galleries SET password_hash = NULL WHERE id = p_gallery_id;
  ELSE
    UPDATE galleries
       SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10))
     WHERE id = p_gallery_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."set_gallery_password"("p_gallery_id" "uuid", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_gallery_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare base_slug text; candidate text; n int := 1;
begin
  if NEW.slug is null or length(trim(NEW.slug)) = 0 then
    base_slug := coalesce(slugify(NEW.name), 'g-' || substr(NEW.id::text, 1, 8));
  else
    base_slug := coalesce(slugify(NEW.slug), 'g-' || substr(NEW.id::text, 1, 8));
  end if;
  candidate := base_slug;
  while exists (select 1 from galleries where business_id = NEW.business_id and slug = candidate and id <> NEW.id) loop
    candidate := base_slug || '-' || n;
    n := n + 1;
  end loop;
  NEW.slug := candidate;
  return NEW;
end $$;


ALTER FUNCTION "public"."set_gallery_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slugify"("input" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
DECLARE s TEXT;
BEGIN
  IF input IS NULL OR length(trim(input)) = 0 THEN RETURN NULL; END IF;
  s := lower(trim(input));
  s := translate(s, 'אבגדהוזחטיכךלמםנןסעפףצץקרשת'' ', 'avgdhvzhtikkkmnnsapptzkrst-_');
  s := regexp_replace(s, '[\s/_\.,]+', '-', 'g');
  s := regexp_replace(s, '[^a-z0-9-]', '', 'g');
  s := regexp_replace(s, '-+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  IF s = '' THEN RETURN NULL; END IF;
  RETURN s;
END
$_$;


ALTER FUNCTION "public"."slugify"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."story_renders_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."story_renders_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sweep_stalled_face_indexing"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  g record;
  -- Public anon key (safe to embed). index_kick is gated to only resume
  -- genuinely-stalled indexing, so anon auth is sufficient.
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZseWlxZmF3a3JqdnFjbWtwZnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NzksImV4cCI6MjA5MDU2NDc3OX0.ionfOl71NrBO-0iBVBAu6oiTUzkJuIu-drEkY1cmsFY';
begin
  for g in
    select id from public.galleries
    where face_index_status = 'indexing'
      and (face_indexed_at is null or face_indexed_at < now() - interval '75 seconds')
  loop
    perform net.http_post(
      url     := 'https://vlyiqfawkrjvqcmkpfvs.supabase.co/functions/v1/rekognition',
      body    := jsonb_build_object('action', 'index_kick', 'galleryId', g.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'apikey', v_anon
      )
    );
  end loop;
end;
$$;


ALTER FUNCTION "public"."sweep_stalled_face_indexing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_claim_face_indexing"("p_gallery_id" "uuid", "p_staleness_sec" integer DEFAULT 600) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE galleries
     SET face_index_status = 'indexing',
         face_indexed_at   = now(),
         face_index_error  = NULL
   WHERE id = p_gallery_id
     AND (
       -- Not currently indexing
       face_index_status IS DISTINCT FROM 'indexing'
       -- Or indexing flag is stale (e.g., previous worker crashed)
       OR face_indexed_at IS NULL
       OR face_indexed_at < now() - make_interval(secs => p_staleness_sec)
     );
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."try_claim_face_indexing"("p_gallery_id" "uuid", "p_staleness_sec" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_gallery_settings"("p_gallery_id" "uuid", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
    RETURN jsonb_build_object('ok',false,'errors',jsonb_build_array(
      jsonb_build_object('key','_auth','error','not_authenticated')));
  END IF;
  IF p_gallery_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'errors',jsonb_build_array(
      jsonb_build_object('key','_gallery_id','error','missing')));
  END IF;
  v_biz_id := public.current_business_id();
  IF v_biz_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'errors',jsonb_build_array(
      jsonb_build_object('key','_business','error','no_business')));
  END IF;
  SELECT business_id, delivery_settings INTO v_owner_biz, v_prev
    FROM public.galleries WHERE id = p_gallery_id;
  IF v_owner_biz IS NULL THEN
    RETURN jsonb_build_object('ok',false,'errors',jsonb_build_array(
      jsonb_build_object('key','_gallery','error','not_found')));
  END IF;
  IF v_owner_biz <> v_biz_id THEN
    RETURN jsonb_build_object('ok',false,'errors',jsonb_build_array(
      jsonb_build_object('key','_gallery','error','not_owner')));
  END IF;
  v_errors := public._validate_delivery_settings_patch(p_patch);
  IF v_errors IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'errors',v_errors);
  END IF;
  UPDATE public.galleries
     SET delivery_settings = COALESCE(delivery_settings,'{}'::jsonb) || p_patch,
         event_date = CASE
           WHEN p_patch ? 'eventDate' THEN
             CASE WHEN NULLIF(p_patch ->> 'eventDate','') IS NULL THEN NULL
                  ELSE (p_patch ->> 'eventDate')::date END
           ELSE event_date END,
         event_type = CASE
           WHEN p_patch ? 'eventType' THEN NULLIF(p_patch ->> 'eventType','')
           ELSE event_type END,
         event_location = CASE
           WHEN p_patch ? 'eventLocation' THEN NULLIF(p_patch ->> 'eventLocation','')
           ELSE event_location END,
         access_type = CASE
           WHEN p_patch ? 'accessType' THEN COALESCE(NULLIF(p_patch ->> 'accessType',''),'public')
           ELSE access_type END
   WHERE id = p_gallery_id
   RETURNING delivery_settings INTO v_new;
  INSERT INTO public.gallery_settings_audit (gallery_id, user_id, patch, prev_settings)
  VALUES (p_gallery_id, v_uid, p_patch, v_prev);
  RETURN jsonb_build_object('ok',true,'delivery_settings',v_new);
END;
$$;


ALTER FUNCTION "public"."update_gallery_settings"("p_gallery_id" "uuid", "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_client_code"("p_client_id" "uuid", "p_code" "text", "p_ip" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS TABLE("token" "text", "expires_at" timestamp with time zone, "cooldown_until" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_hash             TEXT;
  v_recent_failures  INT;
  v_cooldown_until   TIMESTAMPTZ;
  v_token            TEXT;
  v_expires          TIMESTAMPTZ;
BEGIN
  SELECT COUNT(*) INTO v_recent_failures
  FROM client_code_attempts
  WHERE client_id = p_client_id AND success = false
    AND attempted_at > now() - interval '15 minutes';

  IF v_recent_failures >= 5 THEN
    SELECT max(attempted_at) + interval '15 minutes' INTO v_cooldown_until
    FROM client_code_attempts
    WHERE client_id = p_client_id AND success = false
      AND attempted_at > now() - interval '15 minutes';
    INSERT INTO client_code_attempts (client_id, ip, success) VALUES (p_client_id, p_ip, false);
    RETURN QUERY SELECT NULL::TEXT, NULL::TIMESTAMPTZ, v_cooldown_until;
    RETURN;
  END IF;

  SELECT access_code_hash INTO v_hash FROM clients WHERE id = p_client_id;
  IF v_hash IS NULL THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_hash = crypt(p_code, v_hash) THEN
    v_token   := encode(gen_random_bytes(24), 'base64');
    v_token   := translate(v_token, '+/=', '-_');
    v_expires := now() + interval '30 days';
    INSERT INTO client_session_tokens (token, client_id, expires_at, user_agent, ip)
      VALUES (v_token, p_client_id, v_expires, p_user_agent, p_ip);
    INSERT INTO client_code_attempts (client_id, ip, success) VALUES (p_client_id, p_ip, true);
    RETURN QUERY SELECT v_token, v_expires, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  INSERT INTO client_code_attempts (client_id, ip, success) VALUES (p_client_id, p_ip, false);
  RETURN QUERY SELECT NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
END
$$;


ALTER FUNCTION "public"."verify_client_code"("p_client_id" "uuid", "p_code" "text", "p_ip" "inet", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_client_token"("p_token" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_client_id UUID;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN NULL; END IF;
  SELECT client_id INTO v_client_id
  FROM client_session_tokens
  WHERE token = p_token AND expires_at > now();
  IF v_client_id IS NULL THEN RETURN NULL; END IF;
  UPDATE client_session_tokens SET last_used_at = now() WHERE token = p_token;
  RETURN v_client_id;
END
$$;


ALTER FUNCTION "public"."verify_client_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_gallery_password"("p_gallery_id" "uuid", "p_password" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  stored_hash    text;
  gallery_status text;
  attempt_row    gallery_password_attempts%rowtype;
  is_match       boolean;
  free_attempts  constant integer := 5;
  cooldown_sec   constant integer := 10;
  remaining      integer;
  v_token        uuid;
  v_expires      timestamptz;
begin
  if p_password is null or length(p_password) = 0 then
    return jsonb_build_object('ok', false);
  end if;

  select password_hash, status into stored_hash, gallery_status
    from galleries where id = p_gallery_id;
  if stored_hash is null or gallery_status <> 'live' then
    return jsonb_build_object('ok', false);
  end if;

  select * into attempt_row from gallery_password_attempts
    where gallery_id = p_gallery_id for update;
  if found and attempt_row.failed_count >= free_attempts then
    remaining := cooldown_sec - extract(epoch from (now() - attempt_row.last_attempt))::integer;
    if remaining > 0 then
      return jsonb_build_object('ok', false, 'retry_after_seconds', remaining);
    end if;
  end if;

  is_match := extensions.crypt(p_password, stored_hash) = stored_hash;

  if is_match then
    delete from gallery_password_attempts where gallery_id = p_gallery_id;
    v_expires := now() + interval '4 hours';
    insert into gallery_unlock_tokens (gallery_id, expires_at)
    values (p_gallery_id, v_expires)
    returning token into v_token;
    return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_expires);
  end if;

  insert into gallery_password_attempts (gallery_id, failed_count, last_attempt)
       values (p_gallery_id, 1, now())
  on conflict (gallery_id) do update
     set failed_count = gallery_password_attempts.failed_count + 1,
         last_attempt = now()
  returning * into attempt_row;
  if attempt_row.failed_count >= free_attempts then
    return jsonb_build_object('ok', false, 'retry_after_seconds', cooldown_sec);
  end if;
  return jsonb_build_object('ok', false);
end;
$$;


ALTER FUNCTION "public"."verify_gallery_password"("p_gallery_id" "uuid", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_public_gallery_session"("p_token" "text", "p_gallery_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_match BOOLEAN;
BEGIN
  IF p_token IS NULL OR p_token = '' OR p_gallery_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT (s.gallery_id = p_gallery_id AND s.expires_at > now())
    INTO v_match
    FROM public_gallery_sessions s
   WHERE s.token = p_token;

  IF v_match THEN
    UPDATE public_gallery_sessions
       SET last_used_at = now()
     WHERE public_gallery_sessions.token = p_token;
  END IF;

  RETURN COALESCE(v_match, false);
END;
$$;


ALTER FUNCTION "public"."verify_public_gallery_session"("p_token" "text", "p_gallery_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_entitlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "capability" "text" NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_entitlements_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'plan'::"text", 'grant'::"text"])))
);


ALTER TABLE "public"."business_entitlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_tokens" (
    "business_id" "uuid" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "lifetime_purchased" integer DEFAULT 0 NOT NULL,
    "lifetime_consumed" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_tokens_balance_check" CHECK (("balance" >= 0))
);


ALTER TABLE "public"."business_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "logo_url" "text",
    "website_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "custom_domain" "text",
    "custom_domain_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "custom_domain_verification_token" "text",
    "custom_domain_added_at" timestamp with time zone,
    "custom_domain_verified_at" timestamp with time zone,
    "brand_kit" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "gallery_limit" integer DEFAULT 3,
    CONSTRAINT "businesses_custom_domain_status_check" CHECK (("custom_domain_status" = ANY (ARRAY['unverified'::"text", 'pending_dns'::"text", 'verified'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."businesses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."businesses"."brand_kit" IS 'Central Brand Kit document. Shape: { schema_version:int, logo:{url,dark_url,square_url}, colors:{primary,secondary,accent,ink,paper}, typography:{heading_family,body_family}, voice:{tagline,signature,language}, watermark:{enabled,source,text,position,opacity_percent,scale_percent,contrast_aware}, social:{instagram,facebook,tiktok,twitter,website} }. See migration 072_business_brand_kit.sql for the full schema.';



CREATE TABLE IF NOT EXISTS "public"."client_access_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "actor_type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "target_type" "text",
    "target_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_access_audit_action_check" CHECK (("action" = ANY (ARRAY['client_created'::"text", 'invitation_sent'::"text", 'invitation_resent'::"text", 'invitation_accepted'::"text", 'invitation_cancelled'::"text", 'membership_disabled'::"text", 'membership_reactivated'::"text", 'membership_revoked'::"text", 'gallery_assigned'::"text", 'gallery_unassigned'::"text", 'gallery_reassigned'::"text", 'portal_access'::"text", 'password_reset_requested'::"text", 'production_access_denied'::"text", 'gallery_metadata_updated'::"text", 'import_job_created'::"text", 'import_job_started'::"text", 'import_job_completed'::"text", 'import_job_cancelled'::"text", 'import_collection_imported'::"text", 'tour_completed'::"text"]))),
    CONSTRAINT "client_access_audit_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['owner'::"text", 'client'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."client_access_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_code_attempts" (
    "id" bigint NOT NULL,
    "client_id" "uuid" NOT NULL,
    "ip" "inet",
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "success" boolean NOT NULL
);


ALTER TABLE "public"."client_code_attempts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."client_code_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."client_code_attempts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."client_code_attempts_id_seq" OWNED BY "public"."client_code_attempts"."id";



CREATE TABLE IF NOT EXISTS "public"."client_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "membership_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "email" "public"."citext" NOT NULL,
    "token_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "resent_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    CONSTRAINT "client_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."client_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "auth_user_id" "uuid",
    "email" "public"."citext" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "status" "text" DEFAULT 'invited'::"text" NOT NULL,
    "invited_by" "uuid",
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "last_access_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_memberships_role_check" CHECK (("role" = ANY (ARRAY['client_admin'::"text", 'approver'::"text", 'viewer'::"text"]))),
    CONSTRAINT "client_memberships_status_check" CHECK (("status" = ANY (ARRAY['invited'::"text", 'active'::"text", 'disabled'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."client_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_page_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "headline" "text" DEFAULT ''::"text",
    "description" "text" DEFAULT ''::"text",
    "featured_gallery_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "hidden_gallery_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "extra_pick_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "custom_logo_url" "text",
    "custom_accent_color" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."client_page_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_session_tokens" (
    "token" "text" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "last_used_at" timestamp with time zone,
    "user_agent" "text",
    "ip" "inet"
);


ALTER TABLE "public"."client_session_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "photographer_id" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "business_id" "uuid" NOT NULL,
    "local_id" "text",
    "slug" "text" NOT NULL,
    "access_code_hash" "text",
    "access_code_set_at" timestamp with time zone
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text",
    "whatsapp_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "whatsapp_message_id" "text",
    "whatsapp_error" "text",
    "retry_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_leads_whatsapp_status_check" CHECK (("whatsapp_status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."event_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "gallery_id" "uuid",
    "name" "text" NOT NULL,
    "gallery_url" "text" NOT NULL,
    "welcome_text" "text" DEFAULT 'קבלו את הגלריה שלכם ישירות לוואטסאפ'::"text",
    "logo_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."face_search_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "selfie_hash" "text" NOT NULL,
    "matches" "jsonb" NOT NULL,
    "image_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."face_search_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feed_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "source_gallery_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "style" "text" DEFAULT 'color_block_editorial'::"text" NOT NULL,
    "posts" "jsonb" NOT NULL,
    "brand_snapshot" "jsonb",
    "llm_trace" "jsonb",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "generated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    CONSTRAINT "feed_plans_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'accepted'::"text", 'rejected'::"text", 'published'::"text"]))),
    CONSTRAINT "feed_plans_style_check" CHECK (("style" = ANY (ARRAY['color_block_editorial'::"text", 'editorial_magazine'::"text", 'sandwich'::"text", 'pop_collage'::"text", 'billboard'::"text"])))
);


ALTER TABLE "public"."feed_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."galleries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "client_id" "uuid",
    "status" "public"."gallery_status" DEFAULT 'draft'::"public"."gallery_status" NOT NULL,
    "public_url" "text",
    "delivery_settings" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "published_at" timestamp without time zone,
    "client_name" "text",
    "image_count" integer DEFAULT 0,
    "local_id" "text",
    "business_id" "uuid" NOT NULL,
    "project_slug" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "demo_expires_at" timestamp with time zone,
    "demo_ip_hash" "text",
    "face_index_enabled" boolean DEFAULT false,
    "face_index_status" "text",
    "rekognition_collection_id" "text",
    "face_indexed_count" integer DEFAULT 0,
    "face_index_error" "text",
    "face_indexed_at" timestamp with time zone,
    "slug" "text",
    "preview_ready" boolean DEFAULT false,
    "originals_ready" boolean DEFAULT false,
    "publish_status" "text" DEFAULT 'draft'::"text",
    "total_images" integer DEFAULT 0,
    "preview_uploaded_count" integer DEFAULT 0,
    "original_uploaded_count" integer DEFAULT 0,
    "original_failed_count" integer DEFAULT 0,
    "last_upload_resume_at" timestamp with time zone,
    "password_hash" "text",
    "signed_gate_enabled" boolean DEFAULT false NOT NULL,
    "download_count" integer DEFAULT 0 NOT NULL,
    "favorite_count" integer DEFAULT 0 NOT NULL,
    "last_publish_error" "text",
    "event_date" "date",
    "event_type" "text",
    "event_location" "text",
    "access_type" "text" DEFAULT 'public'::"text" NOT NULL,
    "client_code_hash" "text",
    "published_revision_id" "uuid",
    "one_time_paid" boolean DEFAULT false NOT NULL,
    "one_time_paid_at" timestamp with time zone,
    "paid_expires_at" timestamp with time zone,
    "one_time_order_ref" "uuid",
    "requires_payment" boolean DEFAULT false NOT NULL,
    "event_size_bucket" "text",
    "industry" "text",
    "venue_type" "text",
    "time_of_day" "text",
    "event_keywords" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "galleries_access_type_check" CHECK (("access_type" = ANY (ARRAY['public'::"text", 'password'::"text", 'code'::"text"]))),
    CONSTRAINT "galleries_event_keywords_cap_check" CHECK ((COALESCE("array_length"("event_keywords", 1), 0) <= 20)),
    CONSTRAINT "galleries_event_location_len_check" CHECK ((("event_location" IS NULL) OR ("char_length"("event_location") <= 120))),
    CONSTRAINT "galleries_event_size_bucket_check" CHECK ((("event_size_bucket" IS NULL) OR ("event_size_bucket" = ANY (ARRAY['intimate'::"text", 'small'::"text", 'medium'::"text", 'large'::"text", 'massive'::"text"])))),
    CONSTRAINT "galleries_event_type_len_check" CHECK ((("event_type" IS NULL) OR ("char_length"("event_type") <= 60))),
    CONSTRAINT "galleries_face_index_status_check" CHECK (("face_index_status" = ANY (ARRAY['pending'::"text", 'indexing'::"text", 'done'::"text", 'failed'::"text"]))),
    CONSTRAINT "galleries_industry_len_check" CHECK ((("industry" IS NULL) OR ("char_length"("industry") <= 60))),
    CONSTRAINT "galleries_publish_status_check" CHECK (("publish_status" = ANY (ARRAY['draft'::"text", 'preparing_assets'::"text", 'uploading_previews'::"text", 'preview_live'::"text", 'uploading_originals'::"text", 'fully_live'::"text", 'partially_failed'::"text", 'failed'::"text"]))),
    CONSTRAINT "galleries_time_of_day_check" CHECK ((("time_of_day" IS NULL) OR ("time_of_day" = ANY (ARRAY['day'::"text", 'night'::"text", 'mixed'::"text"])))),
    CONSTRAINT "galleries_venue_type_check" CHECK ((("venue_type" IS NULL) OR ("venue_type" = ANY (ARRAY['indoor'::"text", 'outdoor'::"text", 'mixed'::"text"]))))
);


ALTER TABLE "public"."galleries" OWNER TO "postgres";


COMMENT ON COLUMN "public"."galleries"."published_revision_id" IS 'Pointer to the most-recently published snapshot. NULL = never published.';



CREATE TABLE IF NOT EXISTS "public"."gallery_download_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "image_id" "uuid",
    "resolution" "text" NOT NULL,
    "download_kind" "text" NOT NULL,
    "ip_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "guest_email" "text",
    "guest_name" "text",
    CONSTRAINT "gallery_download_log_download_kind_check" CHECK (("download_kind" = ANY (ARRAY['single'::"text", 'batch'::"text"]))),
    CONSTRAINT "gallery_download_log_resolution_check" CHECK (("resolution" = ANY (ARRAY['original'::"text", 'web'::"text", 'thumbnail'::"text"])))
);


ALTER TABLE "public"."gallery_download_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_email_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "subject" "text",
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "provider_id" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gallery_email_log_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."gallery_email_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "image_id" "uuid" NOT NULL,
    "guest_name" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gallery_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_password_attempts" (
    "gallery_id" "uuid" NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "last_attempt" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gallery_password_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gallery_presets_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 80)))
);


ALTER TABLE "public"."gallery_presets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "settings" "jsonb" NOT NULL,
    "section_data" "jsonb" NOT NULL,
    "name" "text" NOT NULL,
    "status" "public"."gallery_status" NOT NULL,
    "access_type" "text",
    "event_date" "date",
    "event_type" "text",
    "event_location" "text",
    "revision_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "publish_note" "text",
    CONSTRAINT "gallery_revisions_revision_index_pos" CHECK (("revision_index" >= 1))
);


ALTER TABLE "public"."gallery_revisions" OWNER TO "postgres";


COMMENT ON TABLE "public"."gallery_revisions" IS 'Immutable snapshots of gallery state captured at publish time. The owner edits the live row; gallery_publish() freezes current state into a revision and points galleries.published_revision_id at it. Public viewer cutover is a separate, feature-flagged sprint.';



CREATE TABLE IF NOT EXISTS "public"."gallery_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "slug" "text",
    "description" "text",
    CONSTRAINT "gallery_sections_description_length" CHECK ((("description" IS NULL) OR ("char_length"("description") <= 500)))
);


ALTER TABLE "public"."gallery_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_settings_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "patch" "jsonb" NOT NULL,
    "prev_settings" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gallery_settings_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_unlock_tokens" (
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gallery_unlock_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."image_ai_scores" (
    "image_id" "uuid" NOT NULL,
    "hero_score" numeric(3,1) NOT NULL,
    "carousel_score" numeric(3,1) NOT NULL,
    "story_score" numeric(3,1) NOT NULL,
    "atmosphere_score" numeric(3,1) NOT NULL,
    "people_density" numeric(3,1) NOT NULL,
    "brand_fit" numeric(3,1) NOT NULL,
    "social_potential" numeric(3,1) NOT NULL,
    "suggested_usage" "text" NOT NULL,
    "suggested_crop_focal_x" numeric(3,2) DEFAULT 0.5 NOT NULL,
    "suggested_crop_focal_y" numeric(3,2) DEFAULT 0.5 NOT NULL,
    "rationale_he" "text" NOT NULL,
    "scored_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scored_by_model" "text" DEFAULT 'claude-sonnet-4-6'::"text" NOT NULL,
    CONSTRAINT "image_ai_scores_atmosphere_score_check" CHECK ((("atmosphere_score" >= (0)::numeric) AND ("atmosphere_score" <= (10)::numeric))),
    CONSTRAINT "image_ai_scores_brand_fit_check" CHECK ((("brand_fit" >= (0)::numeric) AND ("brand_fit" <= (10)::numeric))),
    CONSTRAINT "image_ai_scores_carousel_score_check" CHECK ((("carousel_score" >= (0)::numeric) AND ("carousel_score" <= (10)::numeric))),
    CONSTRAINT "image_ai_scores_hero_score_check" CHECK ((("hero_score" >= (0)::numeric) AND ("hero_score" <= (10)::numeric))),
    CONSTRAINT "image_ai_scores_people_density_check" CHECK ((("people_density" >= (0)::numeric) AND ("people_density" <= (10)::numeric))),
    CONSTRAINT "image_ai_scores_social_potential_check" CHECK ((("social_potential" >= (0)::numeric) AND ("social_potential" <= (10)::numeric))),
    CONSTRAINT "image_ai_scores_story_score_check" CHECK ((("story_score" >= (0)::numeric) AND ("story_score" <= (10)::numeric))),
    CONSTRAINT "image_ai_scores_suggested_crop_focal_x_check" CHECK ((("suggested_crop_focal_x" >= (0)::numeric) AND ("suggested_crop_focal_x" <= (1)::numeric))),
    CONSTRAINT "image_ai_scores_suggested_crop_focal_y_check" CHECK ((("suggested_crop_focal_y" >= (0)::numeric) AND ("suggested_crop_focal_y" <= (1)::numeric))),
    CONSTRAINT "image_ai_scores_suggested_usage_check" CHECK (("suggested_usage" = ANY (ARRAY['hero'::"text", 'support'::"text", 'carousel_anchor'::"text", 'story_only'::"text", 'background'::"text", 'ignore'::"text"])))
);


ALTER TABLE "public"."image_ai_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."image_faces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "image_id" "uuid" NOT NULL,
    "rekognition_face_id" "text" NOT NULL,
    "confidence" real,
    "bounding_box" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."image_faces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."image_vendor_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "image_id" "uuid" NOT NULL,
    "vendor_id" "uuid" NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."image_vendor_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "source_name" "text" NOT NULL,
    "source_url" "text",
    "matched_client_id" "uuid",
    "client_match_status" "text" DEFAULT 'unmatched'::"text" NOT NULL,
    "target_gallery_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "stats" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "import_collections_client_match_status_check" CHECK (("client_match_status" = ANY (ARRAY['matched'::"text", 'ambiguous'::"text", 'unmatched'::"text", 'create_new'::"text", 'skip'::"text"]))),
    CONSTRAINT "import_collections_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'importing'::"text", 'imported'::"text", 'skipped'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."import_collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "collection_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "size_bytes" bigint,
    "content_hash" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "import_files_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'uploaded'::"text", 'skipped_duplicate'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."import_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "source_id" "uuid",
    "kind" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "totals" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error" "text",
    "checkpoint" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    CONSTRAINT "import_jobs_kind_check" CHECK (("kind" = ANY (ARRAY['metadata_csv'::"text", 'photos_zip'::"text"]))),
    CONSTRAINT "import_jobs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'dry_run'::"text", 'ready'::"text", 'running'::"text", 'paused'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."import_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "import_sources_provider_check" CHECK (("provider" = ANY (ARRAY['pixieset'::"text", 'generic_csv'::"text", 'local_folder'::"text"])))
);


ALTER TABLE "public"."import_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "surface" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "step" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_progress_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "onboarding_progress_step_check" CHECK (("step" >= 0)),
    CONSTRAINT "onboarding_progress_surface_check" CHECK ((("char_length"("surface") >= 1) AND ("char_length"("surface") <= 60))),
    CONSTRAINT "onboarding_progress_version_check" CHECK (("version" >= 1))
);


ALTER TABLE "public"."onboarding_progress" OWNER TO "postgres";


COMMENT ON TABLE "public"."onboarding_progress" IS 'Per-user progress of guided surfaces (owner_tour, owner_checklist, portal_welcome). Self-only RLS; one row per (user, surface, version).';



CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price_monthly_cents" integer DEFAULT 0 NOT NULL,
    "price_annual_cents" integer DEFAULT 0 NOT NULL,
    "max_galleries" integer,
    "max_photos_per_month" integer,
    "storage_limit_bytes" bigint,
    "watermark_enabled" boolean DEFAULT true NOT NULL,
    "stories_enabled" boolean DEFAULT false NOT NULL,
    "custom_branding_enabled" boolean DEFAULT false NOT NULL,
    "custom_domain_enabled" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "token_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_gallery_sessions" (
    "token" "text" NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip" "inet" NOT NULL,
    "user_agent" "text",
    "turnstile_validated" boolean DEFAULT false NOT NULL,
    "refresh_count" smallint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."public_gallery_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questionnaire_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "questionnaire_id" "uuid" NOT NULL,
    "respondent_name" "text" NOT NULL,
    "respondent_phone" "text",
    "respondent_email" "text",
    "answers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."questionnaire_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questionnaires" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "gallery_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "questions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "background_url" "text",
    "send_method" "text" DEFAULT 'none'::"text" NOT NULL,
    "bg_animation" "text",
    "slug" "text",
    CONSTRAINT "questionnaires_send_method_check" CHECK (("send_method" = ANY (ARRAY['none'::"text", 'email'::"text", 'sms'::"text"])))
);


ALTER TABLE "public"."questionnaires" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rekognition_search_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "ip_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rekognition_search_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_renders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "style" "text" NOT NULL,
    "photo_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "lambda_render_id" "text",
    "error_message" "text",
    "output_path" "text",
    "requested_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scene_plan" "jsonb",
    "title" "text",
    "draft_updated_at" timestamp with time zone,
    CONSTRAINT "story_renders_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'rendering'::"text", 'ready'::"text", 'failed'::"text", 'draft'::"text"])))
);


ALTER TABLE "public"."story_renders" OWNER TO "postgres";


COMMENT ON TABLE "public"."story_renders" IS 'Phase 2: tracks Remotion Lambda renders kicked off by /api/stories/render. One in-flight row per (gallery, style) enforced by partial UNIQUE.';



CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "plan_id" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "billing_cycle" "text" DEFAULT 'monthly'::"text",
    "provider" "text",
    "provider_customer_id" "text",
    "provider_subscription_id" "text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscriptions_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'annual'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'past_due'::"text", 'canceled'::"text", 'trial'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tender_collection_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "collection_id" "uuid" NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "image_id" "uuid",
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tender_collection_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tender_collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "brief" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tender_collections_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 120)))
);


ALTER TABLE "public"."tender_collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."token_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "delta" integer NOT NULL,
    "reason" "text" NOT NULL,
    "ref_id" "uuid",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "token_ledger_reason_check" CHECK (("reason" = ANY (ARRAY['signup_grant'::"text", 'purchase'::"text", 'image_upload'::"text", 'refund'::"text", 'chargeback'::"text", 'admin_grant'::"text", 'admin_deduct'::"text", 'subscription_reset'::"text"])))
);


ALTER TABLE "public"."token_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT ''::"text",
    "email" "text" DEFAULT ''::"text",
    "instagram" "text" DEFAULT ''::"text",
    "website" "text" DEFAULT ''::"text",
    "logo_url" "text",
    "access_code" "text" DEFAULT "upper"("substr"("md5"(("random"())::"text"), 1, 6)) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vendors" OWNER TO "postgres";


ALTER TABLE ONLY "public"."client_code_attempts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."client_code_attempts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."business_entitlements"
    ADD CONSTRAINT "business_entitlements_business_id_capability_key" UNIQUE ("business_id", "capability");



ALTER TABLE ONLY "public"."business_entitlements"
    ADD CONSTRAINT "business_entitlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_tokens"
    ADD CONSTRAINT "business_tokens_pkey" PRIMARY KEY ("business_id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."client_access_audit"
    ADD CONSTRAINT "client_access_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_code_attempts"
    ADD CONSTRAINT "client_code_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_invitations"
    ADD CONSTRAINT "client_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_memberships"
    ADD CONSTRAINT "client_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_page_settings"
    ADD CONSTRAINT "client_page_settings_client_id_key" UNIQUE ("client_id");



ALTER TABLE ONLY "public"."client_page_settings"
    ADD CONSTRAINT "client_page_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_session_tokens"
    ADD CONSTRAINT "client_session_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_leads"
    ADD CONSTRAINT "event_leads_event_id_phone_key" UNIQUE ("event_id", "phone");



ALTER TABLE ONLY "public"."event_leads"
    ADD CONSTRAINT "event_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."face_search_cache"
    ADD CONSTRAINT "face_search_cache_gallery_id_selfie_hash_key" UNIQUE ("gallery_id", "selfie_hash");



ALTER TABLE ONLY "public"."face_search_cache"
    ADD CONSTRAINT "face_search_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feed_plans"
    ADD CONSTRAINT "feed_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_download_log"
    ADD CONSTRAINT "gallery_download_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_email_log"
    ADD CONSTRAINT "gallery_email_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_favorites"
    ADD CONSTRAINT "gallery_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_hidden_images"
    ADD CONSTRAINT "gallery_hidden_images_gallery_id_image_id_key" UNIQUE ("gallery_id", "image_id");



ALTER TABLE ONLY "public"."gallery_hidden_images"
    ADD CONSTRAINT "gallery_hidden_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_password_attempts"
    ADD CONSTRAINT "gallery_password_attempts_pkey" PRIMARY KEY ("gallery_id");



ALTER TABLE ONLY "public"."gallery_presets"
    ADD CONSTRAINT "gallery_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_revisions"
    ADD CONSTRAINT "gallery_revisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_revisions"
    ADD CONSTRAINT "gallery_revisions_unique_per_gallery" UNIQUE ("gallery_id", "revision_index");



ALTER TABLE ONLY "public"."gallery_sections"
    ADD CONSTRAINT "gallery_sections_gallery_slug_unique" UNIQUE ("gallery_id", "slug");



ALTER TABLE ONLY "public"."gallery_sections"
    ADD CONSTRAINT "gallery_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_settings_audit"
    ADD CONSTRAINT "gallery_settings_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_unlock_tokens"
    ADD CONSTRAINT "gallery_unlock_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."image_ai_scores"
    ADD CONSTRAINT "image_ai_scores_pkey" PRIMARY KEY ("image_id");



ALTER TABLE ONLY "public"."image_faces"
    ADD CONSTRAINT "image_faces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."image_faces"
    ADD CONSTRAINT "image_faces_rekognition_face_id_key" UNIQUE ("rekognition_face_id");



ALTER TABLE ONLY "public"."image_vendor_tags"
    ADD CONSTRAINT "image_vendor_tags_image_id_vendor_id_key" UNIQUE ("image_id", "vendor_id");



ALTER TABLE ONLY "public"."image_vendor_tags"
    ADD CONSTRAINT "image_vendor_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."images"
    ADD CONSTRAINT "images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_collections"
    ADD CONSTRAINT "import_collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_files"
    ADD CONSTRAINT "import_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_jobs"
    ADD CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_sources"
    ADD CONSTRAINT "import_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_gallery_sessions"
    ADD CONSTRAINT "public_gallery_sessions_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."questionnaire_responses"
    ADD CONSTRAINT "questionnaire_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questionnaires"
    ADD CONSTRAINT "questionnaires_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questionnaires"
    ADD CONSTRAINT "questionnaires_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."rekognition_search_log"
    ADD CONSTRAINT "rekognition_search_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stories"
    ADD CONSTRAINT "stories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_renders"
    ADD CONSTRAINT "story_renders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tender_collection_items"
    ADD CONSTRAINT "tender_collection_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tender_collections"
    ADD CONSTRAINT "tender_collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."token_ledger"
    ADD CONSTRAINT "token_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



CREATE INDEX "businesses_brand_kit_gin" ON "public"."businesses" USING "gin" ("brand_kit" "jsonb_path_ops");



CREATE UNIQUE INDEX "businesses_custom_domain_unique" ON "public"."businesses" USING "btree" ("custom_domain") WHERE ("custom_domain" IS NOT NULL);



CREATE UNIQUE INDEX "businesses_slug_idx" ON "public"."businesses" USING "btree" ("slug");



CREATE UNIQUE INDEX "businesses_slug_lower_unique" ON "public"."businesses" USING "btree" ("lower"("slug"));



CREATE UNIQUE INDEX "businesses_user_id_idx" ON "public"."businesses" USING "btree" ("user_id");



CREATE INDEX "client_code_attempts_client_idx" ON "public"."client_code_attempts" USING "btree" ("client_id", "attempted_at" DESC);



CREATE INDEX "client_session_tokens_client_id_idx" ON "public"."client_session_tokens" USING "btree" ("client_id");



CREATE INDEX "client_session_tokens_expires_at_idx" ON "public"."client_session_tokens" USING "btree" ("expires_at");



CREATE INDEX "clients_business_id_idx" ON "public"."clients" USING "btree" ("business_id");



CREATE INDEX "clients_business_local_id_idx" ON "public"."clients" USING "btree" ("business_id", "local_id");



CREATE UNIQUE INDEX "clients_business_slug_idx" ON "public"."clients" USING "btree" ("business_id", "slug");



CREATE INDEX "clients_name_trgm_idx" ON "public"."clients" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "face_search_cache_gc" ON "public"."face_search_cache" USING "btree" ("created_at");



CREATE INDEX "face_search_cache_lookup" ON "public"."face_search_cache" USING "btree" ("gallery_id", "selfie_hash", "created_at" DESC);



CREATE INDEX "feed_plans_business_idx" ON "public"."feed_plans" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "feed_plans_client_idx" ON "public"."feed_plans" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "galleries_business_id_idx" ON "public"."galleries" USING "btree" ("business_id");



CREATE INDEX "galleries_business_local_id_idx" ON "public"."galleries" USING "btree" ("business_id", "local_id");



CREATE UNIQUE INDEX "galleries_business_slug_idx" ON "public"."galleries" USING "btree" ("business_id", "project_slug") WHERE ("project_slug" IS NOT NULL);



CREATE INDEX "galleries_event_date_idx" ON "public"."galleries" USING "btree" ("event_date") WHERE ("event_date" IS NOT NULL);



CREATE INDEX "galleries_event_keywords_gin_idx" ON "public"."galleries" USING "gin" ("event_keywords");



CREATE INDEX "galleries_event_size_bucket_idx" ON "public"."galleries" USING "btree" ("event_size_bucket") WHERE ("event_size_bucket" IS NOT NULL);



CREATE INDEX "galleries_event_type_filter_idx" ON "public"."galleries" USING "btree" ("event_type") WHERE ("event_type" IS NOT NULL);



CREATE INDEX "galleries_industry_idx" ON "public"."galleries" USING "btree" ("industry") WHERE ("industry" IS NOT NULL);



CREATE INDEX "galleries_name_trgm_idx" ON "public"."galleries" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "galleries_published_revision_id_idx" ON "public"."galleries" USING "btree" ("published_revision_id") WHERE ("published_revision_id" IS NOT NULL);



CREATE INDEX "galleries_status_live_idx" ON "public"."galleries" USING "btree" ("status") WHERE ("status" = 'live'::"public"."gallery_status");



CREATE INDEX "galleries_time_of_day_idx" ON "public"."galleries" USING "btree" ("time_of_day") WHERE ("time_of_day" IS NOT NULL);



CREATE INDEX "galleries_venue_type_idx" ON "public"."galleries" USING "btree" ("venue_type") WHERE ("venue_type" IS NOT NULL);



CREATE INDEX "gallery_download_log_email_idx" ON "public"."gallery_download_log" USING "btree" ("gallery_id", "guest_email") WHERE ("guest_email" IS NOT NULL);



CREATE INDEX "gallery_download_log_gallery_idx" ON "public"."gallery_download_log" USING "btree" ("gallery_id", "created_at" DESC);



CREATE INDEX "gallery_email_log_gallery_idx" ON "public"."gallery_email_log" USING "btree" ("gallery_id", "created_at" DESC);



CREATE INDEX "gallery_favorites_gallery_idx" ON "public"."gallery_favorites" USING "btree" ("gallery_id", "created_at" DESC);



CREATE UNIQUE INDEX "gallery_favorites_unique_anon_safe" ON "public"."gallery_favorites" USING "btree" ("gallery_id", "image_id", COALESCE("guest_name", '__anon__'::"text"));



CREATE INDEX "gallery_hidden_images_gallery_idx" ON "public"."gallery_hidden_images" USING "btree" ("gallery_id");



CREATE INDEX "gallery_presets_business_idx" ON "public"."gallery_presets" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "gallery_revisions_gallery_id_revision_index_idx" ON "public"."gallery_revisions" USING "btree" ("gallery_id", "revision_index" DESC);



CREATE INDEX "gallery_sections_gallery_id_idx" ON "public"."gallery_sections" USING "btree" ("gallery_id");



CREATE INDEX "gallery_sections_gallery_order_idx" ON "public"."gallery_sections" USING "btree" ("gallery_id", "sort_order");



CREATE INDEX "gallery_settings_audit_gallery_idx" ON "public"."gallery_settings_audit" USING "btree" ("gallery_id", "created_at" DESC);



CREATE INDEX "gallery_unlock_tokens_expires_idx" ON "public"."gallery_unlock_tokens" USING "btree" ("expires_at");



CREATE INDEX "gallery_unlock_tokens_gallery_idx" ON "public"."gallery_unlock_tokens" USING "btree" ("gallery_id");



CREATE INDEX "idx_event_leads_event_id" ON "public"."event_leads" USING "btree" ("event_id");



CREATE INDEX "idx_event_leads_failed" ON "public"."event_leads" USING "btree" ("whatsapp_status", "retry_count") WHERE (("whatsapp_status" = 'failed'::"text") AND ("retry_count" < 3));



CREATE INDEX "idx_events_business_id" ON "public"."events" USING "btree" ("business_id");



CREATE UNIQUE INDEX "idx_galleries_business_slug" ON "public"."galleries" USING "btree" ("business_id", "slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "idx_qr_questionnaire_id" ON "public"."questionnaire_responses" USING "btree" ("questionnaire_id");



CREATE INDEX "idx_questionnaires_business_id" ON "public"."questionnaires" USING "btree" ("business_id");



CREATE INDEX "idx_questionnaires_gallery_id" ON "public"."questionnaires" USING "btree" ("gallery_id");



CREATE INDEX "idx_questionnaires_slug" ON "public"."questionnaires" USING "btree" ("slug");



CREATE INDEX "image_ai_scores_usage_idx" ON "public"."image_ai_scores" USING "btree" ("suggested_usage");



CREATE INDEX "image_faces_gallery_idx" ON "public"."image_faces" USING "btree" ("gallery_id");



CREATE INDEX "image_faces_image_idx" ON "public"."image_faces" USING "btree" ("image_id");



CREATE INDEX "image_vendor_tags_gallery_idx" ON "public"."image_vendor_tags" USING "btree" ("gallery_id");



CREATE INDEX "image_vendor_tags_vendor_idx" ON "public"."image_vendor_tags" USING "btree" ("vendor_id");



CREATE INDEX "images_gallery_id_idx" ON "public"."images" USING "btree" ("gallery_id");



CREATE INDEX "images_gallery_section_sort_idx" ON "public"."images" USING "btree" ("gallery_id", "section_id", "sort_order");



CREATE INDEX "images_gallery_sort_idx" ON "public"."images" USING "btree" ("gallery_id", "sort_order");



CREATE INDEX "images_public_thumb_present_idx" ON "public"."images" USING "btree" ("public_thumb_present") WHERE ("public_thumb_present" = false);



CREATE INDEX "images_section_id_idx" ON "public"."images" USING "btree" ("section_id");



CREATE INDEX "ix_business_entitlements_biz" ON "public"."business_entitlements" USING "btree" ("business_id");



CREATE INDEX "ix_client_access_audit_biz_client" ON "public"."client_access_audit" USING "btree" ("business_id", "client_id", "created_at" DESC);



CREATE INDEX "ix_client_invitations_business_client" ON "public"."client_invitations" USING "btree" ("business_id", "client_id");



CREATE INDEX "ix_client_invitations_email" ON "public"."client_invitations" USING "btree" ("email");



CREATE INDEX "ix_client_invitations_membership" ON "public"."client_invitations" USING "btree" ("membership_id");



CREATE INDEX "ix_client_memberships_auth_user" ON "public"."client_memberships" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE INDEX "ix_client_memberships_business" ON "public"."client_memberships" USING "btree" ("business_id");



CREATE INDEX "ix_client_memberships_client_status" ON "public"."client_memberships" USING "btree" ("client_id", "status");



CREATE INDEX "ix_import_collections_business" ON "public"."import_collections" USING "btree" ("business_id");



CREATE INDEX "ix_import_collections_job" ON "public"."import_collections" USING "btree" ("job_id");



CREATE INDEX "ix_import_collections_job_status" ON "public"."import_collections" USING "btree" ("job_id", "status");



CREATE INDEX "ix_import_files_business" ON "public"."import_files" USING "btree" ("business_id");



CREATE INDEX "ix_import_files_collection" ON "public"."import_files" USING "btree" ("collection_id");



CREATE INDEX "ix_import_files_collection_status" ON "public"."import_files" USING "btree" ("collection_id", "status");



CREATE INDEX "ix_import_files_content_hash" ON "public"."import_files" USING "btree" ("business_id", "content_hash") WHERE ("content_hash" IS NOT NULL);



CREATE INDEX "ix_import_jobs_business" ON "public"."import_jobs" USING "btree" ("business_id");



CREATE INDEX "ix_import_jobs_business_status" ON "public"."import_jobs" USING "btree" ("business_id", "status");



CREATE INDEX "ix_import_sources_business" ON "public"."import_sources" USING "btree" ("business_id");



CREATE INDEX "ix_tender_collections_business" ON "public"."tender_collections" USING "btree" ("business_id", "created_at" DESC);



CREATE INDEX "ix_tender_items_collection" ON "public"."tender_collection_items" USING "btree" ("collection_id", "added_at");



CREATE INDEX "ix_tender_items_gallery" ON "public"."tender_collection_items" USING "btree" ("gallery_id");



CREATE INDEX "public_gallery_sessions_gallery_idx" ON "public"."public_gallery_sessions" USING "btree" ("gallery_id", "expires_at" DESC);



CREATE INDEX "public_gallery_sessions_ip_idx" ON "public"."public_gallery_sessions" USING "btree" ("ip", "issued_at" DESC);



CREATE INDEX "rekognition_search_log_gallery_idx" ON "public"."rekognition_search_log" USING "btree" ("gallery_id", "created_at" DESC);



CREATE INDEX "rekognition_search_log_ip_idx" ON "public"."rekognition_search_log" USING "btree" ("ip_hash", "created_at" DESC);



CREATE INDEX "stories_gallery_id_idx" ON "public"."stories" USING "btree" ("gallery_id");



CREATE INDEX "stories_section_idx" ON "public"."stories" USING "btree" ("section_id");



CREATE INDEX "story_renders_gallery_id_idx" ON "public"."story_renders" USING "btree" ("gallery_id");



CREATE UNIQUE INDEX "story_renders_inflight_unique" ON "public"."story_renders" USING "btree" ("gallery_id", "style") WHERE ("status" = ANY (ARRAY['queued'::"text", 'rendering'::"text"]));



CREATE UNIQUE INDEX "story_renders_one_draft_per_gallery" ON "public"."story_renders" USING "btree" ("gallery_id") WHERE ("status" = 'draft'::"text");



CREATE INDEX "story_renders_status_idx" ON "public"."story_renders" USING "btree" ("status");



CREATE INDEX "token_ledger_business_idx" ON "public"."token_ledger" USING "btree" ("business_id", "created_at" DESC);



CREATE UNIQUE INDEX "ux_client_invitations_token_hash" ON "public"."client_invitations" USING "btree" ("token_hash");



CREATE UNIQUE INDEX "ux_client_memberships_client_email" ON "public"."client_memberships" USING "btree" ("client_id", "email");



CREATE UNIQUE INDEX "ux_client_memberships_client_user" ON "public"."client_memberships" USING "btree" ("client_id", "auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE UNIQUE INDEX "ux_onboarding_progress_user_surface_version" ON "public"."onboarding_progress" USING "btree" ("user_id", "surface", "version");



CREATE UNIQUE INDEX "ux_tender_items_gallery_level" ON "public"."tender_collection_items" USING "btree" ("collection_id", "gallery_id") WHERE ("image_id" IS NULL);



CREATE UNIQUE INDEX "ux_tender_items_image_level" ON "public"."tender_collection_items" USING "btree" ("collection_id", "gallery_id", "image_id") WHERE ("image_id" IS NOT NULL);



CREATE UNIQUE INDEX "ux_token_ledger_admin_grant_ref" ON "public"."token_ledger" USING "btree" ("ref_id") WHERE (("reason" = 'admin_grant'::"text") AND ("ref_id" IS NOT NULL));



CREATE INDEX "vendors_business_idx" ON "public"."vendors" USING "btree" ("business_id");



CREATE OR REPLACE TRIGGER "businesses_grant_signup_tokens" AFTER INSERT ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."_grant_signup_tokens"();



CREATE OR REPLACE TRIGGER "businesses_set_updated_at" BEFORE UPDATE ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "clients_set_slug_trg" BEFORE INSERT ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."clients_set_slug"();



CREATE OR REPLACE TRIGGER "galleries_ensure_default_section" AFTER INSERT ON "public"."galleries" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_default_section_for_gallery"();



CREATE OR REPLACE TRIGGER "galleries_set_updated_at" BEFORE UPDATE ON "public"."galleries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "gallery_download_log_bump" AFTER INSERT ON "public"."gallery_download_log" FOR EACH ROW EXECUTE FUNCTION "public"."_bump_gallery_download_count"();



CREATE OR REPLACE TRIGGER "gallery_favorites_bump" AFTER INSERT OR DELETE ON "public"."gallery_favorites" FOR EACH ROW EXECUTE FUNCTION "public"."_bump_gallery_favorite_count"();



CREATE OR REPLACE TRIGGER "gallery_presets_biu" BEFORE INSERT OR UPDATE ON "public"."gallery_presets" FOR EACH ROW EXECUTE FUNCTION "public"."_gallery_presets_biu"();



CREATE OR REPLACE TRIGGER "gallery_sections_set_slug_trg" BEFORE INSERT ON "public"."gallery_sections" FOR EACH ROW EXECUTE FUNCTION "public"."gallery_sections_set_slug"();



CREATE OR REPLACE TRIGGER "trg_business_entitlements_updated_at" BEFORE UPDATE ON "public"."business_entitlements" FOR EACH ROW EXECUTE FUNCTION "public"."cpv2_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_client_memberships_updated_at" BEFORE UPDATE ON "public"."client_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."cpv2_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_enforce_gallery_limit" BEFORE INSERT ON "public"."galleries" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_gallery_limit"();



CREATE OR REPLACE TRIGGER "trg_gallery_face_index_complete" AFTER UPDATE OF "face_indexed_at" ON "public"."images" FOR EACH ROW EXECUTE FUNCTION "public"."check_gallery_face_index_complete"();



CREATE OR REPLACE TRIGGER "trg_import_jobs_updated_at" BEFORE UPDATE ON "public"."import_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."cpv2_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_onboarding_progress_updated_at" BEFORE UPDATE ON "public"."onboarding_progress" FOR EACH ROW EXECUTE FUNCTION "public"."cpv2_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_gallery_slug" BEFORE INSERT ON "public"."galleries" FOR EACH ROW EXECUTE FUNCTION "public"."set_gallery_slug"();



CREATE OR REPLACE TRIGGER "trg_story_renders_updated_at" BEFORE UPDATE ON "public"."story_renders" FOR EACH ROW EXECUTE FUNCTION "public"."story_renders_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tender_collections_updated_at" BEFORE UPDATE ON "public"."tender_collections" FOR EACH ROW EXECUTE FUNCTION "public"."cpv2_set_updated_at"();



ALTER TABLE ONLY "public"."business_entitlements"
    ADD CONSTRAINT "business_entitlements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_tokens"
    ADD CONSTRAINT "business_tokens_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_access_audit"
    ADD CONSTRAINT "client_access_audit_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_access_audit"
    ADD CONSTRAINT "client_access_audit_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_code_attempts"
    ADD CONSTRAINT "client_code_attempts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_invitations"
    ADD CONSTRAINT "client_invitations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_invitations"
    ADD CONSTRAINT "client_invitations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_invitations"
    ADD CONSTRAINT "client_invitations_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "public"."client_memberships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_memberships"
    ADD CONSTRAINT "client_memberships_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_memberships"
    ADD CONSTRAINT "client_memberships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_memberships"
    ADD CONSTRAINT "client_memberships_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_memberships"
    ADD CONSTRAINT "client_memberships_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_page_settings"
    ADD CONSTRAINT "client_page_settings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_session_tokens"
    ADD CONSTRAINT "client_session_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_leads"
    ADD CONSTRAINT "event_leads_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."face_search_cache"
    ADD CONSTRAINT "face_search_cache_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_plans"
    ADD CONSTRAINT "feed_plans_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_plans"
    ADD CONSTRAINT "feed_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_published_revision_id_fkey" FOREIGN KEY ("published_revision_id") REFERENCES "public"."gallery_revisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gallery_download_log"
    ADD CONSTRAINT "gallery_download_log_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_download_log"
    ADD CONSTRAINT "gallery_download_log_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gallery_email_log"
    ADD CONSTRAINT "gallery_email_log_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_favorites"
    ADD CONSTRAINT "gallery_favorites_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_favorites"
    ADD CONSTRAINT "gallery_favorites_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_hidden_images"
    ADD CONSTRAINT "gallery_hidden_images_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_hidden_images"
    ADD CONSTRAINT "gallery_hidden_images_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_password_attempts"
    ADD CONSTRAINT "gallery_password_attempts_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_presets"
    ADD CONSTRAINT "gallery_presets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_revisions"
    ADD CONSTRAINT "gallery_revisions_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_sections"
    ADD CONSTRAINT "gallery_sections_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_settings_audit"
    ADD CONSTRAINT "gallery_settings_audit_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_unlock_tokens"
    ADD CONSTRAINT "gallery_unlock_tokens_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."image_ai_scores"
    ADD CONSTRAINT "image_ai_scores_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."image_faces"
    ADD CONSTRAINT "image_faces_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."image_faces"
    ADD CONSTRAINT "image_faces_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."image_vendor_tags"
    ADD CONSTRAINT "image_vendor_tags_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."image_vendor_tags"
    ADD CONSTRAINT "image_vendor_tags_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."image_vendor_tags"
    ADD CONSTRAINT "image_vendor_tags_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."images"
    ADD CONSTRAINT "images_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."images"
    ADD CONSTRAINT "images_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."gallery_sections"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."import_collections"
    ADD CONSTRAINT "import_collections_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_collections"
    ADD CONSTRAINT "import_collections_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_collections"
    ADD CONSTRAINT "import_collections_matched_client_id_fkey" FOREIGN KEY ("matched_client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."import_collections"
    ADD CONSTRAINT "import_collections_target_gallery_id_fkey" FOREIGN KEY ("target_gallery_id") REFERENCES "public"."galleries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."import_files"
    ADD CONSTRAINT "import_files_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_files"
    ADD CONSTRAINT "import_files_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."import_collections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_jobs"
    ADD CONSTRAINT "import_jobs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_jobs"
    ADD CONSTRAINT "import_jobs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."import_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."import_sources"
    ADD CONSTRAINT "import_sources_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_gallery_sessions"
    ADD CONSTRAINT "public_gallery_sessions_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questionnaire_responses"
    ADD CONSTRAINT "questionnaire_responses_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id");



ALTER TABLE ONLY "public"."questionnaires"
    ADD CONSTRAINT "questionnaires_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rekognition_search_log"
    ADD CONSTRAINT "rekognition_search_log_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stories"
    ADD CONSTRAINT "stories_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stories"
    ADD CONSTRAINT "stories_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."gallery_sections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_renders"
    ADD CONSTRAINT "story_renders_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_renders"
    ADD CONSTRAINT "story_renders_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."tender_collection_items"
    ADD CONSTRAINT "tender_collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."tender_collections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tender_collection_items"
    ADD CONSTRAINT "tender_collection_items_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tender_collection_items"
    ADD CONSTRAINT "tender_collection_items_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tender_collections"
    ADD CONSTRAINT "tender_collections_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."token_ledger"
    ADD CONSTRAINT "token_ledger_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can read active questionnaires" ON "public"."questionnaires" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can submit responses" ON "public"."questionnaire_responses" FOR INSERT WITH CHECK (true);



CREATE POLICY "Business owners manage their events" ON "public"."events" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = "auth"."uid"()))));



CREATE POLICY "Business owners manage their questionnaires" ON "public"."questionnaires" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = "auth"."uid"()))));



CREATE POLICY "Business owners read their event leads" ON "public"."event_leads" FOR SELECT USING (("event_id" IN ( SELECT "events"."id"
   FROM "public"."events"
  WHERE ("events"."business_id" IN ( SELECT "businesses"."id"
           FROM "public"."businesses"
          WHERE ("businesses"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Business owners read their questionnaire responses" ON "public"."questionnaire_responses" FOR SELECT USING (("questionnaire_id" IN ( SELECT "questionnaires"."id"
   FROM "public"."questionnaires"
  WHERE ("questionnaires"."business_id" IN ( SELECT "businesses"."id"
           FROM "public"."businesses"
          WHERE ("businesses"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Public read active events" ON "public"."events" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "public"."business_entitlements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_entitlements_owner_select" ON "public"."business_entitlements" FOR SELECT TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."business_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_tokens_owner_select" ON "public"."business_tokens" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_tokens"."business_id") AND ("b"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "businesses_owner_insert" ON "public"."businesses" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "businesses_owner_select" ON "public"."businesses" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "businesses_owner_update" ON "public"."businesses" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."client_access_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_access_audit_owner_select" ON "public"."client_access_audit" FOR SELECT TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."client_code_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_invitations_owner_select" ON "public"."client_invitations" FOR SELECT TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."client_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_memberships_owner_select" ON "public"."client_memberships" FOR SELECT TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = "auth"."uid"()))));



CREATE POLICY "client_memberships_self_select" ON "public"."client_memberships" FOR SELECT TO "authenticated" USING (("auth_user_id" = "auth"."uid"()));



ALTER TABLE "public"."client_page_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_page_settings_owner" ON "public"."client_page_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_page_settings"."client_id") AND ("c"."business_id" = "public"."current_business_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_page_settings"."client_id") AND ("c"."business_id" = "public"."current_business_id"())))));



CREATE POLICY "client_page_settings_public" ON "public"."client_page_settings" TO "anon" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."galleries" "g" ON (("g"."client_id" = "c"."id")))
  WHERE (("c"."id" = "client_page_settings"."client_id") AND ("g"."status" = 'live'::"public"."gallery_status"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."galleries" "g" ON (("g"."client_id" = "c"."id")))
  WHERE (("c"."id" = "client_page_settings"."client_id") AND ("g"."status" = 'live'::"public"."gallery_status")))));



ALTER TABLE "public"."client_session_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_owner_all" ON "public"."clients" TO "authenticated" USING (("business_id" = "public"."current_business_id"())) WITH CHECK (("business_id" = "public"."current_business_id"()));



ALTER TABLE "public"."event_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."face_search_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feed_plans_owner_insert" ON "public"."feed_plans" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "feed_plans"."business_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "feed_plans_owner_select" ON "public"."feed_plans" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "feed_plans"."business_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "feed_plans_owner_update" ON "public"."feed_plans" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "feed_plans"."business_id") AND ("b"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."galleries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "galleries_demo_insert" ON "public"."galleries" FOR INSERT TO "anon" WITH CHECK ((("demo_expires_at" IS NOT NULL) AND ("demo_expires_at" > "now"()) AND ("status" = 'live'::"public"."gallery_status")));



CREATE POLICY "galleries_member_select" ON "public"."galleries" FOR SELECT TO "authenticated" USING ((("status" = 'live'::"public"."gallery_status") AND ("client_id" IN ( SELECT "m"."client_id"
   FROM "public"."client_memberships" "m"
  WHERE (("m"."auth_user_id" = "auth"."uid"()) AND ("m"."status" = 'active'::"text"))))));



CREATE POLICY "galleries_owner_all" ON "public"."galleries" TO "authenticated" USING (("business_id" = "public"."current_business_id"())) WITH CHECK (("business_id" = "public"."current_business_id"()));



CREATE POLICY "galleries_public_live_select" ON "public"."galleries" FOR SELECT TO "anon" USING ((("status" = 'live'::"public"."gallery_status") AND ("password_hash" IS NULL)));



ALTER TABLE "public"."gallery_download_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gallery_download_log_authed_insert" ON "public"."gallery_download_log" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_download_log"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status")))));



CREATE POLICY "gallery_download_log_owner_select" ON "public"."gallery_download_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."galleries" "g"
     JOIN "public"."businesses" "b" ON (("b"."id" = "g"."business_id")))
  WHERE (("g"."id" = "gallery_download_log"."gallery_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "gallery_download_log_public_insert" ON "public"."gallery_download_log" FOR INSERT TO "anon" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_download_log"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status")))));



ALTER TABLE "public"."gallery_email_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gallery_email_log_owner_select" ON "public"."gallery_email_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."galleries" "g"
     JOIN "public"."businesses" "b" ON (("b"."id" = "g"."business_id")))
  WHERE (("g"."id" = "gallery_email_log"."gallery_id") AND ("b"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."gallery_favorites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gallery_favorites_owner_select" ON "public"."gallery_favorites" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."galleries" "g"
     JOIN "public"."businesses" "b" ON (("b"."id" = "g"."business_id")))
  WHERE (("g"."id" = "gallery_favorites"."gallery_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "gallery_favorites_public_delete" ON "public"."gallery_favorites" FOR DELETE TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_favorites"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status")))));



CREATE POLICY "gallery_favorites_public_insert" ON "public"."gallery_favorites" FOR INSERT TO "anon" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_favorites"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status")))));



ALTER TABLE "public"."gallery_hidden_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gallery_password_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gallery_presets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gallery_presets_owner_all" ON "public"."gallery_presets" TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = "auth"."uid"())))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."gallery_revisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gallery_revisions_owner_select" ON "public"."gallery_revisions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_revisions"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"())))));



ALTER TABLE "public"."gallery_sections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gallery_sections_owner_all" ON "public"."gallery_sections" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_sections"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_sections"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"())))));



CREATE POLICY "gallery_sections_public_live_select" ON "public"."gallery_sections" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_sections"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status") AND ("g"."password_hash" IS NULL)))));



ALTER TABLE "public"."gallery_settings_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gallery_settings_audit_owner_select" ON "public"."gallery_settings_audit" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_settings_audit"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"())))));



ALTER TABLE "public"."gallery_unlock_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hidden_images_anon_delete" ON "public"."gallery_hidden_images" FOR DELETE TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_hidden_images"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status")))));



CREATE POLICY "hidden_images_anon_write" ON "public"."gallery_hidden_images" FOR INSERT TO "anon" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_hidden_images"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status")))));



CREATE POLICY "hidden_images_owner_all" ON "public"."gallery_hidden_images" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_hidden_images"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_hidden_images"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"())))));



CREATE POLICY "hidden_images_public_read" ON "public"."gallery_hidden_images" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_hidden_images"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status")))));



ALTER TABLE "public"."image_ai_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."image_faces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "image_faces_owner" ON "public"."image_faces" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "image_faces"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "image_faces"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"())))));



CREATE POLICY "image_scores_public_read" ON "public"."image_ai_scores" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."image_vendor_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "image_vendor_tags_owner" ON "public"."image_vendor_tags" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "image_vendor_tags"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "image_vendor_tags"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"())))));



CREATE POLICY "image_vendor_tags_public_read" ON "public"."image_vendor_tags" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "image_vendor_tags"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status")))));



ALTER TABLE "public"."images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "images_demo_insert" ON "public"."images" FOR INSERT TO "anon" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "images"."gallery_id") AND ("g"."demo_expires_at" IS NOT NULL) AND ("g"."demo_expires_at" > "now"())))));



CREATE POLICY "images_member_select" ON "public"."images" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."galleries" "g"
     JOIN "public"."client_memberships" "m" ON (("m"."client_id" = "g"."client_id")))
  WHERE (("g"."id" = "images"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status") AND ("m"."auth_user_id" = "auth"."uid"()) AND ("m"."status" = 'active'::"text")))));



CREATE POLICY "images_owner_all" ON "public"."images" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "images"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "images"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"())))));



CREATE POLICY "images_public_live_select" ON "public"."images" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "images"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status") AND ("g"."password_hash" IS NULL) AND (("g"."delivery_settings" ->> 'facePrivacyMode'::"text") IS DISTINCT FROM 'private'::"text")))));



ALTER TABLE "public"."import_collections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "import_collections_owner_select" ON "public"."import_collections" FOR SELECT TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."import_files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "import_files_owner_select" ON "public"."import_files" FOR SELECT TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."import_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "import_jobs_owner_select" ON "public"."import_jobs" FOR SELECT TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."import_sources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "import_sources_owner_select" ON "public"."import_sources" FOR SELECT TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."onboarding_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "onboarding_progress_self_insert" ON "public"."onboarding_progress" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "onboarding_progress_self_select" ON "public"."onboarding_progress" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "onboarding_progress_self_update" ON "public"."onboarding_progress" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_gallery_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questionnaire_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questionnaires" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rekognition_search_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sections_member_select" ON "public"."gallery_sections" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."galleries" "g"
     JOIN "public"."client_memberships" "m" ON (("m"."client_id" = "g"."client_id")))
  WHERE (("g"."id" = "gallery_sections"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status") AND ("m"."auth_user_id" = "auth"."uid"()) AND ("m"."status" = 'active'::"text")))));



ALTER TABLE "public"."stories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stories_member_select" ON "public"."stories" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."galleries" "g"
     JOIN "public"."client_memberships" "m" ON (("m"."client_id" = "g"."client_id")))
  WHERE (("g"."id" = "stories"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status") AND ("m"."auth_user_id" = "auth"."uid"()) AND ("m"."status" = 'active'::"text")))));



CREATE POLICY "stories_owner_all" ON "public"."stories" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "stories"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "stories"."gallery_id") AND ("g"."business_id" = "public"."current_business_id"())))));



CREATE POLICY "stories_public_live_select" ON "public"."stories" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "stories"."gallery_id") AND ("g"."status" = 'live'::"public"."gallery_status") AND ("g"."password_hash" IS NULL)))));



ALTER TABLE "public"."story_renders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "story_renders_insert_owner" ON "public"."story_renders" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."galleries" "g"
     JOIN "public"."businesses" "b" ON (("b"."id" = "g"."business_id")))
  WHERE (("g"."id" = "story_renders"."gallery_id") AND ("b"."user_id" = "auth"."uid"())))));



CREATE POLICY "story_renders_select_owner" ON "public"."story_renders" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."galleries" "g"
     JOIN "public"."businesses" "b" ON (("b"."id" = "g"."business_id")))
  WHERE (("g"."id" = "story_renders"."gallery_id") AND ("b"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tender_collection_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tender_collections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tender_collections_owner_all" ON "public"."tender_collections" TO "authenticated" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tender_items_owner_delete" ON "public"."tender_collection_items" FOR DELETE TO "authenticated" USING (("collection_id" IN ( SELECT "tc"."id"
   FROM "public"."tender_collections" "tc"
  WHERE ("tc"."business_id" IN ( SELECT "businesses"."id"
           FROM "public"."businesses"
          WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "tender_items_owner_insert" ON "public"."tender_collection_items" FOR INSERT TO "authenticated" WITH CHECK ((("collection_id" IN ( SELECT "tc"."id"
   FROM "public"."tender_collections" "tc"
  WHERE ("tc"."business_id" IN ( SELECT "businesses"."id"
           FROM "public"."businesses"
          WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) AND ("gallery_id" IN ( SELECT "g"."id"
   FROM "public"."galleries" "g"
  WHERE ("g"."business_id" IN ( SELECT "businesses"."id"
           FROM "public"."businesses"
          WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) AND (("image_id" IS NULL) OR ("image_id" IN ( SELECT "i"."id"
   FROM "public"."images" "i"
  WHERE ("i"."gallery_id" = "tender_collection_items"."gallery_id"))))));



CREATE POLICY "tender_items_owner_select" ON "public"."tender_collection_items" FOR SELECT TO "authenticated" USING (("collection_id" IN ( SELECT "tc"."id"
   FROM "public"."tender_collections" "tc"
  WHERE ("tc"."business_id" IN ( SELECT "businesses"."id"
           FROM "public"."businesses"
          WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "tender_items_owner_update" ON "public"."tender_collection_items" FOR UPDATE TO "authenticated" USING (("collection_id" IN ( SELECT "tc"."id"
   FROM "public"."tender_collections" "tc"
  WHERE ("tc"."business_id" IN ( SELECT "businesses"."id"
           FROM "public"."businesses"
          WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK ((("collection_id" IN ( SELECT "tc"."id"
   FROM "public"."tender_collections" "tc"
  WHERE ("tc"."business_id" IN ( SELECT "businesses"."id"
           FROM "public"."businesses"
          WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) AND ("gallery_id" IN ( SELECT "g"."id"
   FROM "public"."galleries" "g"
  WHERE ("g"."business_id" IN ( SELECT "businesses"."id"
           FROM "public"."businesses"
          WHERE ("businesses"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) AND (("image_id" IS NULL) OR ("image_id" IN ( SELECT "i"."id"
   FROM "public"."images" "i"
  WHERE ("i"."gallery_id" = "tender_collection_items"."gallery_id"))))));



ALTER TABLE "public"."token_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "token_ledger_owner_select" ON "public"."token_ledger" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "token_ledger"."business_id") AND ("b"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendors_owner" ON "public"."vendors" TO "authenticated" USING (("business_id" = "public"."current_business_id"())) WITH CHECK (("business_id" = "public"."current_business_id"()));



CREATE POLICY "vendors_public_read" ON "public"."vendors" FOR SELECT TO "anon" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(character) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"("inet") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "anon";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."_bump_gallery_download_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."_bump_gallery_download_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_bump_gallery_download_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_bump_gallery_favorite_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."_bump_gallery_favorite_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_bump_gallery_favorite_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_gallery_authz"("p_gallery_id" "uuid", "p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_gallery_authz"("p_gallery_id" "uuid", "p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_gallery_authz"("p_gallery_id" "uuid", "p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_gallery_authz"("p_gallery_id" "uuid", "p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_gallery_presets_biu"() TO "anon";
GRANT ALL ON FUNCTION "public"."_gallery_presets_biu"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_gallery_presets_biu"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_grant_signup_tokens"() TO "anon";
GRANT ALL ON FUNCTION "public"."_grant_signup_tokens"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_grant_signup_tokens"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_sanitize_preset_settings"("p_settings" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."_sanitize_preset_settings"("p_settings" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_sanitize_preset_settings"("p_settings" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_validate_delivery_settings_patch"("p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_validate_delivery_settings_patch"("p_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_validate_delivery_settings_patch"("p_patch" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_tokens"("p_business_id" "uuid", "p_count" integer, "p_reason" "text", "p_ref_id" "uuid", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_tokens"("p_business_id" "uuid", "p_count" integer, "p_reason" "text", "p_ref_id" "uuid", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_grant_credits"("p_business_id" "uuid", "p_count" integer, "p_reason" "text", "p_admin_id" "uuid", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_grant_credits"("p_business_id" "uuid", "p_count" integer, "p_reason" "text", "p_admin_id" "uuid", "p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_businesses"("p_search" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_businesses"("p_search" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_recent_grants"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_recent_grants"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."append_client_audit"("p_business_id" "uuid", "p_client_id" "uuid", "p_actor_type" "text", "p_actor_user_id" "uuid", "p_action" "text", "p_target_type" "text", "p_target_id" "uuid", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."append_client_audit"("p_business_id" "uuid", "p_client_id" "uuid", "p_actor_type" "text", "p_actor_user_id" "uuid", "p_action" "text", "p_target_type" "text", "p_target_id" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_gallery_face_index_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_gallery_face_index_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_gallery_face_index_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_demo_galleries"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_demo_galleries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_demo_galleries"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."client_portal_bootstrap"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."client_portal_bootstrap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."client_portal_bootstrap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clients_set_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."clients_set_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clients_set_slug"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cpv2_accept_invitation"("p_token_hash" "text", "p_auth_user_id" "uuid", "p_email" "public"."citext") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpv2_accept_invitation"("p_token_hash" "text", "p_auth_user_id" "uuid", "p_email" "public"."citext") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cpv2_assign_gallery"("p_business_id" "uuid", "p_gallery_id" "uuid", "p_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpv2_assign_gallery"("p_business_id" "uuid", "p_gallery_id" "uuid", "p_client_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cpv2_auth_user_id_by_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpv2_auth_user_id_by_email"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cpv2_owner_assignable_galleries"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpv2_owner_assignable_galleries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cpv2_owner_assignable_galleries"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cpv2_owner_client_detail"("p_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpv2_owner_client_detail"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cpv2_owner_client_detail"("p_client_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cpv2_owner_clients_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpv2_owner_clients_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cpv2_owner_clients_overview"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cpv2_set_membership_status"("p_business_id" "uuid", "p_membership_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpv2_set_membership_status"("p_business_id" "uuid", "p_membership_id" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cpv2_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."cpv2_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cpv2_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cpv2_unassign_gallery"("p_business_id" "uuid", "p_gallery_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cpv2_unassign_gallery"("p_business_id" "uuid", "p_gallery_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_business_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_business_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_business_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."debug_auth_state"() TO "anon";
GRANT ALL ON FUNCTION "public"."debug_auth_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_auth_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."duplicate_gallery"("p_source_gallery_id" "uuid", "p_new_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."duplicate_gallery"("p_source_gallery_id" "uuid", "p_new_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."duplicate_gallery"("p_source_gallery_id" "uuid", "p_new_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."duplicate_gallery"("p_source_gallery_id" "uuid", "p_new_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_gallery_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_gallery_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_default_section_for_gallery"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_default_section_for_gallery"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_default_section_for_gallery"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gallery_activity_summary"("p_gallery_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_activity_summary"("p_gallery_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_activity_summary"("p_gallery_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gallery_bootstrap"("p_business_slug" "text", "p_gallery_slug" "text", "p_token" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_bootstrap"("p_business_slug" "text", "p_gallery_slug" "text", "p_token" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_bootstrap"("p_business_slug" "text", "p_gallery_slug" "text", "p_token" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gallery_cover_thumbs"("p_gallery_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_cover_thumbs"("p_gallery_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_cover_thumbs"("p_gallery_ids" "uuid"[]) TO "service_role";



GRANT ALL ON TABLE "public"."gallery_hidden_images" TO "anon";
GRANT ALL ON TABLE "public"."gallery_hidden_images" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_hidden_images" TO "service_role";



GRANT ALL ON FUNCTION "public"."gallery_get_hidden"("p_gallery_id" "uuid", "p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_get_hidden"("p_gallery_id" "uuid", "p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_get_hidden"("p_gallery_id" "uuid", "p_token" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."images" TO "anon";
GRANT ALL ON TABLE "public"."images" TO "authenticated";
GRANT ALL ON TABLE "public"."images" TO "service_role";



REVOKE ALL ON FUNCTION "public"."gallery_get_images"("p_gallery_id" "uuid", "p_token" "uuid", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gallery_get_images"("p_gallery_id" "uuid", "p_token" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_get_images"("p_gallery_id" "uuid", "p_token" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_get_images"("p_gallery_id" "uuid", "p_token" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gallery_get_meta"("p_gallery_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_get_meta"("p_gallery_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_get_meta"("p_gallery_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."gallery_get_published_snapshot"("p_gallery_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gallery_get_published_snapshot"("p_gallery_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_get_published_snapshot"("p_gallery_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_get_published_snapshot"("p_gallery_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."stories" TO "anon";
GRANT ALL ON TABLE "public"."stories" TO "authenticated";
GRANT ALL ON TABLE "public"."stories" TO "service_role";



GRANT ALL ON FUNCTION "public"."gallery_get_stories"("p_gallery_id" "uuid", "p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_get_stories"("p_gallery_id" "uuid", "p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_get_stories"("p_gallery_id" "uuid", "p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gallery_is_locked"("p_gallery_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_is_locked"("p_gallery_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_is_locked"("p_gallery_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."gallery_publish"("p_gallery_id" "uuid", "p_publish_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gallery_publish"("p_gallery_id" "uuid", "p_publish_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_publish"("p_gallery_id" "uuid", "p_publish_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_publish"("p_gallery_id" "uuid", "p_publish_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gallery_sections_set_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_sections_set_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_sections_set_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gallery_set_hidden"("p_gallery_id" "uuid", "p_image_id" "uuid", "p_hidden" boolean, "p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_set_hidden"("p_gallery_id" "uuid", "p_image_id" "uuid", "p_hidden" boolean, "p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_set_hidden"("p_gallery_id" "uuid", "p_image_id" "uuid", "p_hidden" boolean, "p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gallery_token_is_valid"("p_gallery_id" "uuid", "p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gallery_token_is_valid"("p_gallery_id" "uuid", "p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gallery_token_is_valid"("p_gallery_id" "uuid", "p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_business_by_slug"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_business_by_slug"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_business_by_slug"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_plan"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_plan"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_plan"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_token_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_token_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_token_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_vendor_by_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_vendor_by_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_vendor_by_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_vendor_images"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_vendor_images"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_vendor_images"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_vendor_images"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_business_entitlement"("p_business_id" "uuid", "p_capability" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_business_entitlement"("p_business_id" "uuid", "p_capability" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."images_needing_derivative"("p_gallery_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."images_needing_derivative"("p_gallery_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_face_indexed_count"("p_gallery_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_face_indexed_count"("p_gallery_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_face_indexed_count"("p_gallery_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_face_indexed_count"("p_gallery_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_business_slug_taken"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_business_slug_taken"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_business_slug_taken"("p_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_public_gallery_session"("p_gallery_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_turnstile_validated" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_public_gallery_session"("p_gallery_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_turnstile_validated" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."issue_public_gallery_session"("p_gallery_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_turnstile_validated" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_public_gallery_session"("p_gallery_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_turnstile_validated" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_gallery_paid"("p_business_id" "uuid", "p_gallery_id" "uuid", "p_ref_id" "uuid", "p_months" integer, "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_gallery_paid"("p_business_id" "uuid", "p_gallery_id" "uuid", "p_ref_id" "uuid", "p_months" integer, "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_business_entitlements"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_business_entitlements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_business_entitlements"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_expired_unlock_tokens"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_expired_unlock_tokens"() TO "anon";
GRANT ALL ON FUNCTION "public"."purge_expired_unlock_tokens"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_expired_unlock_tokens"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reap_expired_public_gallery_sessions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reap_expired_public_gallery_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."reap_expired_public_gallery_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reap_expired_public_gallery_sessions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."recompute_face_indexed_count"("p_gallery_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recompute_face_indexed_count"("p_gallery_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_face_indexed_count"("p_gallery_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_face_indexed_count"("p_gallery_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_image_upload"("p_gallery_id" "uuid", "p_filename" "text", "p_web_preview_path" "text", "p_thumbnail_path" "text", "p_original_path" "text", "p_original_size" bigint, "p_section_id" "uuid", "p_sort_order" integer, "p_public_thumb_present" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."record_image_upload"("p_gallery_id" "uuid", "p_filename" "text", "p_web_preview_path" "text", "p_thumbnail_path" "text", "p_original_path" "text", "p_original_size" bigint, "p_section_id" "uuid", "p_sort_order" integer, "p_public_thumb_present" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_image_upload"("p_gallery_id" "uuid", "p_filename" "text", "p_web_preview_path" "text", "p_thumbnail_path" "text", "p_original_path" "text", "p_original_size" bigint, "p_section_id" "uuid", "p_sort_order" integer, "p_public_thumb_present" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reorder_images"("p_gallery_id" "uuid", "p_ids" "uuid"[], "p_orders" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_images"("p_gallery_id" "uuid", "p_ids" "uuid"[], "p_orders" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_images"("p_gallery_id" "uuid", "p_ids" "uuid"[], "p_orders" integer[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "service_role";



REVOKE ALL ON FUNCTION "public"."replace_image"("p_gallery_id" "uuid", "p_image_id" "uuid", "p_web_preview_path" "text", "p_thumbnail_path" "text", "p_original_path" "text", "p_filename" "text", "p_original_size" bigint, "p_mime_type" "text", "p_width" integer, "p_height" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_image"("p_gallery_id" "uuid", "p_image_id" "uuid", "p_web_preview_path" "text", "p_thumbnail_path" "text", "p_original_path" "text", "p_filename" "text", "p_original_size" bigint, "p_mime_type" "text", "p_width" integer, "p_height" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_image"("p_gallery_id" "uuid", "p_image_id" "uuid", "p_web_preview_path" "text", "p_thumbnail_path" "text", "p_original_path" "text", "p_filename" "text", "p_original_size" bigint, "p_mime_type" "text", "p_width" integer, "p_height" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_subscription_tokens"("p_business_id" "uuid", "p_count" integer, "p_ref_id" "uuid", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_subscription_tokens"("p_business_id" "uuid", "p_count" integer, "p_ref_id" "uuid", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_client_portal"("p_business_slug" "text", "p_client_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_client_portal"("p_business_slug" "text", "p_client_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_client_portal"("p_business_slug" "text", "p_client_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_client_portal_by_id"("p_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_client_portal_by_id"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_client_portal_by_id"("p_client_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_owner_content"("p_query" "text", "p_filters" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_owner_content"("p_query" "text", "p_filters" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_owner_content"("p_query" "text", "p_filters" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_business_custom_domain"("p_domain" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_business_custom_domain"("p_domain" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_business_custom_domain"("p_domain" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_client_access_code"("p_client_id" "uuid", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_client_access_code"("p_client_id" "uuid", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_gallery_password"("p_gallery_id" "uuid", "p_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_gallery_password"("p_gallery_id" "uuid", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_gallery_password"("p_gallery_id" "uuid", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_gallery_password"("p_gallery_id" "uuid", "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_gallery_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_gallery_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_gallery_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."slugify"("input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slugify"("input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slugify"("input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."story_renders_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."story_renders_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."story_renders_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sweep_stalled_face_indexing"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sweep_stalled_face_indexing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."try_claim_face_indexing"("p_gallery_id" "uuid", "p_staleness_sec" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."try_claim_face_indexing"("p_gallery_id" "uuid", "p_staleness_sec" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."try_claim_face_indexing"("p_gallery_id" "uuid", "p_staleness_sec" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_claim_face_indexing"("p_gallery_id" "uuid", "p_staleness_sec" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_gallery_settings"("p_gallery_id" "uuid", "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_gallery_settings"("p_gallery_id" "uuid", "p_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_gallery_settings"("p_gallery_id" "uuid", "p_patch" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_client_code"("p_client_id" "uuid", "p_code" "text", "p_ip" "inet", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_client_code"("p_client_id" "uuid", "p_code" "text", "p_ip" "inet", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_client_code"("p_client_id" "uuid", "p_code" "text", "p_ip" "inet", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_client_code"("p_client_id" "uuid", "p_code" "text", "p_ip" "inet", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_client_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_client_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_client_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_client_token"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_gallery_password"("p_gallery_id" "uuid", "p_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_gallery_password"("p_gallery_id" "uuid", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_gallery_password"("p_gallery_id" "uuid", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_gallery_password"("p_gallery_id" "uuid", "p_password" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_public_gallery_session"("p_token" "text", "p_gallery_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_public_gallery_session"("p_token" "text", "p_gallery_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_public_gallery_session"("p_token" "text", "p_gallery_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_public_gallery_session"("p_token" "text", "p_gallery_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";












GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "service_role";















GRANT ALL ON TABLE "public"."business_entitlements" TO "anon";
GRANT ALL ON TABLE "public"."business_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."business_entitlements" TO "service_role";



GRANT ALL ON TABLE "public"."business_tokens" TO "anon";
GRANT ALL ON TABLE "public"."business_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."business_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."businesses" TO "anon";
GRANT ALL ON TABLE "public"."businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."businesses" TO "service_role";



GRANT ALL ON TABLE "public"."client_access_audit" TO "anon";
GRANT ALL ON TABLE "public"."client_access_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."client_access_audit" TO "service_role";



GRANT ALL ON TABLE "public"."client_code_attempts" TO "anon";
GRANT ALL ON TABLE "public"."client_code_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."client_code_attempts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."client_code_attempts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."client_code_attempts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."client_code_attempts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."client_invitations" TO "anon";
GRANT ALL ON TABLE "public"."client_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."client_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."client_memberships" TO "anon";
GRANT ALL ON TABLE "public"."client_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."client_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."client_page_settings" TO "anon";
GRANT ALL ON TABLE "public"."client_page_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."client_page_settings" TO "service_role";



GRANT ALL ON TABLE "public"."client_session_tokens" TO "anon";
GRANT ALL ON TABLE "public"."client_session_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."client_session_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."event_leads" TO "anon";
GRANT ALL ON TABLE "public"."event_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."event_leads" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."face_search_cache" TO "anon";
GRANT ALL ON TABLE "public"."face_search_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."face_search_cache" TO "service_role";



GRANT ALL ON TABLE "public"."feed_plans" TO "anon";
GRANT ALL ON TABLE "public"."feed_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_plans" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."galleries" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."galleries" TO "authenticated";
GRANT ALL ON TABLE "public"."galleries" TO "service_role";



GRANT UPDATE("name") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("name") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("client_id") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("client_id") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("status") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("status") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("public_url") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("public_url") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("created_at") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("created_at") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("published_at") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("published_at") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("client_name") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("client_name") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("image_count") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("image_count") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("local_id") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("local_id") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("business_id") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("business_id") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("project_slug") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("project_slug") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("updated_at") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("updated_at") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("demo_expires_at") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("demo_expires_at") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("demo_ip_hash") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("demo_ip_hash") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("face_index_enabled") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("face_index_enabled") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("face_index_status") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("face_index_status") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("rekognition_collection_id") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("rekognition_collection_id") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("face_indexed_count") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("face_indexed_count") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("face_index_error") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("face_index_error") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("face_indexed_at") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("face_indexed_at") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("slug") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("slug") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("preview_ready") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("preview_ready") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("originals_ready") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("originals_ready") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("publish_status") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("publish_status") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("total_images") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("total_images") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("preview_uploaded_count") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("preview_uploaded_count") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("original_uploaded_count") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("original_uploaded_count") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("original_failed_count") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("original_failed_count") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("last_upload_resume_at") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("last_upload_resume_at") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("password_hash") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("password_hash") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("signed_gate_enabled") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("signed_gate_enabled") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("download_count") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("download_count") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("favorite_count") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("favorite_count") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("last_publish_error") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("last_publish_error") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("event_date") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("event_date") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("event_type") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("event_type") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("event_location") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("event_location") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("access_type") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("access_type") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("client_code_hash") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("client_code_hash") ON TABLE "public"."galleries" TO "anon";



GRANT UPDATE("published_revision_id") ON TABLE "public"."galleries" TO "authenticated";
GRANT UPDATE("published_revision_id") ON TABLE "public"."galleries" TO "anon";



GRANT ALL ON TABLE "public"."gallery_download_log" TO "anon";
GRANT ALL ON TABLE "public"."gallery_download_log" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_download_log" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_email_log" TO "anon";
GRANT ALL ON TABLE "public"."gallery_email_log" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_email_log" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_favorites" TO "anon";
GRANT ALL ON TABLE "public"."gallery_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_password_attempts" TO "anon";
GRANT ALL ON TABLE "public"."gallery_password_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_password_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_presets" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gallery_revisions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gallery_revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_revisions" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_sections" TO "anon";
GRANT ALL ON TABLE "public"."gallery_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_sections" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_settings_audit" TO "anon";
GRANT ALL ON TABLE "public"."gallery_settings_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_settings_audit" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_unlock_tokens" TO "anon";
GRANT ALL ON TABLE "public"."gallery_unlock_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_unlock_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."image_ai_scores" TO "anon";
GRANT ALL ON TABLE "public"."image_ai_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."image_ai_scores" TO "service_role";



GRANT ALL ON TABLE "public"."image_faces" TO "anon";
GRANT ALL ON TABLE "public"."image_faces" TO "authenticated";
GRANT ALL ON TABLE "public"."image_faces" TO "service_role";



GRANT ALL ON TABLE "public"."image_vendor_tags" TO "anon";
GRANT ALL ON TABLE "public"."image_vendor_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."image_vendor_tags" TO "service_role";



GRANT ALL ON TABLE "public"."import_collections" TO "authenticated";
GRANT ALL ON TABLE "public"."import_collections" TO "service_role";



GRANT ALL ON TABLE "public"."import_files" TO "authenticated";
GRANT ALL ON TABLE "public"."import_files" TO "service_role";



GRANT ALL ON TABLE "public"."import_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."import_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."import_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."import_sources" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_progress" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."onboarding_progress" TO "authenticated";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."public_gallery_sessions" TO "anon";
GRANT ALL ON TABLE "public"."public_gallery_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."public_gallery_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."questionnaire_responses" TO "anon";
GRANT ALL ON TABLE "public"."questionnaire_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."questionnaire_responses" TO "service_role";



GRANT ALL ON TABLE "public"."questionnaires" TO "anon";
GRANT ALL ON TABLE "public"."questionnaires" TO "authenticated";
GRANT ALL ON TABLE "public"."questionnaires" TO "service_role";



GRANT ALL ON TABLE "public"."rekognition_search_log" TO "anon";
GRANT ALL ON TABLE "public"."rekognition_search_log" TO "authenticated";
GRANT ALL ON TABLE "public"."rekognition_search_log" TO "service_role";



GRANT ALL ON TABLE "public"."story_renders" TO "anon";
GRANT ALL ON TABLE "public"."story_renders" TO "authenticated";
GRANT ALL ON TABLE "public"."story_renders" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."tender_collection_items" TO "authenticated";
GRANT ALL ON TABLE "public"."tender_collection_items" TO "service_role";



GRANT ALL ON TABLE "public"."tender_collections" TO "authenticated";
GRANT ALL ON TABLE "public"."tender_collections" TO "service_role";



GRANT ALL ON TABLE "public"."token_ledger" TO "anon";
GRANT ALL ON TABLE "public"."token_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."token_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."vendors" TO "anon";
GRANT ALL ON TABLE "public"."vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."vendors" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


SET search_path TO public, extensions;

-- Supabase-managed schemas the default dump skips: storage buckets, storage
-- rules and scheduled jobs, generated from production's live definitions.

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('business-brand', 'business-brand', true, 104857600, '{image/*}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('demo-uploads', 'demo-uploads', true, 104857600, '{image/*}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('gallery-images', 'gallery-images', true, 104857600, '{image/*}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('gallery-images-thumbs-public', 'gallery-images-thumbs-public', true, 104857600, '{image/*}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('gallery-stories', 'gallery-stories', true, 209715200, '{video/*,image/*}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('images', 'images', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('stories', 'stories', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('thumbnails', 'thumbnails', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;

-- Storage rules
DROP POLICY IF EXISTS business_brand_owner_write ON storage.objects;
CREATE POLICY business_brand_owner_write ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
  USING (((bucket_id = 'business-brand'::text) AND (EXISTS ( SELECT 1
   FROM businesses b
  WHERE (((b.id)::text = (storage.foldername(objects.name))[1]) AND (b.user_id = auth.uid()))))))
  WITH CHECK (((bucket_id = 'business-brand'::text) AND (EXISTS ( SELECT 1
   FROM businesses b
  WHERE (((b.id)::text = (storage.foldername(objects.name))[1]) AND (b.user_id = auth.uid()))))));

DROP POLICY IF EXISTS business_brand_public_read ON storage.objects;
CREATE POLICY business_brand_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING ((bucket_id = 'business-brand'::text));

DROP POLICY IF EXISTS demo_uploads_insert ON storage.objects;
CREATE POLICY demo_uploads_insert ON storage.objects AS PERMISSIVE FOR INSERT TO anon
  WITH CHECK ((bucket_id = 'demo-uploads'::text));

DROP POLICY IF EXISTS demo_uploads_select ON storage.objects;
CREATE POLICY demo_uploads_select ON storage.objects AS PERMISSIVE FOR SELECT TO anon
  USING ((bucket_id = 'demo-uploads'::text));

DROP POLICY IF EXISTS gallery_storage_owner_write ON storage.objects;
CREATE POLICY gallery_storage_owner_write ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
  USING (((bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])) AND (EXISTS ( SELECT 1
   FROM galleries g
  WHERE (((g.id)::text = (storage.foldername(objects.name))[2]) AND (g.business_id = current_business_id()))))))
  WITH CHECK (((bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])) AND (EXISTS ( SELECT 1
   FROM galleries g
  WHERE (((g.id)::text = (storage.foldername(objects.name))[2]) AND (g.business_id = current_business_id()))))));

DROP POLICY IF EXISTS gallery_storage_public_read ON storage.objects;
CREATE POLICY gallery_storage_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO anon
  USING (((bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])) AND (EXISTS ( SELECT 1
   FROM galleries g
  WHERE (((g.id)::text = (storage.foldername(objects.name))[2]) AND (g.status = 'live'::gallery_status) AND ((objects.bucket_id = 'gallery-stories'::text) OR ((g.delivery_settings ->> 'facePrivacyMode'::text) IS DISTINCT FROM 'private'::text)))))));

DROP POLICY IF EXISTS gallery_stories_public_read ON storage.objects;
CREATE POLICY gallery_stories_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING ((bucket_id = 'gallery-stories'::text));

DROP POLICY IF EXISTS thumbs_public_anon_read ON storage.objects;
CREATE POLICY thumbs_public_anon_read ON storage.objects AS PERMISSIVE FOR SELECT TO anon
  USING (((bucket_id = 'gallery-images-thumbs-public'::text) AND (EXISTS ( SELECT 1
   FROM galleries g
  WHERE (((g.id)::text = (storage.foldername(objects.name))[2]) AND (g.status = 'live'::gallery_status) AND ((g.delivery_settings ->> 'facePrivacyMode'::text) IS DISTINCT FROM 'private'::text))))));

DROP POLICY IF EXISTS thumbs_public_owner_write ON storage.objects;
CREATE POLICY thumbs_public_owner_write ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
  USING (((bucket_id = 'gallery-images-thumbs-public'::text) AND (EXISTS ( SELECT 1
   FROM (galleries g
     JOIN businesses b ON ((b.id = g.business_id)))
  WHERE (((g.id)::text = (storage.foldername(objects.name))[2]) AND (b.user_id = auth.uid()))))))
  WITH CHECK (((bucket_id = 'gallery-images-thumbs-public'::text) AND (EXISTS ( SELECT 1
   FROM (galleries g
     JOIN businesses b ON ((b.id = g.business_id)))
  WHERE (((g.id)::text = (storage.foldername(objects.name))[2]) AND (b.user_id = auth.uid()))))));

-- Scheduled jobs
SELECT cron.schedule('sweep-face-indexing', '* * * * *', 'select public.sweep_stalled_face_indexing()');
