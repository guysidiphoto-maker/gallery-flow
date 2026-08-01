-- 099_import_center.sql — Import Center (Pixieset-first, provider-agnostic).
--
-- Adds four ADDITIVE tables that track photographer-initiated migrations from
-- an external host (Pixieset via the owner's OWN official exports, generic CSV,
-- or a local folder) into piXflow galleries. Photos themselves flow through the
-- EXISTING browser upload pipeline (uploadPipeline.ts) — these tables hold only
-- job orchestration state: what was requested, how collections map to clients,
-- and per-file bookkeeping for resumability + duplicate detection.
--
-- Scope guarantees (contract C7, overnight 2026-07-24):
--   • every row is scoped to business_id; owner-only SELECT via RLS
--   • NO client-side write policies — ALL writes go through the service-role
--     API (/api/import-center) after requireOwnerBusiness
--   • cancel is SAFE: a cancelled job never deletes uploaded images
--   • no secrets: CSV password-looking columns are dropped server-side and
--     never reach these tables
--   • audit actions (import_job_created, import_job_started, ...) are added to
--     client_access_audit's CHECK in migration 097 (single owner: Agent-DB).
--     This migration does NOT touch client_access_audit.
--
-- NOT APPLIED to any environment by this program (QA project only, later).
-- Paired rollback: 099_import_center_rollback.sql

BEGIN;

-- ============================================================
-- import_sources — where a migration comes from
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider     text NOT NULL CHECK (provider IN ('pixieset','generic_csv','local_folder')),
  label        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_import_sources_business
  ON public.import_sources (business_id);

ALTER TABLE public.import_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_sources_owner_select ON public.import_sources;
CREATE POLICY import_sources_owner_select ON public.import_sources
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
-- No INSERT/UPDATE/DELETE policies → writes via service-role API only. Anon blocked.

-- ============================================================
-- import_jobs — one migration run (CSV dry-run and/or photo upload)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_id    uuid REFERENCES public.import_sources(id) ON DELETE SET NULL,
  kind         text NOT NULL CHECK (kind IN ('metadata_csv','photos_zip')),
  status       text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','dry_run','ready','running','paused',
                                   'completed','failed','cancelled')),
  totals       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- e.g. {collections, files, bytes, estimated_tokens}
  error        text,
  checkpoint   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- per-collection progress for resume
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

CREATE INDEX IF NOT EXISTS ix_import_jobs_business
  ON public.import_jobs (business_id);
CREATE INDEX IF NOT EXISTS ix_import_jobs_business_status
  ON public.import_jobs (business_id, status);

-- Reuse the shared updated_at trigger fn from migration 088.
DROP TRIGGER IF EXISTS trg_import_jobs_updated_at ON public.import_jobs;
CREATE TRIGGER trg_import_jobs_updated_at
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cpv2_set_updated_at();

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_jobs_owner_select ON public.import_jobs;
CREATE POLICY import_jobs_owner_select ON public.import_jobs
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
-- No write policies → service-role API only.

-- ============================================================
-- import_collections — one external collection/gallery inside a job
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_collections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_name         text NOT NULL,
  source_url          text,
  matched_client_id   uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_match_status text NOT NULL DEFAULT 'unmatched'
                        CHECK (client_match_status IN
                               ('matched','ambiguous','unmatched','create_new','skip')),
  target_gallery_id   uuid REFERENCES public.galleries(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','importing','imported','skipped','failed')),
  stats               jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {imported, skipped_duplicate, failed}
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_import_collections_job
  ON public.import_collections (job_id);
CREATE INDEX IF NOT EXISTS ix_import_collections_business
  ON public.import_collections (business_id);
CREATE INDEX IF NOT EXISTS ix_import_collections_job_status
  ON public.import_collections (job_id, status);

ALTER TABLE public.import_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_collections_owner_select ON public.import_collections;
CREATE POLICY import_collections_owner_select ON public.import_collections
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
-- No write policies → service-role API only.

-- ============================================================
-- import_files — per-file bookkeeping (resume + duplicate detection)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id  uuid NOT NULL REFERENCES public.import_collections(id) ON DELETE CASCADE,
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  filename       text NOT NULL,           -- sanitized basename, never a path
  size_bytes     bigint,
  content_hash   text,                    -- sha256 hex of the file bytes (duplicate detection)
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','uploaded','skipped_duplicate','failed')),
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_import_files_collection
  ON public.import_files (collection_id);
CREATE INDEX IF NOT EXISTS ix_import_files_business
  ON public.import_files (business_id);
CREATE INDEX IF NOT EXISTS ix_import_files_collection_status
  ON public.import_files (collection_id, status);
CREATE INDEX IF NOT EXISTS ix_import_files_content_hash
  ON public.import_files (business_id, content_hash) WHERE content_hash IS NOT NULL;

ALTER TABLE public.import_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_files_owner_select ON public.import_files;
CREATE POLICY import_files_owner_select ON public.import_files
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
-- No write policies → service-role API only.

-- Least privilege: nothing here is callable/writable by anon; authenticated
-- gets read-only visibility into their own business's rows via the policies
-- above. Service role bypasses RLS (Supabase default) for the API writes.
REVOKE ALL ON public.import_sources, public.import_jobs,
           public.import_collections, public.import_files FROM anon;
GRANT SELECT ON public.import_sources, public.import_jobs,
           public.import_collections, public.import_files TO authenticated;

COMMIT;

-- ============================================================
-- Verification (run manually AFTER a controlled apply; NOT in this program)
-- ============================================================
--   SELECT to_regclass('public.import_sources');      -- exists
--   SELECT to_regclass('public.import_jobs');         -- exists
--   SELECT to_regclass('public.import_collections');  -- exists
--   SELECT to_regclass('public.import_files');        -- exists
--   SET ROLE anon;  SELECT count(*) FROM public.import_jobs;  -- must error / 0 rows
--   RESET ROLE;
--   SELECT relrowsecurity FROM pg_class WHERE relname LIKE 'import_%';  -- all t
