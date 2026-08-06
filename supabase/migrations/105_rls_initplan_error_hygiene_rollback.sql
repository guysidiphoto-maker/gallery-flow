-- 103_rls_initplan_error_hygiene_rollback.sql
--
-- Reverses 103 by recreating every affected policy with its ORIGINAL bare
-- `auth.uid()` form (copied verbatim from migrations 096 / 099 / 100). QA-only,
-- additive/reversible, purely a performance/lint hardening reversal — NO
-- semantic change (the wrapped and bare forms are logically identical; this
-- rollback only removes the InitPlan caching so the tree matches 096/099/100).
--
-- Idempotent: DROP IF EXISTS then CREATE for each policy, same names.

BEGIN;

-- ============================================================
-- 096 onboarding_progress — self policies (original bare form)
-- ============================================================
DROP POLICY IF EXISTS onboarding_progress_self_select ON public.onboarding_progress;
CREATE POLICY onboarding_progress_self_select ON public.onboarding_progress
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS onboarding_progress_self_insert ON public.onboarding_progress;
CREATE POLICY onboarding_progress_self_insert ON public.onboarding_progress
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS onboarding_progress_self_update ON public.onboarding_progress;
CREATE POLICY onboarding_progress_self_update ON public.onboarding_progress
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 099 import_center — owner-select policies (original bare form)
-- ============================================================
DROP POLICY IF EXISTS import_sources_owner_select ON public.import_sources;
CREATE POLICY import_sources_owner_select ON public.import_sources
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS import_jobs_owner_select ON public.import_jobs;
CREATE POLICY import_jobs_owner_select ON public.import_jobs
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS import_collections_owner_select ON public.import_collections;
CREATE POLICY import_collections_owner_select ON public.import_collections
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS import_files_owner_select ON public.import_files;
CREATE POLICY import_files_owner_select ON public.import_files
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- ============================================================
-- 100 tender_collections — owner-all policy (original bare form)
-- ============================================================
DROP POLICY IF EXISTS tender_collections_owner_all ON public.tender_collections;
CREATE POLICY tender_collections_owner_all ON public.tender_collections
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- ============================================================
-- 100 tender_collection_items — owner select/delete/insert/update (bare form)
-- ============================================================
DROP POLICY IF EXISTS tender_items_owner_select ON public.tender_collection_items;
CREATE POLICY tender_items_owner_select ON public.tender_collection_items
  FOR SELECT TO authenticated
  USING (collection_id IN (
    SELECT tc.id FROM public.tender_collections tc
    WHERE tc.business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())));

DROP POLICY IF EXISTS tender_items_owner_delete ON public.tender_collection_items;
CREATE POLICY tender_items_owner_delete ON public.tender_collection_items
  FOR DELETE TO authenticated
  USING (collection_id IN (
    SELECT tc.id FROM public.tender_collections tc
    WHERE tc.business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())));

DROP POLICY IF EXISTS tender_items_owner_insert ON public.tender_collection_items;
CREATE POLICY tender_items_owner_insert ON public.tender_collection_items
  FOR INSERT TO authenticated
  WITH CHECK (
    collection_id IN (
      SELECT tc.id FROM public.tender_collections tc
      WHERE tc.business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
    AND gallery_id IN (
      SELECT g.id FROM public.galleries g
      WHERE g.business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
    AND (image_id IS NULL OR image_id IN (
      SELECT i.id FROM public.images i WHERE i.gallery_id = tender_collection_items.gallery_id))
  );

DROP POLICY IF EXISTS tender_items_owner_update ON public.tender_collection_items;
CREATE POLICY tender_items_owner_update ON public.tender_collection_items
  FOR UPDATE TO authenticated
  USING (collection_id IN (
    SELECT tc.id FROM public.tender_collections tc
    WHERE tc.business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())))
  WITH CHECK (
    collection_id IN (
      SELECT tc.id FROM public.tender_collections tc
      WHERE tc.business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
    AND gallery_id IN (
      SELECT g.id FROM public.galleries g
      WHERE g.business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
    AND (image_id IS NULL OR image_id IN (
      SELECT i.id FROM public.images i WHERE i.gallery_id = tender_collection_items.gallery_id))
  );

COMMIT;
