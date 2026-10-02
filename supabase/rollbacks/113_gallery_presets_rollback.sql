-- Rollback for 111_gallery_presets.sql — drops the presets table + helpers.
BEGIN;
DROP TRIGGER IF EXISTS gallery_presets_biu ON public.gallery_presets;
DROP FUNCTION IF EXISTS public._gallery_presets_biu();
DROP FUNCTION IF EXISTS public._sanitize_preset_settings(jsonb);
DROP TABLE IF EXISTS public.gallery_presets;
COMMIT;
