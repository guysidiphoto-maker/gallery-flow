-- 094_bootstrap_entitlements_rollback.sql — restore the 091 bootstrap (no
-- production_suite flag). Re-run 091's definition. Idempotent.
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
  UPDATE public.client_memberships SET last_access_at = now()
    WHERE auth_user_id = v_uid AND status = 'active';
  SELECT jsonb_build_object(
    'authenticated', true,
    'memberships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'membership_id', m.id, 'client_id', m.client_id, 'business_id', m.business_id,
        'client_name', c.name, 'client_slug', c.slug, 'role', m.role))
      FROM public.client_memberships m JOIN public.clients c ON c.id = m.client_id
      WHERE m.auth_user_id = v_uid AND m.status = 'active'), '[]'::jsonb),
    'galleries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'client_id', g.client_id, 'name', g.name, 'slug', g.slug,
        'status', g.status, 'event_date', g.event_date))
      FROM public.galleries g
      WHERE g.status = 'live' AND g.client_id IN (
        SELECT m.client_id FROM public.client_memberships m
        WHERE m.auth_user_id = v_uid AND m.status = 'active')), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $$;
GRANT EXECUTE ON FUNCTION public.client_portal_bootstrap() TO authenticated, service_role;
COMMIT;
