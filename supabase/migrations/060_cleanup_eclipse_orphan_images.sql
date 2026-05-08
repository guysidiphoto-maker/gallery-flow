-- 060_cleanup_eclipse_orphan_images.sql
--
-- Phase 4.5 prerequisite: clear the 6 orphan rows discovered during the
-- Phase 4.2 backfill. All 6 are in a single Eclipse Media gallery
-- (6a8bd092-c265-42cc-a583-b52888babe43). Their `thumbnail_path` references
-- storage objects that don't exist.
--
-- Verified via storage.objects probe (see PHASE_4_WRAP_UP_2026_05_08.md):
--   - 4 rows: nothing in storage at all (thumb + web + original missing)
--     → DELETE the rows entirely.
--   - 2 rows: web + original exist, only thumb missing
--     → NULL the thumbnail_path; renderer falls back to web_preview_path.
-- Both partials retain their face-search index entries and AI scores.
--
-- This unblocks the Phase 4.5 bucket-flip gate:
--   SELECT count(*) FROM images
--    WHERE public_thumb_present = false AND thumbnail_path IS NOT NULL;
-- Must return 0 before flipping `gallery-images` to private.
--
-- Already applied to production via MCP 2026-05-08; this file is the git record.

BEGIN;

-- 2 partial-orphans: web+original intact, only thumb is missing.
UPDATE images
   SET thumbnail_path = NULL
 WHERE id IN (
   '5d2547ff-a131-46b4-918a-189f2021a9e0',
   'f74a96ed-9c2e-48ee-8384-95d8361de072'
 );

-- 4 fully-broken: nothing in storage at all. Delete the rows.
DELETE FROM images
 WHERE id IN (
   '0312cb97-73ae-45c2-a203-fbb577ebfc38',
   '7d4e1cd9-f765-4aef-9516-e557e174dd76',
   '835d72da-f29d-4fbc-8a1c-0aa6adb83208',
   'aad3059c-1c10-4540-a9b5-29a9cd6e18de'
 );

-- Decrement gallery image_count by the 4 deleted rows.
UPDATE galleries
   SET image_count = GREATEST(0, image_count - 4)
 WHERE id = '6a8bd092-c265-42cc-a583-b52888babe43';

COMMIT;
