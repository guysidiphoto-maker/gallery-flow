-- 067_gallery_revisions.sql
-- Phase 6 Step 5 (Phase 1, ADDITIVE-ONLY) — gallery_revisions snapshots.
--
-- Before today, "publish" was metadata-only: every edit to delivery_settings,
-- gallery_sections, image sort_order, etc. was instantly visible to the anon
-- public viewer (because RLS only gates on status='live'). The photographer's
-- in-progress curation leaked to the client in real time.
--
-- This migration introduces gallery_revisions — a numbered, immutable snapshot
-- captured every time the photographer clicks Publish/Update. galleries gains
-- a published_revision_id FK that points at the most recently published row.
--
-- IMPORTANT: this sprint is ADDITIVE only. The public viewer (gallery-web
-- App.tsx) is NOT switched to read from the snapshot yet. We're shipping the
-- machinery first so it can be backfilled, audited, and exercised in
-- production for a sprint before the riskier cutover flips every gallery.
-- Until then, the snapshot is shadow state: written, never read by anon.
--
-- Row counts captured at session start (2026-05-30):
--   galleries total          : 102
--   galleries status='live'  : 79   → backfill produces 79 revision rows
--   galleries status='draft' : 23   → published_revision_id stays NULL
--   galleries status='archived' : 0
-- After this migration we expect:
--   gallery_revisions COUNT  = 79
--   galleries WHERE published_revision_id IS NOT NULL = 79
--   galleries WHERE published_revision_id IS NULL     = 23

BEGIN;

-- ── 1. Table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gallery_revisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id        UUID NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  -- Snapshot payloads. settings = the JSONB delivery_settings blob exactly as
  -- it stood at publish time. section_data = ordered list of the gallery's
  -- sections at that moment (sections can be renamed / reordered between
  -- publishes, so we freeze them too).
  settings          JSONB NOT NULL,
  section_data      JSONB NOT NULL,
  -- Snapshots of the typed columns introduced in migration 064 (Step 2). We
  -- copy them here too so the snapshot is fully self-describing and the
  -- viewer cutover can read everything from one row.
  name              TEXT  NOT NULL,
  status            public.gallery_status NOT NULL,
  access_type       TEXT  NULL,
  event_date        DATE  NULL,
  event_type        TEXT  NULL,
  event_location    TEXT  NULL,
  -- Monotonic, human-readable identifier per gallery (1, 2, 3, …). Easy for
  -- support: "your client is looking at revision 4 of that gallery".
  revision_index    INT   NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- auth.uid() at publish time. NULL for backfill rows since we don't know
  -- who originally published a 6-month-old gallery.
  created_by        UUID  NULL,
  -- Optional changelog note. The UI doesn't expose this yet; reserved for a
  -- later Phase 6 follow-up ("what changed in this revision?").
  publish_note      TEXT  NULL,
  CONSTRAINT gallery_revisions_revision_index_pos CHECK (revision_index >= 1),
  CONSTRAINT gallery_revisions_unique_per_gallery UNIQUE (gallery_id, revision_index)
);

COMMENT ON TABLE public.gallery_revisions IS
  'Immutable snapshots of gallery state captured at publish time. The owner edits the live row; gallery_publish() freezes the current state into a revision and points galleries.published_revision_id at it. Public viewer cutover (reading from the snapshot instead of the live row) is a separate, feature-flagged sprint.';

-- ── 2. FK on galleries ────────────────────────────────────────────────────
ALTER TABLE public.galleries
  ADD COLUMN IF NOT EXISTS published_revision_id UUID NULL
    REFERENCES public.gallery_revisions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.galleries.published_revision_id IS
  'Pointer to the most-recently published snapshot. NULL = gallery has never been published. The public viewer will eventually read state from this revision instead of the live galleries row.';

-- ── 3. Indices ────────────────────────────────────────────────────────────
-- "Give me the latest revision for gallery X" — covers the snapshot read path
-- once the public viewer is cut over, and the dashboard's revision history.
CREATE INDEX IF NOT EXISTS gallery_revisions_gallery_id_revision_index_idx
  ON public.gallery_revisions (gallery_id, revision_index DESC);

-- Reverse lookup: "which gallery does this revision belong to" and joins from
-- galleries.published_revision_id.
CREATE INDEX IF NOT EXISTS galleries_published_revision_id_idx
  ON public.galleries (published_revision_id)
  WHERE published_revision_id IS NOT NULL;

-- ── 4. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.gallery_revisions ENABLE ROW LEVEL SECURITY;

-- Owner-only SELECT. Matches the gallery_sections_owner_all pattern. Anon
-- gets NO access — when the viewer cutover happens it will go through a
-- SECURITY DEFINER RPC that returns the snapshot, not direct SELECT.
DROP POLICY IF EXISTS gallery_revisions_owner_select ON public.gallery_revisions;
CREATE POLICY gallery_revisions_owner_select
  ON public.gallery_revisions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.galleries g
      WHERE g.id = gallery_revisions.gallery_id
        AND g.business_id = public.current_business_id()
    )
  );

-- No INSERT/UPDATE/DELETE policies → all writes must go through the
-- SECURITY DEFINER RPC below. Explicitly revoke from the role grants
-- Supabase hands out by default.
REVOKE INSERT, UPDATE, DELETE ON public.gallery_revisions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.gallery_revisions FROM authenticated;
-- SELECT grant stays — it's gated by the policy above.
GRANT  SELECT ON public.gallery_revisions TO authenticated;

-- ── 5. RPC: gallery_publish ───────────────────────────────────────────────
-- Atomically (a) snapshots the current state into gallery_revisions, then
-- (b) flips galleries.status='live', published_at=now(), published_revision_id.
-- Two clicks in quick succession produce two revisions — intentional, mirrors
-- the photographer's intent.
CREATE OR REPLACE FUNCTION public.gallery_publish(
  p_gallery_id  UUID,
  p_publish_note TEXT DEFAULT NULL
) RETURNS TABLE (
  revision_id     UUID,
  revision_index  INT,
  published_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_business_id     UUID;
  v_gallery_business UUID;
  v_settings        JSONB;
  v_section_data    JSONB;
  v_name            TEXT;
  v_status          public.gallery_status;
  v_access_type     TEXT;
  v_event_date      DATE;
  v_event_type      TEXT;
  v_event_location  TEXT;
  v_next_index      INT;
  v_revision_id     UUID;
  v_published_at    TIMESTAMPTZ := now();
BEGIN
  -- Permission check. current_business_id() reads auth.uid(); SECURITY DEFINER
  -- means the function body itself has elevated rights, but the *caller* must
  -- still own the gallery.
  v_business_id := public.current_business_id();
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT g.business_id,
         COALESCE(g.delivery_settings, '{}'::jsonb),
         g.name,
         g.status,
         g.access_type,
         g.event_date,
         g.event_type,
         g.event_location
    INTO v_gallery_business,
         v_settings,
         v_name,
         v_status,
         v_access_type,
         v_event_date,
         v_event_type,
         v_event_location
    FROM public.galleries g
   WHERE g.id = p_gallery_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gallery_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_gallery_business <> v_business_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Freeze the section list. jsonb_agg with ORDER BY gives us a stable order.
  -- If the gallery has no sections (shouldn't happen post Step 3, but defensive)
  -- we still get '[]' rather than NULL so section_data is always valid JSON.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',          s.id,
               'name',        s.name,
               'slug',        s.slug,
               'sort_order',  s.sort_order,
               'description', s.description
             )
             ORDER BY s.sort_order, s.created_at
           ),
           '[]'::jsonb
         )
    INTO v_section_data
    FROM public.gallery_sections s
   WHERE s.gallery_id = p_gallery_id;

  -- Compute the next revision_index. The UNIQUE(gallery_id, revision_index)
  -- constraint protects against concurrent publish clicks racing.
  SELECT COALESCE(MAX(r.revision_index), 0) + 1
    INTO v_next_index
    FROM public.gallery_revisions r
   WHERE r.gallery_id = p_gallery_id;

  -- Snapshot insert. Status snapshot is always 'live' because we're about
  -- to set it to live; capturing the *new* state, not the pre-publish state.
  INSERT INTO public.gallery_revisions (
    gallery_id, settings, section_data, name, status,
    access_type, event_date, event_type, event_location,
    revision_index, created_at, created_by, publish_note
  ) VALUES (
    p_gallery_id, v_settings, v_section_data, v_name, 'live'::public.gallery_status,
    v_access_type, v_event_date, v_event_type, v_event_location,
    v_next_index, v_published_at, auth.uid(), p_publish_note
  ) RETURNING id INTO v_revision_id;

  -- Flip the gallery to live and point at the new revision.
  UPDATE public.galleries
     SET status = 'live'::public.gallery_status,
         published_at = v_published_at,
         published_revision_id = v_revision_id,
         updated_at = v_published_at
   WHERE id = p_gallery_id;

  revision_id    := v_revision_id;
  revision_index := v_next_index;
  published_at   := v_published_at;
  RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION public.gallery_publish(UUID, TEXT) IS
  'Phase 6 Step 5. Atomically snapshots a gallery into gallery_revisions then flips status=live + published_revision_id. Caller must own the gallery (current_business_id). Each call creates a new revision — clicking Publish twice produces two rows.';

REVOKE ALL    ON FUNCTION public.gallery_publish(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gallery_publish(UUID, TEXT) TO authenticated;

-- ── 6. Backfill ───────────────────────────────────────────────────────────
-- Capture one revision per currently-live gallery. revision_index=1,
-- created_by=NULL (we don't know who originally published the legacy ones).
-- Idempotent: ON CONFLICT DO NOTHING so re-running this migration is safe.
DO $$
DECLARE
  v_before_revisions  INT;
  v_before_pointers   INT;
  v_after_revisions   INT;
  v_after_pointers    INT;
  v_live_count        INT;
  v_draft_archived    INT;
BEGIN
  SELECT COUNT(*) INTO v_before_revisions FROM public.gallery_revisions;
  SELECT COUNT(*) INTO v_before_pointers  FROM public.galleries WHERE published_revision_id IS NOT NULL;
  SELECT COUNT(*) INTO v_live_count       FROM public.galleries WHERE status = 'live'::public.gallery_status;
  SELECT COUNT(*) INTO v_draft_archived   FROM public.galleries WHERE status <> 'live'::public.gallery_status;

  RAISE NOTICE 'backfill before: revisions=%, pointers=%, live=%, non-live=%',
    v_before_revisions, v_before_pointers, v_live_count, v_draft_archived;

  -- Step A: insert one revision per live gallery that doesn't already have
  -- one. We use a CTE so the same query returns the new IDs for step B.
  WITH inserted AS (
    INSERT INTO public.gallery_revisions (
      gallery_id, settings, section_data, name, status,
      access_type, event_date, event_type, event_location,
      revision_index, created_at, created_by, publish_note
    )
    SELECT
      g.id,
      COALESCE(g.delivery_settings, '{}'::jsonb),
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'id',          s.id,
                   'name',        s.name,
                   'slug',        s.slug,
                   'sort_order',  s.sort_order,
                   'description', s.description
                 )
                 ORDER BY s.sort_order, s.created_at
               )
          FROM public.gallery_sections s
         WHERE s.gallery_id = g.id
      ), '[]'::jsonb),
      g.name,
      g.status,
      g.access_type,
      g.event_date,
      g.event_type,
      g.event_location,
      1,
      COALESCE(g.published_at::timestamptz, g.updated_at, now()),
      NULL,
      'backfill: initial revision for status=live gallery'
    FROM public.galleries g
    WHERE g.status = 'live'::public.gallery_status
      AND NOT EXISTS (
        SELECT 1 FROM public.gallery_revisions r
         WHERE r.gallery_id = g.id
      )
    ON CONFLICT (gallery_id, revision_index) DO NOTHING
    RETURNING id, gallery_id
  )
  -- Step B: point each live gallery at its freshly-inserted revision.
  UPDATE public.galleries g
     SET published_revision_id = i.id
    FROM inserted i
   WHERE g.id = i.gallery_id;

  -- Verification.
  SELECT COUNT(*) INTO v_after_revisions FROM public.gallery_revisions;
  SELECT COUNT(*) INTO v_after_pointers  FROM public.galleries WHERE published_revision_id IS NOT NULL;

  RAISE NOTICE 'backfill after:  revisions=%, pointers=%',
    v_after_revisions, v_after_pointers;

  -- Invariant: every live gallery now has a revision and a pointer.
  IF v_after_pointers <> v_live_count THEN
    RAISE EXCEPTION 'backfill verification failed: pointers (%) <> live (%)',
      v_after_pointers, v_live_count;
  END IF;

  -- Invariant: non-live galleries still have NULL pointer.
  IF EXISTS (
    SELECT 1 FROM public.galleries
     WHERE status <> 'live'::public.gallery_status
       AND published_revision_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'backfill verification failed: non-live gallery has a pointer';
  END IF;
END $$;

COMMIT;
