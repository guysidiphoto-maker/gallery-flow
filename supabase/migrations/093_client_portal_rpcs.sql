-- 091_client_portal_rpcs.sql — Client Portal V2: secure data-path RPCs.
--
-- Two kinds of function:
--   1) client_portal_bootstrap()  — AUTHENTICATED, self-scoped via auth.uid().
--      The ONLY data entry point the client portal calls. Takes NO client_id/
--      business_id argument, so a member can never request another tenant's data.
--      Returns only PUBLISHED galleries of clients where the caller has an ACTIVE
--      membership. Disabled/revoked members get nothing (status re-checked every
--      call — no reliance on session liveness).
--   2) cpv2_* data primitives — SERVICE_ROLE only. Called by server APIs AFTER
--      they validate the JWT + owner/entitlement (see server/ownerAuth.ts,
--      server/membership.ts). Each also re-validates tenant scoping internally
--      (defense in depth). Raw invitation tokens NEVER reach the DB — only their
--      sha256 hash is passed.
--
-- NOT APPLIED by this program. Paired rollback: 091_client_portal_rpcs_rollback.sql

BEGIN;

-- ============================================================
-- 1) client_portal_bootstrap  (authenticated, self-scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION public.client_portal_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    -- Anonymous → no portal data. Fail closed.
    RETURN jsonb_build_object('authenticated', false, 'memberships', '[]'::jsonb, 'galleries', '[]'::jsonb);
  END IF;

  -- Touch last_access_at for the caller's active memberships (analytics/audit).
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
        'role',          m.role))
      FROM public.client_memberships m
      JOIN public.clients c ON c.id = m.client_id
      WHERE m.auth_user_id = v_uid AND m.status = 'active'
    ), '[]'::jsonb),
    -- Only PUBLISHED galleries of clients the caller actively belongs to.
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

REVOKE EXECUTE ON FUNCTION public.client_portal_bootstrap() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_portal_bootstrap() TO authenticated, service_role;

-- ============================================================
-- 2a) cpv2_assign_gallery — set galleries.client_id (service_role only)
--     Verifies BOTH the gallery and the target client belong to p_business_id
--     (the server-verified owner business). Cross-business assignment → error.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cpv2_assign_gallery(
  p_business_id uuid,
  p_gallery_id  uuid,
  p_client_id   uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- ============================================================
-- 2b) cpv2_unassign_gallery — clear galleries.client_id (service_role only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cpv2_unassign_gallery(
  p_business_id uuid,
  p_gallery_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- ============================================================
-- 2c) cpv2_set_membership_status — disable/reactivate/revoke (service_role only)
--     Scoped to p_business_id (server-verified). Never touches auth.users, so
--     disabling one membership can never globally ban a user who belongs to
--     other clients.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cpv2_set_membership_status(
  p_business_id  uuid,
  p_membership_id uuid,
  p_status       text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- ============================================================
-- 2d) cpv2_accept_invitation — bind an auth user to a membership (service_role)
--     Matches by sha256 token hash (raw token stays in the server). Enforces
--     pending status, expiry, and email match. On success: membership → active,
--     auth_user_id bound, invitation → accepted.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cpv2_accept_invitation(
  p_token_hash   text,
  p_auth_user_id uuid,
  p_email        citext
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- ── Least privilege: data primitives are SERVER-ONLY ────────────────────────
REVOKE EXECUTE ON FUNCTION public.cpv2_assign_gallery(uuid,uuid,uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cpv2_unassign_gallery(uuid,uuid)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cpv2_set_membership_status(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cpv2_accept_invitation(text,uuid,citext)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cpv2_assign_gallery(uuid,uuid,uuid)        TO service_role;
GRANT  EXECUTE ON FUNCTION public.cpv2_unassign_gallery(uuid,uuid)          TO service_role;
GRANT  EXECUTE ON FUNCTION public.cpv2_set_membership_status(uuid,uuid,text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.cpv2_accept_invitation(text,uuid,citext)  TO service_role;

COMMIT;

-- ============================================================
-- Verification (manual, after a controlled apply):
--   -- anon/authenticated cannot call server primitives:
--   SET ROLE authenticated; SELECT public.cpv2_assign_gallery('x','y','z'); -- permission denied
--   RESET ROLE;
--   -- bootstrap as anon returns authenticated:false, empty arrays:
--   SET ROLE anon; SELECT public.client_portal_bootstrap();  -- permission denied (anon revoked)
--   RESET ROLE;
--   -- cross-business assign raises:
--   SELECT public.cpv2_assign_gallery('<bizA>','<galleryOfBizB>','<clientOfBizA>'); -- gallery_not_in_business
-- ============================================================
