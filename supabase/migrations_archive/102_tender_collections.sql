-- 100_tender_collections.sql — Overnight 2026-07-24, contract C6.
--
-- Owner-side tender collections: a photographer/production owner curates
-- galleries + individual images into named collections while answering a
-- tender/brief. Simple owner-owned data → per contract C6 the browser MAY
-- write directly under RLS (unlike the client-portal tables, which are
-- service-role-only).
--
--   tender_collections       id, business_id, name, brief jsonb, timestamps
--   tender_collection_items  id, collection_id (fk cascade), gallery_id,
--                            image_id NULL, added_at
--                            UNIQUE(collection_id, gallery_id, image_id)
--
-- RLS: authenticated owner of the business gets SELECT/INSERT/UPDATE/DELETE.
-- Anon: no policies → fail closed. Item writes additionally verify that the
-- gallery (and image, when present) belong to the SAME business, so an owner
-- can never attach another tenant's content to their collection.
--
-- Idempotent, 088–095 style. NOT APPLIED by this program (QA project only).
-- Paired rollback: 100_tender_collections_rollback.sql

BEGIN;

-- ============================================================
-- tender_collections
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tender_collections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  brief        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tender_collections_business
  ON public.tender_collections (business_id, created_at DESC);

-- Reuse the shared updated_at trigger fn from migration 088.
DROP TRIGGER IF EXISTS trg_tender_collections_updated_at ON public.tender_collections;
CREATE TRIGGER trg_tender_collections_updated_at
  BEFORE UPDATE ON public.tender_collections
  FOR EACH ROW EXECUTE FUNCTION public.cpv2_set_updated_at();

ALTER TABLE public.tender_collections ENABLE ROW LEVEL SECURITY;

-- Owner-only, all verbs. business_id can never point at a foreign tenant
-- because WITH CHECK re-verifies ownership on INSERT and UPDATE.
DROP POLICY IF EXISTS tender_collections_owner_all ON public.tender_collections;
CREATE POLICY tender_collections_owner_all ON public.tender_collections
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- ============================================================
-- tender_collection_items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tender_collection_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.tender_collections(id) ON DELETE CASCADE,
  gallery_id    uuid NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  image_id      uuid REFERENCES public.images(id) ON DELETE CASCADE,  -- NULL = whole-gallery item
  added_at      timestamptz NOT NULL DEFAULT now()
);

-- Contract C6 asks UNIQUE(collection_id, gallery_id, image_id). A plain UNIQUE
-- constraint would NOT dedupe the image_id IS NULL (whole-gallery) rows because
-- SQL treats NULLs as distinct — so we implement the intent with two partial
-- unique indexes that together cover both shapes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tender_items_gallery_level
  ON public.tender_collection_items (collection_id, gallery_id)
  WHERE image_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_tender_items_image_level
  ON public.tender_collection_items (collection_id, gallery_id, image_id)
  WHERE image_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_tender_items_collection
  ON public.tender_collection_items (collection_id, added_at);
CREATE INDEX IF NOT EXISTS ix_tender_items_gallery
  ON public.tender_collection_items (gallery_id);

ALTER TABLE public.tender_collection_items ENABLE ROW LEVEL SECURITY;

-- Read/delete: owner of the collection's business.
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

-- Insert: collection must be the owner's AND the referenced gallery must belong
-- to the same owner's business AND, when an image is attached, it must belong
-- to that exact gallery. Cross-tenant references fail closed at the policy.
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

-- Update: items are add/remove only from the UI, but allow the owner to fix a
-- row under the same cross-tenant guards (symmetry with the insert policy).
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

-- No anon policies on either table → anon fails closed.

COMMIT;

-- Verification (manual, after apply):
--   SET ROLE anon;  SELECT count(*) FROM public.tender_collections;        -- permission/0 rows
--   SET ROLE anon;  SELECT count(*) FROM public.tender_collection_items;   -- permission/0 rows
--   RESET ROLE;
--   SELECT relrowsecurity FROM pg_class WHERE relname IN
--     ('tender_collections','tender_collection_items');                    -- t, t
--   -- As owner A: INSERT item referencing owner B's gallery → RLS violation.
