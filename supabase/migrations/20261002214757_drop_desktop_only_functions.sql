-- The Electron desktop app is retired and removed from the repo. These two
-- functions were only ever called by it: nothing in gallery-web, api/, the edge
-- functions or any other database function references them. (The desktop's
-- monthly_usage table and its two functions were already gone from production.)
-- The web sets gallery passwords through update_gallery_settings.

DROP FUNCTION IF EXISTS public.is_business_slug_taken(text);
DROP FUNCTION IF EXISTS public.set_gallery_password(uuid, text);
