-- ─────────────────────────────────────────────────────────────────────────────
-- 112_draft_isolation_hardening.sql — Fail-closed public gallery resolution.
--
-- Defect (pre-existing): the SECURITY DEFINER public resolvers returned NON-LIVE
-- (draft/archived/etc.) gallery metadata + sections to anonymous callers by slug
-- or id, bypassing the `status = 'live'` RLS that governs direct reads. Anyone
-- who knew/guessed a business-slug + gallery-slug (slugs are name-derived) could
-- read a draft's name, event metadata, client assignment and section names.
-- Draft IMAGES were already withheld (_gallery_authz is live-only).
--
-- Contract enforced here (inside the canonical DB path, not the frontend):
--   • Anonymous / non-owner: may resolve ONLY status='live' galleries. Any
--     non-live gallery is indistinguishable from a nonexistent one — both return
--     the same neutral {ok:false, error:'not_found'} and NULL meta. No name,
--     event date, client id, sections, cover or settings leak; existence of a
--     draft slug is not enumerable.
--   • Authenticated gallery OWNER (auth.uid() = businesses.user_id): may resolve
--     and fully preview their OWN gallery in any status (draft preview), incl.
--     images — authorization is by authenticated ownership, never slug possession.
--     Cannot resolve another business's draft.
--   • Live password-gated gallery: password flow unchanged; images still require
--     a valid unlock token; owner bypasses the password for their own gallery.
--   • Client members / face-search / paywall paths are unchanged (already
--     status='live' gated: client_portal_bootstrap 091, verify_gallery_password
--     035/041, face search 041).
--
-- Also strips `client_id` from the public meta (client assignment is never
-- needed by the public viewer, which reads client_name from delivery_settings).
--
-- Signatures preserved; SECURITY DEFINER + pinned search_path; least-privilege
-- grants unchanged. Additive over 104–111. Reversible (112_..._rollback.sql
-- restores the 041/078/109 bodies).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. _gallery_authz: add an authenticated-owner bypass ────────────────────
-- Lets the owner preview their own gallery (incl. draft images) without a
-- password/token, while everyone else stays gated to status='live' (+ password
-- token). This is what makes owner draft-preview work after the bootstrap gate.
CREATE OR REPLACE FUNCTION _gallery_authz(p_gallery_id UUID, p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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
GRANT EXECUTE ON FUNCTION _gallery_authz(uuid, uuid) TO anon, authenticated;

-- ── 2. gallery_get_meta: gate to live-or-owner; strip client_id ─────────────
-- Reproduces 109's body (row minus password_hash; delivery_settings minus
-- password; local-path logoUrl sanitize; brand subset incl. appearance) PLUS a
-- fail-closed visibility gate and client-assignment strip.
CREATE OR REPLACE FUNCTION public.gallery_get_meta(p_gallery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
$function$;
GRANT EXECUTE ON FUNCTION public.gallery_get_meta(uuid) TO anon, authenticated;

-- ── 3. gallery_bootstrap: resolve non-live ONLY for the authenticated owner ──
-- Reproduces 078's shape (meta/images/sections/locked) but the slug resolution
-- now admits a non-live gallery only when the caller owns it. A draft slug for a
-- non-owner yields the SAME not_found as a nonexistent slug (no enumeration).
CREATE OR REPLACE FUNCTION gallery_bootstrap(
  p_business_slug TEXT,
  p_gallery_slug  TEXT,
  p_token         UUID DEFAULT NULL,
  p_limit         INT  DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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
GRANT EXECUTE ON FUNCTION gallery_bootstrap(TEXT, TEXT, UUID, INT) TO anon, authenticated;

COMMIT;

-- Post-conditions (run as the anon role, manually):
--   SELECT gallery_bootstrap('<biz>','<draft-slug>');  -- expect {"ok":false,"error":"not_found"}
--   SELECT gallery_bootstrap('<biz>','<nonexistent>');  -- expect identical not_found
--   SELECT gallery_get_meta('<draft-gallery-id>');      -- expect NULL
--   SELECT gallery_bootstrap('<biz>','<live-slug>');     -- expect ok:true with meta/images/sections
