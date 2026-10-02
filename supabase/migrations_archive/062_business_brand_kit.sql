-- ─────────────────────────────────────────────────────────────────────────────
-- 062_business_brand_kit.sql
-- Add a brand_kit JSONB column to businesses so the photographer's studio
-- identity (logo, primary color, voice, social links) can be reused across
-- client-facing surfaces — first user is the branded share email.
--
-- Shape (documented here, not enforced via CHECK because the kit is expected
-- to evolve as the AI Visual OS expands):
--   {
--     "logo":   { "url": "https://..." },
--     "colors": { "primary": "#hex", "ink": "#hex" },
--     "voice":  { "tagline": "...", "signature": "...", "language": "he"|"en" },
--     "social": { "instagram": "https://...", "website": "https://...", "email": "..." }
--   }
--
-- All branches are optional. Consumers must treat each field as nullable and
-- fall back to the existing plain branding when the kit is absent.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS brand_kit JSONB;

COMMENT ON COLUMN businesses.brand_kit IS
  'Studio brand kit consumed by client-facing surfaces (branded share email, public gallery chrome). See migration 062 for shape.';

COMMIT;
