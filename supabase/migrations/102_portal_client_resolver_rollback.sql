-- 102_portal_client_resolver_rollback.sql — reverse 102_portal_client_resolver.sql.
BEGIN;
DROP FUNCTION IF EXISTS public.resolve_client_portal_by_id(uuid);
DROP FUNCTION IF EXISTS public.resolve_client_portal(text,text);
COMMIT;
