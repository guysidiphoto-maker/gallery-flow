-- 092_client_admin_read_rpcs.sql — Client Portal V2: owner-side READ RPCs.
--
-- Self-scoped aggregation for the photographer "Clients Manager". Each function
-- resolves the caller's business from auth.uid() internally, so the owner UI can
-- call them directly with its session (no service-role needed for reads) and can
-- never read another business's data. NONE of these return secrets — the client
-- access_code_hash is explicitly stripped.
--
-- NOT APPLIED by this program. Paired rollback: 092_client_admin_read_rpcs_rollback.sql

BEGIN;

-- Overview list for the Clients grid.
CREATE OR REPLACE FUNCTION public.cpv2_owner_clients_overview()
RETURNS TABLE (
  client_id           uuid,
  name                text,
  slug                text,
  gallery_count       bigint,
  member_count        bigint,
  active_member_count bigint,
  pending_invites     bigint,
  last_access_at      timestamptz,
  has_legacy_pin      boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- Galleries owned by the caller's business + their current client assignment.
CREATE OR REPLACE FUNCTION public.cpv2_owner_assignable_galleries()
RETURNS TABLE (
  gallery_id   uuid,
  name         text,
  slug         text,
  status       text,
  client_id    uuid,
  client_name  text,
  event_date   date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.name, g.slug, g.status::text, g.client_id, c.name, g.event_date
  FROM public.galleries g
  LEFT JOIN public.clients c ON c.id = g.client_id
  WHERE g.business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
  ORDER BY g.published_at DESC NULLS LAST, g.name;
$$;

-- Full detail for one client (overview, galleries, members, invitations, audit).
-- Fails CLOSED (returns NULL) if the caller does not own the client's business.
-- Strips access_code_hash from the returned client object.
CREATE OR REPLACE FUNCTION public.cpv2_owner_client_detail(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- Self-scoped → safe for the authenticated owner. Anon blocked.
REVOKE EXECUTE ON FUNCTION public.cpv2_owner_clients_overview()        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cpv2_owner_assignable_galleries()    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cpv2_owner_client_detail(uuid)       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cpv2_owner_clients_overview()        TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.cpv2_owner_assignable_galleries()    TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.cpv2_owner_client_detail(uuid)       TO authenticated, service_role;

COMMIT;

-- Verification (manual): as owner JWT, SELECT public.cpv2_owner_clients_overview();
--   returns only the caller's clients. As anon → permission denied.
