-- 085_admin_credit_grants_rollback.sql — reverts 085.
-- Drops the admin RPCs + the idempotency index. Non-destructive: existing
-- token_ledger 'admin_grant' rows and business_tokens balances are LEFT INTACT
-- (they are real financial history). Run inside a transaction.

BEGIN;

DROP FUNCTION IF EXISTS public.admin_grant_credits(uuid, integer, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_list_businesses(text, integer, integer);
DROP FUNCTION IF EXISTS public.admin_recent_grants(integer);

DROP INDEX IF EXISTS public.ux_token_ledger_admin_grant_ref;

COMMIT;
