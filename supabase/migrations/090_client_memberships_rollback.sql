-- 088_client_memberships_rollback.sql — reverse 088_client_memberships.sql.
-- Additive-only migration → safe drop. Does NOT touch clients/businesses/057.
-- The citext/pgcrypto extensions are intentionally left in place (other objects
-- may depend on them; dropping extensions is not reversible-safe).

BEGIN;

DROP TRIGGER IF EXISTS trg_client_memberships_updated_at ON public.client_memberships;

DROP TABLE IF EXISTS public.client_invitations;
DROP TABLE IF EXISTS public.client_memberships;

-- cpv2_set_updated_at is shared by later CPV2 migrations; drop only if no other
-- CPV2 table remains. Left in place here to keep rollbacks independent/idempotent.
-- To fully remove after ALL CPV2 rollbacks:  DROP FUNCTION IF EXISTS public.cpv2_set_updated_at();

COMMIT;
