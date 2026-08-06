-- Rollback for 101_tender_grants_hardening.sql.
-- Restores Supabase's default posture (revoke the explicit authenticated
-- grants). RLS remains enabled and owner-scoped regardless. This does NOT
-- re-grant anon (leaving anon without table privileges is strictly safer).

BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE
  ON public.tender_collections, public.tender_collection_items
  FROM authenticated;

COMMIT;
