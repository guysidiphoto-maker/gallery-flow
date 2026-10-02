-- 091_client_portal_rpcs_rollback.sql — reverse 091_client_portal_rpcs.sql.
BEGIN;
DROP FUNCTION IF EXISTS public.cpv2_accept_invitation(text,uuid,citext);
DROP FUNCTION IF EXISTS public.cpv2_set_membership_status(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.cpv2_unassign_gallery(uuid,uuid);
DROP FUNCTION IF EXISTS public.cpv2_assign_gallery(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public.client_portal_bootstrap();
COMMIT;
