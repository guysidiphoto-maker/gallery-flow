-- ─────────────────────────────────────────────────────────────────────────────
-- 042_gallery_delete_set_null_refs.sql
-- Two non-CASCADE FKs to galleries silently block deletion when rows exist:
--   - questionnaires.gallery_id        (mig 024)
--   - event_leads.gallery_id           (mig 023)
-- The renderer's deleteGalleryFromCloud() ignores the FK violation, so the
-- photographer sees the gallery vanish from the UI but the row stays in the
-- DB and the storage objects stay paid-for forever.
--
-- Switch both to ON DELETE SET NULL: the questionnaire / event-lead rows are
-- valuable on their own (responses, lead contacts) and should outlive their
-- source gallery, just unlinked.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE questionnaires
  DROP CONSTRAINT IF EXISTS questionnaires_gallery_id_fkey;
ALTER TABLE questionnaires
  ADD  CONSTRAINT questionnaires_gallery_id_fkey
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE SET NULL;

ALTER TABLE event_leads
  DROP CONSTRAINT IF EXISTS event_leads_gallery_id_fkey;
ALTER TABLE event_leads
  ADD  CONSTRAINT event_leads_gallery_id_fkey
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE SET NULL;

COMMIT;
