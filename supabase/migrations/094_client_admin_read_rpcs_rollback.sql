-- 092_client_admin_read_rpcs_rollback.sql — reverse 092.
BEGIN;
DROP FUNCTION IF EXISTS public.cpv2_owner_client_detail(uuid);
DROP FUNCTION IF EXISTS public.cpv2_owner_assignable_galleries();
DROP FUNCTION IF EXISTS public.cpv2_owner_clients_overview();
COMMIT;
