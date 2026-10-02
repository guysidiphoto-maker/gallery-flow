-- Phase 6 step 5 phase 2 — public viewer snapshot read
--
-- Returns the gallery_revisions row currently referenced by
-- galleries.published_revision_id, exposed as a SECURITY DEFINER RPC so the
-- anon role can read it without granting SELECT on gallery_revisions itself.
--
-- Caller contract (gallery-web/src/App.tsx):
--   • Returns zero rows when galleries.published_revision_id IS NULL — the
--     caller falls back to the legacy live read (delivery_settings +
--     gallery_sections direct selects).
--   • Returns exactly one row otherwise.
--   • Only settings + sections are snapshotted. Image rows are intentionally
--     out of scope: gallery_get_images keeps returning the live image set, so
--     photos uploaded after publish still surface to clients. The snapshot
--     freezes layout/branding, not catalog membership.

CREATE OR REPLACE FUNCTION public.gallery_get_published_snapshot(
  p_gallery_id uuid
)
RETURNS TABLE (
  revision_id     uuid,
  revision_index  integer,
  settings        jsonb,
  section_data    jsonb,
  name            text,
  status          public.gallery_status,
  access_type     text,
  event_date      date,
  event_type      text,
  event_location  text,
  created_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    r.id              AS revision_id,
    r.revision_index,
    r.settings,
    r.section_data,
    r.name,
    r.status,
    r.access_type,
    r.event_date,
    r.event_type,
    r.event_location,
    r.created_at
    FROM public.galleries g
    JOIN public.gallery_revisions r
      ON r.id = g.published_revision_id
   WHERE g.id = p_gallery_id
     AND g.published_revision_id IS NOT NULL
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.gallery_get_published_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gallery_get_published_snapshot(uuid) TO anon, authenticated;
