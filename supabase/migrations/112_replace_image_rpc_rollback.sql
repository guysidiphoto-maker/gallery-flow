-- Rollback for 110_replace_image_rpc.sql — drops the replace_image RPC.
-- Storage objects and images rows already flipped by a call are NOT reverted
-- (data operations are irreversible by design); this only removes the function.
BEGIN;
DROP FUNCTION IF EXISTS public.replace_image(uuid, uuid, text, text, text, text, bigint, text, integer, integer);
COMMIT;
