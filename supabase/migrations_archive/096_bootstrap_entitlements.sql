-- 094_bootstrap_entitlements.sql — augment client_portal_bootstrap with the
-- Production Suite entitlement flag so the authenticated portal can gate the
-- advanced modules without a second round-trip. Entitlement is resolved per the
-- membership's business; default DENY (inlined EXISTS, self-contained).
--
-- CREATE OR REPLACE only — no schema change. NOT APPLIED by this program.
-- Paired rollback re-installs the 091 version (091 body) — see rollback file.

BEGIN;

CREATE OR REPLACE FUNCTION public.client_portal_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

REVOKE EXECUTE ON FUNCTION public.client_portal_bootstrap() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_portal_bootstrap() TO authenticated, service_role;

COMMIT;
