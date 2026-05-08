-- 059_fix_storage_policy_name_shadow.sql
--
-- Pre-flip cleanup for Phase 4.5: the existing `gallery_storage_public_read`
-- and `gallery_storage_owner_write` policies on storage.objects contain a
-- latent bug. The EXISTS subquery joins galleries on
-- `(storage.foldername(name))[2]`, but `name` is unqualified and the
-- `galleries` table has its own `name` column — Postgres resolves the
-- reference to `galleries.name` (the gallery title) instead of
-- `storage.objects.name` (the storage key). The policy therefore never
-- matches.
--
-- Today this is hidden because the bucket is `public:true` and reads bypass
-- RLS via the public URL. The moment Phase 4.5 flips the bucket to
-- `public:false`, every authenticated read falls back to RLS, the policy
-- denies everything, and the entire app breaks.
--
-- This migration drops both policies and recreates them with
-- `storage.objects.name` qualified explicitly. Behavior change: anon SELECT
-- and authenticated owner-write now actually work as the names imply,
-- gated on the gallery's id matching the second path segment. Today's
-- behavior is unchanged (the policies were no-ops anyway, only the public
-- URL flag was protecting the bucket).
--
-- Verified the new pattern works in 058 for the new public-thumbs bucket.
-- This migration mirrors that pattern back onto the original two policies.

BEGIN;

DROP POLICY IF EXISTS gallery_storage_public_read ON storage.objects;
CREATE POLICY gallery_storage_public_read
  ON storage.objects
  FOR SELECT
  TO anon
  USING (
    bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])
    AND EXISTS (
      SELECT 1 FROM galleries g
       WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
         AND g.status = 'live'
    )
  );

DROP POLICY IF EXISTS gallery_storage_owner_write ON storage.objects;
CREATE POLICY gallery_storage_owner_write
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])
    AND EXISTS (
      SELECT 1 FROM galleries g
       WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
         AND g.business_id = current_business_id()
    )
  )
  WITH CHECK (
    bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])
    AND EXISTS (
      SELECT 1 FROM galleries g
       WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
         AND g.business_id = current_business_id()
    )
  );

COMMIT;
