-- ─────────────────────────────────────────────────────────────────────────────
-- 009_lock_business_id.sql
-- Final step: forbid any future row from being inserted without a business_id.
-- Run ONLY after 008 has succeeded and the verification SELECTs returned 0.
-- This migration will FAIL (and roll back) if any row still has a NULL
-- business_id, which is the intended safety net.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE galleries ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE clients   ALTER COLUMN business_id SET NOT NULL;

COMMIT;
