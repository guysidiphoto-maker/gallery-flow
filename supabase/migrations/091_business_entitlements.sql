-- 089_business_entitlements.sql — Client Portal V2: Production Suite entitlement.
--
-- Introduces a billing-INDEPENDENT capability layer. It does NOT modify
-- subscriptions, plans, checkout, or any payment record. It is the single
-- canonical source for "may this business use the advanced (Production) modules".
--
-- Capability used by this program: 'production_suite'.
-- Default is DENY: absence of an active row → false.
--
-- Provenance (`source`) records where an entitlement came from (manual grant,
-- plan mapping, promo) purely for auditability; it never writes back to billing.
-- A future migration may auto-populate rows from plans without changing the
-- resolver signature below.
--
-- NOT APPLIED by this program. Paired rollback: 089_business_entitlements_rollback.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.business_entitlements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  capability   text NOT NULL,
  active       boolean NOT NULL DEFAULT false,          -- default deny
  source       text NOT NULL DEFAULT 'manual'
                 CHECK (source IN ('manual','plan','grant')),
  expires_at   timestamptz,                             -- NULL = no expiry
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, capability)
);
CREATE INDEX IF NOT EXISTS ix_business_entitlements_biz
  ON public.business_entitlements (business_id);

DROP TRIGGER IF EXISTS trg_business_entitlements_updated_at ON public.business_entitlements;
CREATE TRIGGER trg_business_entitlements_updated_at
  BEFORE UPDATE ON public.business_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.cpv2_set_updated_at();

ALTER TABLE public.business_entitlements ENABLE ROW LEVEL SECURITY;

-- Owner may READ their own entitlement rows (to render nav). Cannot self-grant:
-- there is no INSERT/UPDATE policy, so a business can never activate its own
-- entitlement from the browser. Grants happen server-side (service_role) only.
DROP POLICY IF EXISTS business_entitlements_owner_select ON public.business_entitlements;
CREATE POLICY business_entitlements_owner_select ON public.business_entitlements
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- ============================================================
-- Canonical resolver — the ONE truth for entitlement checks.
-- SECURITY DEFINER so it can read regardless of the caller's RLS, but it takes
-- an explicit business_id and returns only a boolean (no data leak). Callers
-- MUST have independently verified that the caller owns/【is scoped to】
-- p_business_id before trusting a `true` for access decisions.
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_business_entitlement(
  p_business_id uuid,
  p_capability  text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_entitlements be
    WHERE be.business_id = p_business_id
      AND be.capability  = p_capability
      AND be.active      = true
      AND (be.expires_at IS NULL OR be.expires_at > now())
  );
$$;

-- Owner-facing convenience: resolve the caller's OWN entitlements. Uses auth.uid()
-- internally, so there is no way to probe another business.
CREATE OR REPLACE FUNCTION public.my_business_entitlements()
RETURNS TABLE (capability text, active boolean, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT be.capability, be.active, be.expires_at
  FROM public.business_entitlements be
  JOIN public.businesses b ON b.id = be.business_id
  WHERE b.user_id = auth.uid()
    AND be.active = true
    AND (be.expires_at IS NULL OR be.expires_at > now());
$$;

-- ── Least privilege ─────────────────────────────────────────────────────────
-- has_business_entitlement takes an arbitrary business_id, so restrict it to the
-- SERVER (service_role) — the browser must not probe arbitrary businesses.
REVOKE EXECUTE ON FUNCTION public.has_business_entitlement(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.has_business_entitlement(uuid, text)
  TO service_role;
-- my_business_entitlements is self-scoped → safe for the authenticated owner.
REVOKE EXECUTE ON FUNCTION public.my_business_entitlements() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_business_entitlements() TO authenticated, service_role;

COMMIT;

-- ============================================================
-- Verification (manual, after a controlled apply):
--   -- non-entitled business → false
--   SELECT public.has_business_entitlement('<biz-uuid>', 'production_suite');  -- f
--   -- grant a test entitlement (server/service_role only):
--   INSERT INTO public.business_entitlements (business_id, capability, active, source)
--     VALUES ('<biz-uuid>', 'production_suite', true, 'manual')
--     ON CONFLICT (business_id, capability) DO UPDATE SET active = true;
--   SELECT public.has_business_entitlement('<biz-uuid>', 'production_suite');  -- t
--   -- expired row → false
--   UPDATE public.business_entitlements SET expires_at = now() - interval '1 day'
--     WHERE business_id='<biz-uuid>' AND capability='production_suite';
--   SELECT public.has_business_entitlement('<biz-uuid>', 'production_suite');  -- f
--   -- browser cannot probe:  SET ROLE authenticated; SELECT has_business_entitlement(...);  -- permission denied
-- ============================================================
