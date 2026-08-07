-- 095_client_member_read_policies.sql — Client Portal V2: let AUTHENTICATED client
-- members read their assigned clients' LIVE content.
--
-- BUG (found in browser QA): the client portal (ClientDashboard) reads galleries/
-- images/sections/stories with the member's authenticated session, but the only
-- live-content read policies are `*_public_live_select` scoped `TO anon`. A
-- logged-in member is the `authenticated` role, so those policies don't apply and
-- the portal showed "No galleries found". These additive policies grant an
-- authenticated member SELECT on the LIVE galleries (+ their images/sections/
-- stories) of clients where they hold an ACTIVE membership — nothing else. Draft
-- galleries stay hidden (status='live' predicate); cross-client/business content
-- stays blocked (membership scoping). Additive; owner/anon policies untouched.
--
-- NOT APPLIED to prod by this program. Paired rollback: 095_..._rollback.sql

BEGIN;

DROP POLICY IF EXISTS galleries_member_select ON public.galleries;
CREATE POLICY galleries_member_select ON public.galleries
  FOR SELECT TO authenticated
  USING (status = 'live' AND client_id IN (
    SELECT m.client_id FROM public.client_memberships m
    WHERE m.auth_user_id = auth.uid() AND m.status = 'active'));

DROP POLICY IF EXISTS images_member_select ON public.images;
CREATE POLICY images_member_select ON public.images
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.galleries g
    JOIN public.client_memberships m ON m.client_id = g.client_id
    WHERE g.id = images.gallery_id AND g.status = 'live'
      AND m.auth_user_id = auth.uid() AND m.status = 'active'));

DROP POLICY IF EXISTS sections_member_select ON public.gallery_sections;
CREATE POLICY sections_member_select ON public.gallery_sections
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.galleries g
    JOIN public.client_memberships m ON m.client_id = g.client_id
    WHERE g.id = gallery_sections.gallery_id AND g.status = 'live'
      AND m.auth_user_id = auth.uid() AND m.status = 'active'));

DROP POLICY IF EXISTS stories_member_select ON public.stories;
CREATE POLICY stories_member_select ON public.stories
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.galleries g
    JOIN public.client_memberships m ON m.client_id = g.client_id
    WHERE g.id = stories.gallery_id AND g.status = 'live'
      AND m.auth_user_id = auth.uid() AND m.status = 'active'));

COMMIT;

-- Verification: a disabled/revoked member (status <> 'active') matches none of
-- these, so access is lost immediately — consistent with client_portal_bootstrap.
