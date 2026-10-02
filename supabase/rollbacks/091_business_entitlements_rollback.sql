-- 089_business_entitlements_rollback.sql — reverse 089_business_entitlements.sql.
BEGIN;
DROP FUNCTION IF EXISTS public.my_business_entitlements();
DROP FUNCTION IF EXISTS public.has_business_entitlement(uuid, text);
DROP TRIGGER IF EXISTS trg_business_entitlements_updated_at ON public.business_entitlements;
DROP TABLE IF EXISTS public.business_entitlements;
COMMIT;
