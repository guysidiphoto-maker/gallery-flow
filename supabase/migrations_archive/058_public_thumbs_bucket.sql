-- 058_public_thumbs_bucket.sql
--
-- Phase 4.2 — provision the public thumbs bucket alongside the (still-public)
-- `gallery-images` bucket. Pure preparation; no behavior change yet.
--
-- After this migration:
--   * A new bucket `gallery-images-thumbs-public` exists, public:true.
--   * RLS policies mirror the existing `gallery_storage_public_read` /
--     `gallery_storage_owner_write` policies on `gallery-images`, scoped to
--     the new bucket and gated on `galleries.status = 'live'`.
--   * `images.public_thumb_present BOOLEAN` tracks whether each row's thumb
--     exists in the new bucket. Default false; backfill flips it true.
--   * `record_image_upload` accepts a new optional `p_public_thumb_present`
--     parameter (default false), stored on the row at insert time.
--
-- Path scheme: thumbs are stored at the SAME key in both buckets, i.e.
-- `<biz_slug>/<gallery_id>/thumbs/<hash>_<filename>`. Backfill simply copies
-- bytes between buckets at the same key. OG endpoint can swap bucket name
-- without recomputing the path.
--
-- Backwards compatibility: existing callers of record_image_upload that pass
-- the legacy 8 named parameters keep working; the new parameter defaults to
-- false. The DROP+CREATE happens inside a single migration transaction.

BEGIN;

-- ─── 1. Bucket ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery-images-thumbs-public', 'gallery-images-thumbs-public', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. RLS policies on storage.objects, scoped to the new bucket ─────────
--
-- Pattern note: `galleries` has its own `name` column, so an unqualified
-- `name` inside the EXISTS subquery resolves to `g.name`, not the outer
-- `storage.objects.name`. We qualify with `storage.objects.name` explicitly
-- to avoid the latent bug present in the existing `gallery_storage_*`
-- policies (which deny all reads — saved today only because the bucket flag
-- is `public:true` and bypasses RLS via the public URL).
--
-- The bucket is public:true so read access also flows through the public
-- URL without consulting RLS. These policies still gate direct
-- storage.objects queries and signed-URL paths.

DROP POLICY IF EXISTS thumbs_public_anon_read ON storage.objects;
CREATE POLICY thumbs_public_anon_read
  ON storage.objects
  FOR SELECT
  TO anon
  USING (
    bucket_id = 'gallery-images-thumbs-public'
    AND EXISTS (
      SELECT 1 FROM galleries g
       WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
         AND g.status = 'live'
    )
  );

DROP POLICY IF EXISTS thumbs_public_owner_write ON storage.objects;
CREATE POLICY thumbs_public_owner_write
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'gallery-images-thumbs-public'
    AND EXISTS (
      SELECT 1 FROM galleries g
       JOIN businesses b ON b.id = g.business_id
       WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
         AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'gallery-images-thumbs-public'
    AND EXISTS (
      SELECT 1 FROM galleries g
       JOIN businesses b ON b.id = g.business_id
       WHERE g.id::text = (storage.foldername(storage.objects.name))[2]
         AND b.user_id = auth.uid()
    )
  );

-- ─── 3. images.public_thumb_present ───────────────────────────────────────

ALTER TABLE images
  ADD COLUMN IF NOT EXISTS public_thumb_present BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS images_public_thumb_present_idx
  ON images (public_thumb_present)
  WHERE public_thumb_present = false;

-- ─── 4. record_image_upload — add p_public_thumb_present parameter ────────
--
-- Drop the old signature explicitly so the new function isn't ambiguous with
-- a leftover. CREATE OR REPLACE FUNCTION cannot add a new parameter with a
-- default unless the signature matches.

DROP FUNCTION IF EXISTS record_image_upload(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, UUID, INTEGER);

CREATE OR REPLACE FUNCTION record_image_upload(
  p_gallery_id            UUID,
  p_filename              TEXT,
  p_web_preview_path      TEXT,
  p_thumbnail_path        TEXT,
  p_original_path         TEXT,
  p_original_size         BIGINT  DEFAULT NULL,
  p_section_id            UUID    DEFAULT NULL,
  p_sort_order            INTEGER DEFAULT 0,
  p_public_thumb_present  BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_owner_user  UUID;
  v_balance     INTEGER;
  v_image_id    UUID;
BEGIN
  SELECT g.business_id, b.user_id
    INTO v_business_id, v_owner_user
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'gallery_not_found';
  END IF;
  IF v_owner_user IS NULL OR v_owner_user <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE business_tokens
     SET balance = balance - 1,
         lifetime_consumed = lifetime_consumed + 1,
         updated_at = now()
   WHERE business_id = v_business_id AND balance > 0
   RETURNING balance INTO v_balance;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient_tokens';
  END IF;

  INSERT INTO images (
    gallery_id, filename,
    web_preview_path, thumbnail_path, original_path,
    original_uploaded, original_size_bytes,
    section_id, sort_order, is_top_pick,
    public_thumb_present
  ) VALUES (
    p_gallery_id, p_filename,
    p_web_preview_path, p_thumbnail_path, p_original_path,
    p_original_path IS NOT NULL, p_original_size,
    p_section_id, COALESCE(p_sort_order, 0), false,
    COALESCE(p_public_thumb_present, false)
  )
  RETURNING id INTO v_image_id;

  INSERT INTO token_ledger (business_id, delta, reason, ref_id, metadata)
  VALUES (v_business_id, -1, 'image_upload', v_image_id,
          jsonb_build_object('gallery_id', p_gallery_id, 'filename', p_filename));

  UPDATE galleries SET image_count = COALESCE(image_count, 0) + 1
   WHERE id = p_gallery_id;

  RETURN v_image_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_image_upload(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, UUID, INTEGER, BOOLEAN
) TO authenticated;

COMMIT;
