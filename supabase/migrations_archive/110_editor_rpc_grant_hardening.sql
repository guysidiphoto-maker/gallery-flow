-- ─────────────────────────────────────────────────────────────────────────────
-- 108_editor_rpc_grant_hardening.sql — Remove anon EXECUTE from owner-only
-- editor RPCs.
--
-- update_gallery_settings and _validate_delivery_settings_patch were executable
-- by anon (via the default PUBLIC grant on new functions). The functions are
-- internally auth-gated (update_gallery_settings returns not_authenticated for a
-- null auth.uid()), but an owner-only editor function should not expose EXECUTE
-- to anon at all — least privilege. This revokes PUBLIC + anon and grants only
-- authenticated + service_role. reorder_images is re-asserted for consistency.
--
-- Public read-only VIEWER functions (gallery_bootstrap / gallery_get_images /
-- gallery_get_meta / gallery_is_locked) are intentionally left executable by
-- anon and are NOT touched here.
--
-- Signatures, SECURITY DEFINER, search_path, and the internal owner checks are
-- unchanged — this only tightens EXECUTE grants. Additive; does not modify the
-- applied 104/105/106/107. Reversible.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- update_gallery_settings — owner only
REVOKE EXECUTE ON FUNCTION public.update_gallery_settings(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_gallery_settings(uuid, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_gallery_settings(uuid, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_gallery_settings(uuid, jsonb) TO service_role;

-- _validate_delivery_settings_patch — internal helper; no public/anon use
REVOKE EXECUTE ON FUNCTION public._validate_delivery_settings_patch(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._validate_delivery_settings_patch(jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public._validate_delivery_settings_patch(jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public._validate_delivery_settings_patch(jsonb) TO service_role;

-- reorder_images — owner only (re-assert; already anon-free)
REVOKE EXECUTE ON FUNCTION public.reorder_images(uuid, uuid[], integer[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorder_images(uuid, uuid[], integer[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reorder_images(uuid, uuid[], integer[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.reorder_images(uuid, uuid[], integer[]) TO service_role;

COMMIT;

-- Post-condition (run manually):
-- SELECT has_function_privilege('anon','public.update_gallery_settings(uuid,jsonb)','EXECUTE');  -- expect false
-- SELECT has_function_privilege('authenticated','public.update_gallery_settings(uuid,jsonb)','EXECUTE'); -- expect true
