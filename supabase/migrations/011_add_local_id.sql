-- ─────────────────────────────────────────────────────────────────────────────
-- 011_add_local_id.sql
-- Adds the `local_id` column to `clients` and `galleries` tables.
-- The desktop app uses local UUIDs to dedupe + map local records to cloud rows
-- (see src/renderer/src/lib/cloudUpload.ts). The original schema.sql declared
-- this column, but it was never carried into the migration chain, so live
-- Supabase projects bootstrapped from migrations only are missing it. This
-- causes "Could not find the 'local_id' column" errors on first publish.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE clients   ADD COLUMN IF NOT EXISTS local_id TEXT;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS local_id TEXT;

-- Lookups by (business_id, local_id) are the hot path for dedupe on publish.
CREATE INDEX IF NOT EXISTS clients_business_local_id_idx
  ON clients (business_id, local_id);
CREATE INDEX IF NOT EXISTS galleries_business_local_id_idx
  ON galleries (business_id, local_id);

COMMIT;
