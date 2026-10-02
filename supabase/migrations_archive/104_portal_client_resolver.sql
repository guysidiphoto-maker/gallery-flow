-- 102_portal_client_resolver.sql — Client Portal V2: short-URL slug resolvers.
--
-- Problem: the short client-portal route /:businessSlug/c/:clientSlug fails with
-- "Business not found" because ClientDashboard resolves business+client by
-- querying the owner-RLS-scoped `businesses`/`clients` tables under the MEMBER
-- session. A client member cannot read those tables, so resolution returns
-- nothing. Fix: two narrowly-scoped SECURITY DEFINER resolvers that map slugs
-- (or a legacy client UUID) to the minimal ids/names the portal needs — and
-- ONLY for a caller who has an ACTIVE membership on the resolved client.
--
-- Enumeration defense: both functions are MEMBERSHIP-GATED. A row is returned
-- ONLY when the current auth.uid() has an active client_memberships row for the
-- resolved client. A caller learns NOTHING about businesses/clients they don't
-- belong to (fail closed → zero enumeration). No dynamic SQL — bound params
-- only. Only the five minimal fields are exposed (business display name, slugs,
-- ids). NEVER business settings, user_id, billing, access codes, or emails.
--
-- QA-only, additive, idempotent (CREATE OR REPLACE + guarded REVOKE/GRANT).
-- NOT APPLIED by this program. Paired rollback: 102_portal_client_resolver_rollback.sql

BEGIN;

-- ============================================================
-- 1) resolve_client_portal(business_slug, client_slug)
--    Authenticated, membership-gated. Slug → ids for the short URL.
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_client_portal(
  p_business_slug text,
  p_client_slug   text
) RETURNS TABLE(
  business_id   uuid,
  client_id     uuid,
  business_name text,
  business_slug text,
  client_slug   text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH input AS (
    -- Trim + lower-case; reject null/empty/oversized slugs (fail closed → no rows).
    SELECT
      lower(btrim(p_business_slug)) AS b_slug,
      lower(btrim(p_client_slug))   AS c_slug
    WHERE p_business_slug IS NOT NULL
      AND p_client_slug   IS NOT NULL
      AND btrim(p_business_slug) <> ''
      AND btrim(p_client_slug)   <> ''
      AND length(p_business_slug) <= 200
      AND length(p_client_slug)   <= 200
  )
  SELECT
    b.id            AS business_id,
    c.id            AS client_id,
    b.business_name AS business_name,
    b.slug          AS business_slug,
    c.slug          AS client_slug
  FROM input i
  JOIN public.businesses b
    ON lower(b.slug) = i.b_slug
  JOIN public.clients c
    ON c.business_id = b.id
   AND lower(c.slug) = i.c_slug
  -- MEMBERSHIP GATE: only if the current caller actively belongs to this client.
  JOIN public.client_memberships m
    ON m.client_id = c.id
   AND m.auth_user_id = (SELECT auth.uid())
   AND m.status = 'active'
$$;

-- ============================================================
-- 2) resolve_client_portal_by_id(client_id)
--    Authenticated, membership-gated. Legacy UUID → slugs for URL canonicalization.
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_client_portal_by_id(
  p_client_id uuid
) RETURNS TABLE(
  business_slug text,
  client_slug   text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    b.slug AS business_slug,
    c.slug AS client_slug
  FROM public.clients c
  JOIN public.businesses b
    ON b.id = c.business_id
  -- SAME membership gate: caller must actively belong to this client.
  JOIN public.client_memberships m
    ON m.client_id = c.id
   AND m.auth_user_id = (SELECT auth.uid())
   AND m.status = 'active'
  WHERE p_client_id IS NOT NULL
    AND c.id = p_client_id
$$;

-- ── Least privilege: authenticated + service_role only; never anon/PUBLIC ────
-- (anon/legacy-PIN clients use a different flow and are out of scope here.)
REVOKE EXECUTE ON FUNCTION public.resolve_client_portal(text,text)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_client_portal_by_id(uuid)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_client_portal(text,text)   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.resolve_client_portal_by_id(uuid)  TO authenticated, service_role;

COMMIT;

-- ============================================================
-- Verification (manual, after a controlled apply to QA):
--   -- memberA1 (active member of client A1) resolving A1 → exactly one row:
--   --   SET request.jwt.claim.sub = '<memberA1 uuid>' ; SET ROLE authenticated;
--   SELECT * FROM public.resolve_client_portal('<bizA-slug>','<clientA1-slug>');   -- 1 row
--   -- memberA1 resolving a client of ANOTHER business → ZERO rows (no enumeration):
--   SELECT * FROM public.resolve_client_portal('<bizC-slug>','<clientC1-slug>');   -- 0 rows
--   -- anon has no EXECUTE (revoked); if forced, auth.uid() IS NULL → 0 rows anyway.
--   -- empty / oversized / SQL-ish slug → 0 rows, no injection (bound params only):
--   SELECT * FROM public.resolve_client_portal('', '');                            -- 0 rows
--   SELECT * FROM public.resolve_client_portal(repeat('a',201), 'x');              -- 0 rows
--   SELECT * FROM public.resolve_client_portal($$a' or '1'='1$$, $$b' or '1'='1$$);-- 0 rows
--   -- legacy uuid canonicalizer, member of the client → 1 row of (slug,slug):
--   SELECT * FROM public.resolve_client_portal_by_id('<clientA1 uuid>');           -- 1 row
--   -- non-member uuid → 0 rows.
--   RESET ROLE;
-- ============================================================
