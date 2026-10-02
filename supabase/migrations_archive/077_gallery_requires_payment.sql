-- ─────────────────────────────────────────────────────────────────────────────
-- 077_gallery_requires_payment.sql — Gate opt-in for the one-time model (PR2)
--
-- A gallery only locks behind the ₪590 paywall when the photographer explicitly
-- opts it into the one-time model. DEFAULT false → every existing gallery (and
-- every subscription photographer's galleries) is unaffected. The gate locks
-- only when:  requires_payment = true AND NOT one_time_paid (075/076 columns).
--
-- ADDITIVE and SAFE: one nullable-with-default boolean. No behavior change until
-- a photographer flips it per gallery.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS requires_payment BOOLEAN NOT NULL DEFAULT false;

COMMIT;
