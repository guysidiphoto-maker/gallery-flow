-- 103_rls_initplan_error_hygiene.sql — QA-only RLS initplan hardening.
--
-- PURELY a performance/lint hardening. NO semantic change. Every policy below
-- keeps its EXACT name and EXACT USING / WITH CHECK logic; the only difference
-- is that each bare `auth.uid()` is wrapped as `(select auth.uid())`. Postgres
-- then evaluates auth.uid() ONCE per statement (an InitPlan, cached) instead of
-- re-running the function for every scanned row. This is the pattern the
-- Supabase "Auth RLS Initialization Plan" advisor recommends; it silences that
-- lint on the CPV2 tables added in migrations 096 / 099 / 100.
--
-- Additive + reversible: for every affected policy we DROP IF EXISTS then
-- CREATE with the wrapped form, idempotently. Grants are NOT touched here
-- (tender grants were handled in 101; onboarding/import grants live in 096/099).
--
-- Apply order: AFTER 102 (coordinator applies to QA only). NOT applied to any
-- environment by this program. Paired rollback restores the original bare
-- `auth.uid()` form byte-for-byte.
--
-- Paired rollback: 103_rls_initplan_error_hygiene_rollback.sql

BEGIN;

-- ============================================================
-- 096 onboarding_progress — self policies (SELECT/INSERT/UPDATE)
-- ============================================================
DROP POLICY IF EXISTS onboarding_progress_self_select ON public.onboarding_progress;
CREATE POLICY onboarding_progress_self_select ON public.onboarding_progress
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS onboarding_progress_self_insert ON public.onboarding_progress;
CREATE POLICY onboarding_progress_self_insert ON public.onboarding_progress
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS onboarding_progress_self_update ON public.onboarding_progress;
CREATE POLICY onboarding_progress_self_update ON public.onboarding_progress
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================
-- 099 import_center — owner-select policies (4 tables)
-- ============================================================
DROP POLICY IF EXISTS import_sources_owner_select ON public.import_sources;
CREATE POLICY import_sources_owner_select ON public.import_sources
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS import_jobs_owner_select ON public.import_jobs;
CREATE POLICY import_jobs_owner_select ON public.import_jobs
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS import_collections_owner_select ON public.import_collections;
CREATE POLICY import_collections_owner_select ON public.import_collections
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS import_files_owner_select ON public.import_files;
CREATE POLICY import_files_owner_select ON public.import_files
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid())));

-- ============================================================
-- 100 tender_collections — owner-all policy
-- ============================================================
DROP POLICY IF EXISTS tender_collections_owner_all ON public.tender_collections;
CREATE POLICY tender_collections_owner_all ON public.tender_collections
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid())))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid())));

-- ============================================================
-- 100 tender_collection_items — owner select/delete/insert/update
-- ============================================================
DROP POLICY IF EXISTS tender_items_owner_select ON public.tender_collection_items;
CREATE POLICY tender_items_owner_select ON public.tender_collection_items
  FOR SELECT TO authenticated
  USING (collection_id IN (
    SELECT tc.id FROM public.tender_collections tc
    WHERE tc.business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid()))));

DROP POLICY IF EXISTS tender_items_owner_delete ON public.tender_collection_items;
CREATE POLICY tender_items_owner_delete ON public.tender_collection_items
  FOR DELETE TO authenticated
  USING (collection_id IN (
    SELECT tc.id FROM public.tender_collections tc
    WHERE tc.business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid()))));

DROP POLICY IF EXISTS tender_items_owner_insert ON public.tender_collection_items;
CREATE POLICY tender_items_owner_insert ON public.tender_collection_items
  FOR INSERT TO authenticated
  WITH CHECK (
    collection_id IN (
      SELECT tc.id FROM public.tender_collections tc
      WHERE tc.business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid())))
    AND gallery_id IN (
      SELECT g.id FROM public.galleries g
      WHERE g.business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid())))
    AND (image_id IS NULL OR image_id IN (
      SELECT i.id FROM public.images i WHERE i.gallery_id = tender_collection_items.gallery_id))
  );

DROP POLICY IF EXISTS tender_items_owner_update ON public.tender_collection_items;
CREATE POLICY tender_items_owner_update ON public.tender_collection_items
  FOR UPDATE TO authenticated
  USING (collection_id IN (
    SELECT tc.id FROM public.tender_collections tc
    WHERE tc.business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid()))))
  WITH CHECK (
    collection_id IN (
      SELECT tc.id FROM public.tender_collections tc
      WHERE tc.business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid())))
    AND gallery_id IN (
      SELECT g.id FROM public.galleries g
      WHERE g.business_id IN (SELECT id FROM public.businesses WHERE user_id = (select auth.uid())))
    AND (image_id IS NULL OR image_id IN (
      SELECT i.id FROM public.images i WHERE i.gallery_id = tender_collection_items.gallery_id))
  );

COMMIT;

-- ============================================================
-- Verification (run manually AFTER a controlled apply; NOT in this program)
-- ============================================================
--   -- Every policy still exists with the same name, now InitPlan-cached:
--   SELECT tablename, policyname FROM pg_policies
--     WHERE tablename IN ('onboarding_progress','import_sources','import_jobs',
--       'import_collections','import_files','tender_collections',
--       'tender_collection_items')
--     ORDER BY tablename, policyname;
--   -- The advisor "Auth RLS Initialization Plan" warning for these tables is gone.
--   -- Semantics unchanged: anon still blocked, owners still see only their rows.
