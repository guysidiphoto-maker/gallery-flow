-- 090_client_access_audit_rollback.sql — reverse 090_client_access_audit.sql.
BEGIN;
DROP FUNCTION IF EXISTS public.append_client_audit(uuid,uuid,text,uuid,text,text,uuid,jsonb);
DROP TABLE IF EXISTS public.client_access_audit;
COMMIT;
