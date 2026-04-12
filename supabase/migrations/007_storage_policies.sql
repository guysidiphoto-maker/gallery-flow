-- ─────────────────────────────────────────────────────────────────────────────
-- 007_storage_policies.sql
-- Lock down the gallery storage buckets so authenticated owners can only
-- read/write their own gallery files, while public read remains possible
-- only for objects belonging to a LIVE gallery.
-- Safe to run on existing data.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Drop any prior public policies on these buckets so we can re-apply cleanly.
DROP POLICY IF EXISTS gallery_storage_public_read  ON storage.objects;
DROP POLICY IF EXISTS gallery_storage_owner_write  ON storage.objects;

-- Public read on bucket objects whose first folder segment is a LIVE gallery id.
CREATE POLICY gallery_storage_public_read ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id IN ('gallery-images', 'gallery-stories')
    AND EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id::text = (storage.foldername(name))[1]
        AND g.status   = 'live'
    )
  );

-- Authenticated owner: full read/write on objects under one of their galleries.
CREATE POLICY gallery_storage_owner_write ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id IN ('gallery-images', 'gallery-stories')
    AND EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id::text  = (storage.foldername(name))[1]
        AND g.business_id = current_business_id()
    )
  )
  WITH CHECK (
    bucket_id IN ('gallery-images', 'gallery-stories')
    AND EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id::text  = (storage.foldername(name))[1]
        AND g.business_id = current_business_id()
    )
  );

COMMIT;
