-- ─────────────────────────────────────────────────────────────────────────────
-- _phase6_drafts/002_promote_jsonb_to_columns.sql
--
-- PROPOSAL — NOT WIRED INTO THE MIGRATION SEQUENCE.
-- See docs/PHASE6_ARCHITECTURE_PLAN_2026-05-30.md, concern (a).
--
-- Promotes load-bearing keys out of delivery_settings JSONB into typed
-- columns. Drift normalization (allowDownloads vs downloadsEnabled) happens
-- in the backfill UPDATE so it's a single auditable statement.
--
-- KEEPS delivery_settings in place — the SPA + the RPC dual-write to both
-- for the duration of the transition window. Cleanup migration drops the
-- column later.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Promoted typed columns ─────────────────────────────────────────────
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS access_type        TEXT,
  ADD COLUMN IF NOT EXISTS client_code_hash   TEXT,
  ADD COLUMN IF NOT EXISTS event_date         DATE,
  ADD COLUMN IF NOT EXISTS event_location     TEXT,
  ADD COLUMN IF NOT EXISTS event_type         TEXT,
  ADD COLUMN IF NOT EXISTS downloads_enabled  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS download_quality   TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_id     UUID REFERENCES images(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS face_index_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS face_privacy_mode  TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS presentation_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── 2. Domain constraints ─────────────────────────────────────────────────
-- access_type: NULL allowed during backfill, tightened after cutover.
ALTER TABLE galleries
  ADD CONSTRAINT galleries_access_type_check
  CHECK (access_type IS NULL OR access_type IN ('public', 'password'))
  NOT VALID;

ALTER TABLE galleries
  ADD CONSTRAINT galleries_download_quality_check
  CHECK (download_quality IS NULL OR download_quality IN ('web', 'high', 'original'))
  NOT VALID;

ALTER TABLE galleries
  ADD CONSTRAINT galleries_face_privacy_mode_check
  CHECK (face_privacy_mode IN ('open', 'private'));

-- ── 3. Backfill from delivery_settings ────────────────────────────────────
-- This is the SINGLE PLACE where allowDownloads/downloadsEnabled drift gets
-- resolved. After this, downloadsEnabled wins; allowDownloads is read-only
-- legacy.
UPDATE galleries g
SET
  access_type = COALESCE(
    g.access_type,
    NULLIF(g.delivery_settings->>'accessType', ''),
    CASE WHEN (g.delivery_settings->>'password') IS NOT NULL
              AND (g.delivery_settings->>'password') <> ''
         THEN 'password' ELSE 'public' END
  ),
  event_date = COALESCE(
    g.event_date,
    NULLIF(g.delivery_settings->>'eventDate', '')::date
  ),
  event_location = COALESCE(
    g.event_location,
    NULLIF(g.delivery_settings->>'eventLocation', '')
  ),
  event_type = COALESCE(
    g.event_type,
    NULLIF(g.delivery_settings->>'eventType', '')
  ),
  downloads_enabled = COALESCE(
    (g.delivery_settings->>'downloadsEnabled')::boolean,
    (g.delivery_settings->>'allowDownloads')::boolean,   -- legacy drift key
    true
  ),
  download_quality = COALESCE(
    g.download_quality,
    NULLIF(g.delivery_settings->>'downloadQuality', ''),
    'web'
  ),
  cover_image_id = COALESCE(
    g.cover_image_id,
    NULLIF(g.delivery_settings->>'coverImageId', '')::uuid
  ),
  face_index_enabled = COALESCE(
    (g.delivery_settings->>'faceIndexEnabled')::boolean,
    false
  ),
  face_privacy_mode = COALESCE(
    NULLIF(g.delivery_settings->>'facePrivacyMode', ''),
    'open'
  ),
  -- presentation_settings = everything EXCEPT the promoted keys.
  presentation_settings = (
    g.delivery_settings
      - 'accessType' - 'password' - 'downloadsEnabled' - 'allowDownloads'
      - 'downloadQuality' - 'eventDate' - 'eventLocation' - 'eventType'
      - 'coverImageId' - 'faceIndexEnabled' - 'facePrivacyMode'
  );

-- Hash plaintext clientCode if it exists. Use pgcrypto's crypt() with
-- bcrypt; matches the convention from migration 057_client_auth.
-- NOTE: requires the pgcrypto extension to already be enabled.
UPDATE galleries g
SET client_code_hash = crypt(g.delivery_settings->>'clientCode', gen_salt('bf', 10))
WHERE g.client_code_hash IS NULL
  AND NULLIF(g.delivery_settings->>'clientCode', '') IS NOT NULL;

-- ── 4. Validate the deferred constraints now that data is clean ───────────
ALTER TABLE galleries VALIDATE CONSTRAINT galleries_access_type_check;
ALTER TABLE galleries VALIDATE CONSTRAINT galleries_download_quality_check;

-- ── 5. Indexes for the predicates the SPA actually runs ───────────────────
CREATE INDEX IF NOT EXISTS galleries_event_date_idx
  ON galleries (event_date)
  WHERE event_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS galleries_cover_image_id_idx
  ON galleries (cover_image_id)
  WHERE cover_image_id IS NOT NULL;

COMMIT;

-- ── Post-condition self-checks (run manually) ─────────────────────────────
-- 1. Every live gallery should have access_type set:
--      SELECT count(*) FROM galleries
--      WHERE status = 'live' AND access_type IS NULL;   -- expect 0
--
-- 2. No drift between promoted column and JSONB after backfill:
--      SELECT id FROM galleries
--      WHERE downloads_enabled
--         <> COALESCE((delivery_settings->>'downloadsEnabled')::boolean, true);
--
-- 3. presentation_settings must not contain promoted keys:
--      SELECT id, presentation_settings ? 'downloadsEnabled' AS leaked
--      FROM galleries WHERE presentation_settings ? 'downloadsEnabled';
