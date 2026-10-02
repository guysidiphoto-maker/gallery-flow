-- 095 rollback
BEGIN;
DROP POLICY IF EXISTS galleries_member_select ON public.galleries;
DROP POLICY IF EXISTS images_member_select ON public.images;
DROP POLICY IF EXISTS sections_member_select ON public.gallery_sections;
DROP POLICY IF EXISTS stories_member_select ON public.stories;
COMMIT;
