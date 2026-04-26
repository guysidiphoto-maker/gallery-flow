-- ─────────────────────────────────────────────────────────────────────────────
-- 037_stories_per_section.sql
-- Allow a story to be scoped to a specific gallery section so each event
-- (section) inside a multi-day gallery can have its own clean / fast-social /
-- vintage trio. NULL keeps the legacy "story belongs to the whole gallery"
-- meaning so old galleries don't break during the rollout.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS section_id UUID
    REFERENCES gallery_sections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS stories_section_idx ON stories(section_id);

COMMIT;
