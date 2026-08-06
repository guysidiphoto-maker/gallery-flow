-- 088_client_memberships.sql — Client Portal V2: authenticated membership model.
--
-- Adds two ADDITIVE tables that let one or more Supabase-authenticated users
-- belong to a photographer/production `clients` row, replacing the PIN-only
-- access path (migration 057) with real accounts. Nothing here drops or weakens
-- existing objects; the legacy PIN tables/RPCs remain untouched.
--
-- Scope guarantees:
--   • one person may belong to MANY clients (auth_user_id unique only per client)
--   • every membership is scoped to BOTH business_id and client_id
--   • all MUTATIONS happen via SECURITY DEFINER RPCs (migration 091); the RLS
--     here only grants READ (owner sees their clients' rows; member sees own).
--   • invitation tokens are stored ONLY as sha256 hashes, never in plaintext.
--
-- NOT APPLIED to any environment by this program. Paired rollback:
--   088_client_memberships_rollback.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared updated_at trigger (uniquely named to avoid clobbering any existing fn).
CREATE OR REPLACE FUNCTION public.cpv2_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ============================================================
-- client_memberships
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.clients(id)    ON DELETE CASCADE,
  auth_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,   -- NULL until accepted
  email         citext NOT NULL,
  role          text NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('client_admin','approver','viewer')),
  status        text NOT NULL DEFAULT 'invited'
                  CHECK (status IN ('invited','active','disabled','revoked')),
  invited_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  last_access_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One membership per email per client. One auth user per client (when bound).
CREATE UNIQUE INDEX IF NOT EXISTS ux_client_memberships_client_email
  ON public.client_memberships (client_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS ux_client_memberships_client_user
  ON public.client_memberships (client_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_client_memberships_auth_user
  ON public.client_memberships (auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_client_memberships_business
  ON public.client_memberships (business_id);
CREATE INDEX IF NOT EXISTS ix_client_memberships_client_status
  ON public.client_memberships (client_id, status);

DROP TRIGGER IF EXISTS trg_client_memberships_updated_at ON public.client_memberships;
CREATE TRIGGER trg_client_memberships_updated_at
  BEFORE UPDATE ON public.client_memberships
  FOR EACH ROW EXECUTE FUNCTION public.cpv2_set_updated_at();

ALTER TABLE public.client_memberships ENABLE ROW LEVEL SECURITY;

-- Owner may READ memberships of clients belonging to their own business.
DROP POLICY IF EXISTS client_memberships_owner_select ON public.client_memberships;
CREATE POLICY client_memberships_owner_select ON public.client_memberships
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- Authenticated member may READ only their OWN membership rows.
DROP POLICY IF EXISTS client_memberships_self_select ON public.client_memberships;
CREATE POLICY client_memberships_self_select ON public.client_memberships
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies → all writes go through SECURITY DEFINER
-- RPCs (migration 091). Anon has no access at all (fail closed).

-- ============================================================
-- client_invitations  (token stored as sha256 hash ONLY)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.client_memberships(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.clients(id)    ON DELETE CASCADE,
  email         citext NOT NULL,
  token_hash    text NOT NULL,                          -- sha256(raw_token); raw never stored
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','cancelled','expired')),
  expires_at    timestamptz NOT NULL,
  resent_count  int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_client_invitations_token_hash
  ON public.client_invitations (token_hash);
CREATE INDEX IF NOT EXISTS ix_client_invitations_membership
  ON public.client_invitations (membership_id);
CREATE INDEX IF NOT EXISTS ix_client_invitations_business_client
  ON public.client_invitations (business_id, client_id);
CREATE INDEX IF NOT EXISTS ix_client_invitations_email
  ON public.client_invitations (email);

ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;

-- Owner may READ invitations for their own business (to show status). The
-- token_hash column is never returned to the browser by the manager UI (the
-- owner APIs select explicit columns). Members never read this table directly;
-- acceptance is resolved by a definer RPC that matches the raw token's hash.
DROP POLICY IF EXISTS client_invitations_owner_select ON public.client_invitations;
CREATE POLICY client_invitations_owner_select ON public.client_invitations
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
-- No write policies → definer RPCs only. Anon blocked.

COMMIT;

-- ============================================================
-- Verification (run manually AFTER a controlled apply; NOT in this program)
-- ============================================================
--   SELECT to_regclass('public.client_memberships');    -- table exists
--   SELECT to_regclass('public.client_invitations');    -- table exists
--   -- anon must see zero rows:
--   SET ROLE anon;   SELECT count(*) FROM public.client_memberships;  -- 0
--   SET ROLE anon;   SELECT count(*) FROM public.client_invitations;  -- 0
--   RESET ROLE;
--   -- RLS enabled:
--   SELECT relrowsecurity FROM pg_class WHERE relname='client_memberships'; -- t
