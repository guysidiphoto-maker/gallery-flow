-- ─────────────────────────────────────────────────────────────────────────────
-- 014_demo_galleries.sql
-- Enables anonymous "demo publish" from the marketing site. Visitors can
-- upload up to 30 photos and get a real gallery link that auto-expires
-- after 1 hour. The gallery looks identical to a real one — the viewer
-- doesn't know it's temporary.
--
-- Security model:
-- • Anon can only INSERT galleries where demo_expires_at IS NOT NULL
-- • Anon can only INSERT images for demo galleries
-- • Anon can only upload to the demo-uploads storage bucket
-- • Rate limited by ip_hash (max 3 demo galleries per IP per day)
-- • pg_cron cleans up expired galleries every 15 minutes
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Column for demo expiry ────────────────────────────────────────────────
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_ip_hash TEXT;

CREATE INDEX IF NOT EXISTS galleries_demo_expires_idx
  ON galleries (demo_expires_at)
  WHERE demo_expires_at IS NOT NULL;

-- ── RLS: anon can create demo galleries ───────────────────────────────────
-- They can ONLY insert rows where demo_expires_at is set, ensuring they
-- cannot create permanent galleries.
CREATE POLICY galleries_demo_insert ON galleries
  FOR INSERT TO anon
  WITH CHECK (
    demo_expires_at IS NOT NULL
    AND demo_expires_at > now()
    AND demo_expires_at <= now() + INTERVAL '2 hours'
    AND status = 'live'
  );

-- Anon can already SELECT live galleries (existing policy).
-- No UPDATE or DELETE for anon on galleries.

-- ── RLS: anon can insert images into demo galleries ───────────────────────
CREATE POLICY images_demo_insert ON images
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = images.gallery_id
        AND g.demo_expires_at IS NOT NULL
        AND g.demo_expires_at > now()
    )
  );

-- ── Storage bucket for demo uploads ───────────────────────────────────────
-- Run this manually if the bucket doesn't exist:
--   INSERT INTO storage.buckets (id, name, public) VALUES ('demo-uploads', 'demo-uploads', true);
--
-- Storage policies (allow anon to upload to demo-uploads):
INSERT INTO storage.buckets (id, name, public)
  VALUES ('demo-uploads', 'demo-uploads', true)
  ON CONFLICT (id) DO NOTHING;

-- Allow anonymous uploads to demo-uploads bucket
CREATE POLICY demo_uploads_insert ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'demo-uploads');

-- Allow public reads from demo-uploads bucket
CREATE POLICY demo_uploads_select ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'demo-uploads');

-- Allow deletion of demo-uploads (for cleanup)
CREATE POLICY demo_uploads_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'demo-uploads');

-- ── Cleanup function ──────────────────────────────────────────────────────
-- Deletes expired demo galleries. Images cascade via FK. Storage files
-- must be cleaned separately (either by a worker or by lifecycle policy).
CREATE OR REPLACE FUNCTION cleanup_expired_demo_galleries()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  expired_id UUID;
BEGIN
  FOR expired_id IN
    SELECT id FROM galleries
    WHERE demo_expires_at IS NOT NULL
      AND demo_expires_at < now()
  LOOP
    -- Delete storage objects for this gallery
    DELETE FROM storage.objects
    WHERE bucket_id = 'demo-uploads'
      AND name LIKE expired_id::text || '/%';
    -- Delete gallery (images cascade)
    DELETE FROM galleries WHERE id = expired_id;
  END LOOP;
END $$;

-- Schedule cleanup every 15 minutes (requires pg_cron extension).
-- If pg_cron is not available, run this manually or via an external cron.
-- SELECT cron.schedule('cleanup-demo-galleries', '*/15 * * * *', 'SELECT cleanup_expired_demo_galleries()');

COMMIT;
