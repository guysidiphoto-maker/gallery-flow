-- ─────────────────────────────────────────────────────────────────────────────
-- 006_rls_policies.sql
-- Replaces the temporary USING(true) policies from migration 002 with strict
-- ownership-based policies, and locks down every other table.
-- Safe to run on existing data: NO rows are inserted, updated or deleted.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Drop the permissive policies from 002_businesses.sql ────────────────────
DROP POLICY IF EXISTS "Public slug check"        ON businesses;
DROP POLICY IF EXISTS "Users insert own business" ON businesses;
DROP POLICY IF EXISTS "Users update own business" ON businesses;

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- The current user's business id, used by every child policy below.
-- NOTE: must NOT be SECURITY DEFINER. When this function is called from inside
-- a nested EXISTS subquery in another table's RLS policy (e.g. images,
-- gallery_sections, stories), the SECURITY DEFINER + STABLE combo can cause
-- the JWT/auth.uid() context to resolve to NULL inside the nested call, even
-- though it works at the outer call site. Running as the invoker keeps the
-- JWT context consistent and lets Postgres inline the function. The owner
-- can still read their own businesses row via the businesses_owner_select
-- policy below, so SECURITY INVOKER is safe here.
CREATE OR REPLACE FUNCTION current_business_id()
RETURNS UUID
LANGUAGE SQL STABLE
AS $$
  SELECT id FROM businesses WHERE user_id = auth.uid() LIMIT 1
$$;

-- Public slug-availability check used by onboarding (replaces a public SELECT
-- on the businesses table). Returns just a boolean — no row exposure.
CREATE OR REPLACE FUNCTION is_business_slug_taken(p_slug TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM businesses WHERE LOWER(slug) = LOWER(p_slug))
$$;
GRANT EXECUTE ON FUNCTION is_business_slug_taken(TEXT) TO anon, authenticated;

-- ── businesses ──────────────────────────────────────────────────────────────
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY businesses_owner_select ON businesses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY businesses_owner_insert ON businesses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY businesses_owner_update ON businesses
  FOR UPDATE TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- (no DELETE policy; deletion goes through a server function in the future)

-- ── galleries ───────────────────────────────────────────────────────────────
ALTER TABLE galleries ENABLE ROW LEVEL SECURITY;

-- Authenticated owner: full CRUD scoped to their own business.
CREATE POLICY galleries_owner_all ON galleries
  FOR ALL TO authenticated
  USING      (business_id = current_business_id())
  WITH CHECK (business_id = current_business_id());

-- Public viewer: live galleries only (the gallery-web app uses anon key).
CREATE POLICY galleries_public_live_select ON galleries
  FOR SELECT TO anon
  USING (status = 'live');

-- ── images ──────────────────────────────────────────────────────────────────
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

CREATE POLICY images_owner_all ON images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = images.gallery_id
        AND g.business_id = current_business_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = images.gallery_id
        AND g.business_id = current_business_id()
    )
  );

CREATE POLICY images_public_live_select ON images
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = images.gallery_id AND g.status = 'live'
    )
  );

-- ── stories ─────────────────────────────────────────────────────────────────
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY stories_owner_all ON stories
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = stories.gallery_id
        AND g.business_id = current_business_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = stories.gallery_id
        AND g.business_id = current_business_id()
    )
  );

CREATE POLICY stories_public_live_select ON stories
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = stories.gallery_id AND g.status = 'live'
    )
  );

-- ── clients ─────────────────────────────────────────────────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_owner_all ON clients
  FOR ALL TO authenticated
  USING      (business_id = current_business_id())
  WITH CHECK (business_id = current_business_id());

COMMIT;
