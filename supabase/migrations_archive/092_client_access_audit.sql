-- 090_client_access_audit.sql — Client Portal V2: minimal, scoped activity trail.
--
-- Records important owner/client actions for support + security review. Rows are
-- ALWAYS scoped to (business_id, client_id). The table NEVER stores passwords,
-- invitation/reset tokens, access-code hashes, or signed image URLs — writers
-- pass only controlled action strings + non-secret metadata.
--
-- NOT APPLIED by this program. Paired rollback: 090_client_access_audit_rollback.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_access_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id     uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  actor_type    text NOT NULL CHECK (actor_type IN ('owner','client','system')),
  actor_user_id uuid,                                   -- auth user id, if any
  action        text NOT NULL CHECK (action IN (
                  'client_created','invitation_sent','invitation_resent',
                  'invitation_accepted','invitation_cancelled','membership_disabled',
                  'membership_reactivated','membership_revoked','gallery_assigned',
                  'gallery_unassigned','gallery_reassigned','portal_access',
                  'password_reset_requested','production_access_denied')),
  target_type   text,                                   -- 'gallery' | 'membership' | 'client' | ...
  target_id     uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,     -- non-secret only
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_client_access_audit_biz_client
  ON public.client_access_audit (business_id, client_id, created_at DESC);

ALTER TABLE public.client_access_audit ENABLE ROW LEVEL SECURITY;

-- Owner may READ their own business's audit rows (for the client detail activity
-- panel). No write policy → inserts happen only via the definer RPC below.
DROP POLICY IF EXISTS client_access_audit_owner_select ON public.client_access_audit;
CREATE POLICY client_access_audit_owner_select ON public.client_access_audit
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- Append helper. SECURITY DEFINER + service_role only — called by the server
-- AFTER it has authorized the action. Validates action against the CHECK by
-- inserting (a bad action raises). Returns the new row id.
CREATE OR REPLACE FUNCTION public.append_client_audit(
  p_business_id   uuid,
  p_client_id     uuid,
  p_actor_type    text,
  p_actor_user_id uuid,
  p_action        text,
  p_target_type   text DEFAULT NULL,
  p_target_id     uuid DEFAULT NULL,
  p_metadata      jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

REVOKE EXECUTE ON FUNCTION public.append_client_audit(uuid,uuid,text,uuid,text,text,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.append_client_audit(uuid,uuid,text,uuid,text,text,uuid,jsonb)
  TO service_role;

COMMIT;

-- Verification (manual):
--   SET ROLE anon; SELECT count(*) FROM public.client_access_audit;  -- 0 (fail closed)
--   RESET ROLE;
