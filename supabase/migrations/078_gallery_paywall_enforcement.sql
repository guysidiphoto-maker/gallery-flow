-- ─────────────────────────────────────────────────────────────────────────────
-- 078_gallery_paywall_enforcement.sql — Server-side one-time paywall (PR2)
--
-- Locks a gallery's IMAGES behind the ₪590 one-time purchase, enforced in the
-- single public image source (gallery_get_images) so it can't be bypassed via
-- pagination or direct RPC calls. The photographer's own editor reads images
-- directly (owner RLS), NOT through this RPC, so the editor is unaffected.
--
-- SAFE BY CONSTRUCTION: a gallery is locked only when requires_payment = true
-- (default false, migration 077). Every existing gallery → not locked →
-- gallery_get_images / gallery_bootstrap behave byte-identically to today.
--
-- Lock predicate: requires_payment AND NOT (paid AND within retention window).
-- mark_gallery_paid() (076) sets one_time_paid + paid_expires_at = now()+12mo,
-- so paying unlocks for the retention window; after it lapses, it re-locks.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Lock predicate ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gallery_is_locked(p_gallery_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT g.requires_payment
            AND NOT (g.one_time_paid AND COALESCE(g.paid_expires_at > now(), false))
       FROM galleries g WHERE g.id = p_gallery_id),
    false);
$$;
GRANT EXECUTE ON FUNCTION gallery_is_locked(uuid) TO anon, authenticated;

-- ── gallery_get_images: add the paywall guard (else unchanged) ──────────────
CREATE OR REPLACE FUNCTION public.gallery_get_images(
  p_gallery_id uuid,
  p_token uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS SETOF images
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT _gallery_authz(p_gallery_id, p_token) THEN RETURN; END IF;
  -- One-time paywall: withhold images for an opted-in, unpaid gallery.
  IF gallery_is_locked(p_gallery_id) THEN RETURN; END IF;
  RETURN QUERY
    SELECT * FROM images
     WHERE gallery_id = p_gallery_id
     ORDER BY sort_order ASC
     LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 500), 2000))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$function$;
GRANT EXECUTE ON FUNCTION public.gallery_get_images(uuid, uuid, integer, integer) TO anon, authenticated;

-- ── gallery_bootstrap: surface `locked` so the viewer renders a paywall ─────
-- Identical to 073 plus the `locked` flag. Images come back [] when locked
-- (gallery_get_images withholds them), so the viewer needs the flag to tell a
-- paywalled gallery apart from an empty one.
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
    'sections', v_secs,
    'locked', gallery_is_locked(v_gid)
  );
END
$$;
GRANT EXECUTE ON FUNCTION gallery_bootstrap(TEXT, TEXT, UUID, INT) TO anon, authenticated;

COMMIT;
