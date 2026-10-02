-- ─────────────────────────────────────────────────────────────────────────────
-- 008_backfill_business_id.sql
-- Assigns every legacy gallery / client (created before ownership existed) to
-- the business owned by ONE specific auth user. Run AFTER 005, 006, 007 and
-- BEFORE 009.
--
-- ⚠ MANUAL STEP REQUIRED:
--   Replace the placeholder <<<YOUR_USER_UUID>>> below with your actual auth
--   user UUID. You can find it in:
--     Supabase Dashboard → Authentication → Users → click your row → copy `id`
--
-- This migration ONLY UPDATEs rows where business_id IS NULL. It NEVER
-- inserts or deletes anything.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Sanity-check first: confirm that the supplied user has exactly one business.
DO $$
DECLARE
  biz_id UUID;
BEGIN
  SELECT id INTO biz_id
  FROM businesses
  WHERE user_id = '<<<YOUR_USER_UUID>>>'::uuid
  LIMIT 1;

  IF biz_id IS NULL THEN
    RAISE EXCEPTION 'No business found for user_id <<<YOUR_USER_UUID>>>. Complete onboarding first, then re-run this migration.';
  END IF;
END $$;

-- Backfill galleries
UPDATE galleries
   SET business_id = (SELECT id FROM businesses WHERE user_id = '<<<YOUR_USER_UUID>>>'::uuid LIMIT 1)
 WHERE business_id IS NULL;

-- Backfill clients
UPDATE clients
   SET business_id = (SELECT id FROM businesses WHERE user_id = '<<<YOUR_USER_UUID>>>'::uuid LIMIT 1)
 WHERE business_id IS NULL;

COMMIT;

-- After running, verify there are no leftover NULLs:
--   SELECT count(*) FROM galleries WHERE business_id IS NULL;  -- expect 0
--   SELECT count(*) FROM clients   WHERE business_id IS NULL;  -- expect 0
