-- 098_search_rpcs_rollback.sql — undo 098_search_rpcs.sql.
--
-- Drops the RPC and the indexes added by 098. Deliberately does NOT drop the
-- pg_trgm extension: it is shared infrastructure and other objects may depend
-- on it by the time a rollback runs.

BEGIN;

DROP FUNCTION IF EXISTS public.search_owner_content(text, jsonb);

DROP INDEX IF EXISTS public.galleries_name_trgm_idx;
DROP INDEX IF EXISTS public.clients_name_trgm_idx;
DROP INDEX IF EXISTS public.galleries_event_type_filter_idx;
DROP INDEX IF EXISTS public.galleries_event_size_bucket_idx;
DROP INDEX IF EXISTS public.galleries_industry_idx;

COMMIT;
