-- 099_import_center_rollback.sql — undo migration 099 (Import Center tables).
--
-- Drops ONLY the objects created by 099. Does NOT touch client_access_audit
-- (its CHECK extension lives in 097 and rolls back there), galleries, images,
-- storage objects, or the shared cpv2_set_updated_at() function (owned by 088).
--
-- Uploaded photos are NOT deleted by this rollback — import_files is pure
-- bookkeeping; the images/storage rows created through the normal upload
-- pipeline remain intact by design.

BEGIN;

DROP TABLE IF EXISTS public.import_files       CASCADE;
DROP TABLE IF EXISTS public.import_collections CASCADE;
DROP TABLE IF EXISTS public.import_jobs        CASCADE;
DROP TABLE IF EXISTS public.import_sources     CASCADE;

COMMIT;

-- Verification:
--   SELECT to_regclass('public.import_sources');      -- NULL
--   SELECT to_regclass('public.import_jobs');         -- NULL
--   SELECT to_regclass('public.import_collections');  -- NULL
--   SELECT to_regclass('public.import_files');        -- NULL
