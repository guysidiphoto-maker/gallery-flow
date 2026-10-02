-- Keep a gallery's client code ("client as admin" code, also the legacy portal
-- PIN) on the server.
--
-- Before: the code lived in galleries.delivery_settings, which anonymous
-- visitors read directly (galleries_public_live_select), through
-- gallery_get_meta and through gallery_get_published_snapshot (no live/owner
-- check at all). The viewer and the portal compared it in the browser, and
-- gallery_set_hidden accepted anyone who could view the gallery.
--
-- After:
--   • The code lives in gallery_client_codes (owner-only). A trigger moves
--     delivery_settings.clientCode there on every insert/update, so every
--     existing writer (update_gallery_settings, duplicate, importer) keeps
--     working unchanged and the key never stays in delivery_settings.
--   • gallery_verify_client_code checks a code server-side, with a cap of
--     10 wrong guesses per gallery per 15 minutes.
--   • gallery_set_hidden needs the owner or a valid client code.
--   • gallery_get_published_snapshot needs a live gallery or the owner, and
--     never returns clientCode/password; gallery_get_meta never returns clientCode.

BEGIN;

-- ── 1. Owner-only storage for the code ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gallery_client_codes (
  -- Deferred so the BEFORE INSERT trigger can write the code before the
  -- gallery row itself exists.
  gallery_id uuid PRIMARY KEY
    REFERENCES public.galleries(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  code       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gallery_client_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gallery_client_codes FROM anon;

DROP POLICY IF EXISTS gallery_client_codes_owner_all ON public.gallery_client_codes;
CREATE POLICY gallery_client_codes_owner_all ON public.gallery_client_codes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.galleries g
                  WHERE g.id = gallery_client_codes.gallery_id
                    AND g.business_id = current_business_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.galleries g
                       WHERE g.id = gallery_client_codes.gallery_id
                         AND g.business_id = current_business_id()));

CREATE TABLE IF NOT EXISTS public.gallery_client_code_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gallery_id   uuid NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success      boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS gallery_client_code_attempts_recent_idx
  ON public.gallery_client_code_attempts (gallery_id, attempted_at);
-- Only the SECURITY DEFINER functions below read or write it.
ALTER TABLE public.gallery_client_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gallery_client_code_attempts FROM anon, authenticated;

-- ── 2. Move the code out of delivery_settings on every write ────────────────
CREATE OR REPLACE FUNCTION public._galleries_extract_client_code()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF NEW.delivery_settings IS NULL OR NOT (NEW.delivery_settings ? 'clientCode') THEN
    RETURN NEW;
  END IF;
  v_code := upper(btrim(coalesce(NEW.delivery_settings ->> 'clientCode', '')));
  IF v_code = '' THEN
    DELETE FROM gallery_client_codes WHERE gallery_id = NEW.id;
  ELSE
    INSERT INTO gallery_client_codes (gallery_id, code) VALUES (NEW.id, v_code)
    ON CONFLICT (gallery_id) DO UPDATE SET code = EXCLUDED.code, updated_at = now();
  END IF;
  NEW.delivery_settings := NEW.delivery_settings - 'clientCode';
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._galleries_extract_client_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS galleries_extract_client_code ON public.galleries;
CREATE TRIGGER galleries_extract_client_code
  BEFORE INSERT OR UPDATE OF delivery_settings ON public.galleries
  FOR EACH ROW EXECUTE FUNCTION public._galleries_extract_client_code();

-- Existing rows: the no-op update fires the trigger, which moves the code.
UPDATE public.galleries SET delivery_settings = delivery_settings
 WHERE delivery_settings ? 'clientCode';
UPDATE public.gallery_revisions SET settings = settings - 'clientCode'
 WHERE settings ? 'clientCode';

-- ── 3. Server-side check ───────────────────────────────────────────────────
-- Internal comparison, no attempt logging (used by gallery_set_hidden).
CREATE OR REPLACE FUNCTION public._gallery_client_code_ok(p_gallery_id uuid, p_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(btrim(p_code), '') <> ''
     AND EXISTS (SELECT 1 FROM gallery_client_codes c
                  WHERE c.gallery_id = p_gallery_id
                    AND c.code = upper(btrim(p_code)));
$$;
REVOKE EXECUTE ON FUNCTION public._gallery_client_code_ok(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gallery_verify_client_code(
  p_gallery_id uuid,
  p_code text,
  p_token uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN RETURN false; END IF;
  IF (SELECT count(*) FROM gallery_client_code_attempts
       WHERE gallery_id = p_gallery_id AND NOT success
         AND attempted_at > now() - interval '15 minutes') >= 10 THEN
    RETURN false;
  END IF;
  v_ok := _gallery_client_code_ok(p_gallery_id, p_code);
  INSERT INTO gallery_client_code_attempts (gallery_id, success) VALUES (p_gallery_id, v_ok);
  RETURN v_ok;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.gallery_verify_client_code(uuid, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.gallery_verify_client_code(uuid, text, uuid) TO anon, authenticated, service_role;

-- ── 4. Hide/unhide: owner or valid client code ─────────────────────────────
DROP FUNCTION IF EXISTS public.gallery_set_hidden(uuid, uuid, boolean, uuid);
CREATE OR REPLACE FUNCTION public.gallery_set_hidden(
  p_gallery_id uuid,
  p_image_id uuid,
  p_hidden boolean,
  p_token uuid DEFAULT NULL,
  p_client_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT b.user_id INTO v_owner
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  IF NOT ((auth.uid() IS NOT NULL AND v_owner = auth.uid())
          OR _gallery_client_code_ok(p_gallery_id, p_client_code)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_hidden THEN
    INSERT INTO gallery_hidden_images (gallery_id, image_id)
    SELECT p_gallery_id, p_image_id
     WHERE EXISTS (SELECT 1 FROM images WHERE id = p_image_id AND gallery_id = p_gallery_id)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM gallery_hidden_images
     WHERE gallery_id = p_gallery_id AND image_id = p_image_id;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.gallery_set_hidden(uuid, uuid, boolean, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.gallery_set_hidden(uuid, uuid, boolean, uuid, text) TO anon, authenticated, service_role;

-- ── 5. Published snapshot: live or owner, no secrets ───────────────────────
CREATE OR REPLACE FUNCTION public.gallery_get_published_snapshot(p_gallery_id uuid)
RETURNS TABLE(revision_id uuid, revision_index integer, settings jsonb, section_data jsonb,
              name text, status gallery_status, access_type text, event_date date,
              event_type text, event_location text, created_at timestamp with time zone)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT
    r.id, r.revision_index,
    r.settings - 'clientCode' - 'password',
    r.section_data, r.name, r.status, r.access_type,
    r.event_date, r.event_type, r.event_location, r.created_at
    FROM public.galleries g
    JOIN public.businesses b ON b.id = g.business_id
    JOIN public.gallery_revisions r ON r.id = g.published_revision_id
   WHERE g.id = p_gallery_id
     AND g.published_revision_id IS NOT NULL
     AND (g.status = 'live'::gallery_status
          OR (auth.uid() IS NOT NULL AND b.user_id = auth.uid()))
   LIMIT 1;
$$;

-- ── 6. gallery_get_meta: never return clientCode ───────────────────────────
-- Production body with one change: `ds := ds - 'password' - 'clientCode'`.
CREATE OR REPLACE FUNCTION public.gallery_get_meta(p_gallery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  result JSONB; status_ TEXT; ds JSONB; logo TEXT; has_pw BOOLEAN;
  v_owner UUID; v_bk JSONB; v_brand JSONB := NULL;
BEGIN
  SELECT g.status, (g.password_hash IS NOT NULL), b.user_id
    INTO status_, has_pw, v_owner
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  IF status_ IS NULL THEN RETURN NULL; END IF;
  IF status_ <> 'live' AND NOT (auth.uid() IS NOT NULL AND v_owner = auth.uid()) THEN
    RETURN NULL;
  END IF;

  SELECT (to_jsonb(g) - 'password_hash' - 'client_id') INTO result
    FROM galleries g WHERE g.id = p_gallery_id;

  ds := result -> 'delivery_settings';
  IF ds IS NULL OR jsonb_typeof(ds) <> 'object' THEN ds := '{}'::jsonb; END IF;
  ds := ds - 'password' - 'clientCode';
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
$function$;

-- ── 7. Portal: does this client have a legacy PIN? (boolean only) ──────────
CREATE OR REPLACE FUNCTION public.client_has_legacy_pin(p_client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM galleries g JOIN gallery_client_codes c ON c.gallery_id = g.id
     WHERE g.client_id = p_client_id AND g.status = 'live'::gallery_status);
$$;
REVOKE EXECUTE ON FUNCTION public.client_has_legacy_pin(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.client_has_legacy_pin(uuid) TO anon, authenticated, service_role;

COMMIT;
