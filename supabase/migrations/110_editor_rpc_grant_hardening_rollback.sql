-- Rollback for 108 — restores the prior (pre-hardening) grants, re-exposing
-- EXECUTE to anon/PUBLIC on the editor RPCs (matching Production's current
-- default-PUBLIC state). Only use if the hardening must be reverted.

BEGIN;

GRANT EXECUTE ON FUNCTION public.update_gallery_settings(uuid, jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public._validate_delivery_settings_patch(jsonb) TO PUBLIC;
-- reorder_images was anon-free before 108 too; leave it locked (no re-grant).

COMMIT;
