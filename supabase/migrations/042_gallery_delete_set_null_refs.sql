-- ─────────────────────────────────────────────────────────────────────────────
-- 042_gallery_delete_set_null_refs.sql
-- Two non-CASCADE FKs to galleries silently block deletion when rows exist:
--   - questionnaires.gallery_id        (mig 024)
--   - events.gallery_id                (mig 023; event_leads links via event_id,
--                                       so SET NULL on events.gallery_id is what
--                                       protects the lead chain when a gallery
--                                       is deleted)
-- The renderer's deleteGalleryFromCloud() ignores the FK violation, so the
-- photographer sees the gallery vanish from the UI but the row stays in the
-- DB and the storage objects stay paid-for forever.
--
-- Switch both to ON DELETE SET NULL: the questionnaire / event-config rows
-- are valuable on their own (responses, lead contacts) and should outlive
-- their source gallery, just unlinked.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE questionnaires
  DROP CONSTRAINT IF EXISTS questionnaires_gallery_id_fkey;
ALTER TABLE questionnaires
  ADD  CONSTRAINT questionnaires_gallery_id_fkey
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE SET NULL;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_gallery_id_fkey;
ALTER TABLE events
  ADD  CONSTRAINT events_gallery_id_fkey
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE SET NULL;

COMMIT;
