-- 100_tender_collections_rollback.sql — reverse 100_tender_collections.sql.
--
-- Drops the two tender tables (policies, triggers and indexes drop with them).
-- The shared trigger fn public.cpv2_set_updated_at belongs to migration 088
-- and is NOT dropped here.

BEGIN;

DROP TABLE IF EXISTS public.tender_collection_items;
DROP TABLE IF EXISTS public.tender_collections;

COMMIT;
