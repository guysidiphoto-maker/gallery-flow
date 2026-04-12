-- ─────────────────────────────────────────────────────────────────────────────
-- 016_slug_storage_paths.sql
-- Updates storage RLS policies to support the new path structure:
--   {slug}/{gallery_id}/thumbs|web|originals/{filename}
-- Previously: {gallery_id}/thumbs|web|originals/{filename}
--
-- The gallery ID is now at foldername[2] instead of foldername[1].
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Drop existing policies
DROP POLICY IF EXISTS gallery_storage_public_read ON storage.objects;
DROP POLICY IF EXISTS gallery_storage_owner_write ON storage.objects;

-- Public read: gallery ID is now the second folder segment
CREATE POLICY gallery_storage_public_read ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id IN ('gallery-images', 'gallery-stories')
    AND EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id::text = (storage.foldername(name))[2]
        AND g.status   = 'live'
    )
  );

-- Authenticated owner: full read/write scoped to own business
CREATE POLICY gallery_storage_owner_write ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id IN ('gallery-images', 'gallery-stories')
    AND EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id::text  = (storage.foldername(name))[2]
        AND g.business_id = current_business_id()
    )
  )
  WITH CHECK (
    bucket_id IN ('gallery-images', 'gallery-stories')
    AND EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id::text  = (storage.foldername(name))[2]
        AND g.business_id = current_business_id()
    )
  );

COMMIT;
