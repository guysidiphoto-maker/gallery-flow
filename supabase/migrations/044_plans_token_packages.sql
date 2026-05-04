-- ─────────────────────────────────────────────────────────────────────────────
-- 044_plans_token_packages.sql
-- Repurpose `plans` so each plan is a token package. The webhook grants
-- plan.token_count tokens on every successful order_created /
-- subscription_payment_success event (recurring grants for subscriptions).
--
-- Existing plan rows (starter / pro / business) keep their LemonSqueezy ids
-- and feature flags; we just attach a token allocation to each.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS token_count INTEGER NOT NULL DEFAULT 0;

UPDATE plans SET token_count = 100  WHERE id = 'starter';
UPDATE plans SET token_count = 2000 WHERE id = 'pro';
UPDATE plans SET token_count = 10000 WHERE id = 'business';

COMMIT;
