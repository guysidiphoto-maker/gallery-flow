-- ─────────────────────────────────────────────────────────────────────────────
-- 064_jsonb_to_columns.sql — Phase 6 Step 2
--
-- Promote five load-bearing keys out of `galleries.delivery_settings` JSONB
-- into typed columns:
--   event_date         DATE
--   event_type         TEXT  (≤ 60 chars)
--   event_location     TEXT  (≤ 120 chars)
--   access_type        TEXT  ('public' | 'password' | 'code')  default 'public'
--   client_code_hash   TEXT  (bcrypt via pgcrypto; password already covered
--                             by galleries.password_hash from migration 057)
--
-- Backfill from delivery_settings with safe casts (anything that does not
-- parse as DATE → NULL). The legacy JSONB keys stay in place so the public
-- viewer keeps working during the dual-read transition. Phase 6 Step 5 drops
-- the JSONB keys after viewer + RPC are cut over.
--
-- Pre-conditions:
--   * pgcrypto extension enabled (already true on prod — verified before apply)
--   * migration 057_client_auth added password_hash; we do NOT duplicate it
--   * migration 063_gallery_status_enum is in place
--
-- Idempotent: ALTER ... ADD COLUMN IF NOT EXISTS + ADD CONSTRAINT IF NOT EXISTS
-- patterns let this migration re-run safely.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Promoted typed columns ────────────────────────────────────────────────
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS event_date       DATE,
  ADD COLUMN IF NOT EXISTS event_type       TEXT,
  ADD COLUMN IF NOT EXISTS event_location   TEXT,
  ADD COLUMN IF NOT EXISTS access_type      TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS client_code_hash TEXT;

-- ── 2. Domain constraints ────────────────────────────────────────────────────
-- Use NOT VALID + VALIDATE pattern so we never block on a long lock if data
-- is dirty; the backfill below normalises the values before VALIDATE runs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'galleries_event_type_len_check'
  ) THEN
    ALTER TABLE galleries
      ADD CONSTRAINT galleries_event_type_len_check
      CHECK (event_type IS NULL OR char_length(event_type) <= 60) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'galleries_event_location_len_check'
  ) THEN
    ALTER TABLE galleries
      ADD CONSTRAINT galleries_event_location_len_check
      CHECK (event_location IS NULL OR char_length(event_location) <= 120) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'galleries_access_type_check'
  ) THEN
    ALTER TABLE galleries
      ADD CONSTRAINT galleries_access_type_check
      CHECK (access_type IN ('public', 'password', 'code')) NOT VALID;
  END IF;
END $$;

-- ── 3. Backfill from delivery_settings ───────────────────────────────────────
-- event_date: try-cast. The bad-data audit showed legacy rows with values
-- like '4.6.2024', '3/3/22', '2026' — none of those parse as DATE, so they
-- land as NULL and the JSONB string remains the source of truth until the
-- photographer re-enters it through the typed column.
UPDATE galleries g
SET event_date = CASE
    WHEN NULLIF(g.delivery_settings->>'eventDate', '') IS NULL THEN NULL
    ELSE (
      SELECT CASE
        WHEN (g.delivery_settings->>'eventDate') ~ '^\d{4}-\d{2}-\d{2}$'
          THEN (g.delivery_settings->>'eventDate')::date
        ELSE NULL
      END
    )
  END
WHERE g.event_date IS NULL;

-- event_type / event_location — trim and cap to constraint length so the
-- VALIDATE step below never fails on legacy garbage.
UPDATE galleries g
SET event_type = LEFT(NULLIF(TRIM(g.delivery_settings->>'eventType'), ''), 60)
WHERE g.event_type IS NULL;

UPDATE galleries g
SET event_location = LEFT(NULLIF(TRIM(g.delivery_settings->>'eventLocation'), ''), 120)
WHERE g.event_location IS NULL;

-- access_type — normalise everything to the allowed enum. Anything that is
-- not 'public'/'password'/'code' (or NULL) collapses to 'public'. This also
-- keeps the existing default for the 7 rows that have NULL accessType today.
UPDATE galleries g
SET access_type = CASE
    LOWER(COALESCE(NULLIF(g.delivery_settings->>'accessType', ''), 'public'))
    WHEN 'public'   THEN 'public'
    WHEN 'password' THEN 'password'
    WHEN 'code'     THEN 'code'
    ELSE 'public'
  END
WHERE g.access_type = 'public'  -- only touch rows still on the default
  AND g.delivery_settings ? 'accessType';

-- client_code_hash — hash the legacy plaintext clientCode with bcrypt
-- (pgcrypto). Skip when the column is already populated or there is no
-- plaintext code. password_hash from migration 057 already covers the
-- 'password' access type — do not duplicate it here.
UPDATE galleries g
SET client_code_hash = crypt(g.delivery_settings->>'clientCode', gen_salt('bf', 10))
WHERE g.client_code_hash IS NULL
  AND NULLIF(g.delivery_settings->>'clientCode', '') IS NOT NULL;

-- ── 4. Validate the deferred CHECK constraints ───────────────────────────────
ALTER TABLE galleries VALIDATE CONSTRAINT galleries_event_type_len_check;
ALTER TABLE galleries VALIDATE CONSTRAINT galleries_event_location_len_check;
ALTER TABLE galleries VALIDATE CONSTRAINT galleries_access_type_check;

-- ── 5. Index the predicate the dashboard actually filters on ─────────────────
CREATE INDEX IF NOT EXISTS galleries_event_date_idx
  ON galleries (event_date)
  WHERE event_date IS NOT NULL;

COMMIT;

-- ── Post-condition verification (run manually) ───────────────────────────────
-- SELECT
--   count(*)                                              AS total,
--   count(event_date)                                     AS event_date_populated,
--   count(*) - count(event_date)                          AS event_date_null,
--   count(event_type)                                     AS event_type_populated,
--   count(*) - count(event_type)                          AS event_type_null,
--   count(event_location)                                 AS event_location_populated,
--   count(*) - count(event_location)                      AS event_location_null,
--   count(*) FILTER (WHERE access_type = 'public')        AS access_public,
--   count(*) FILTER (WHERE access_type = 'password')      AS access_password,
--   count(*) FILTER (WHERE access_type = 'code')          AS access_code,
--   count(client_code_hash)                               AS client_code_hash_populated
-- FROM galleries;
