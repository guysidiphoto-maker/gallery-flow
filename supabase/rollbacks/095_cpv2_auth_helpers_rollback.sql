-- 093_cpv2_auth_helpers_rollback.sql — reverse 093.
BEGIN;
DROP FUNCTION IF EXISTS public.cpv2_auth_user_id_by_email(text);
COMMIT;
