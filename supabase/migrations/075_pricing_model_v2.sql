-- ─────────────────────────────────────────────────────────────────────────────
-- 075_pricing_model_v2.sql — Pricing model v2 (decided 2026-06-20)
--
-- Locks the subscription model from docs/pricing-and-cost-model-2026-06-20.md:
--   • Three paid tiers, each a MONTHLY photo allowance (tokens) that RESETS
--     every billing cycle (use-it-or-lose-it) — not the old cumulative grant.
--   • Per-tier storage caps (the real cost guardrail; storage accumulates).
--   • New "agency" tier.
--
-- This migration is ADDITIVE and SAFE:
--   • adds the agency plan row + sets token_count / storage_limit_bytes,
--   • widens the token_ledger reason CHECK to allow 'subscription_reset',
--   • adds reset_subscription_tokens() (service_role) for the webhook to call
--     on each successful monthly charge INSTEAD of add_tokens().
-- It does NOT change record_image_upload (consumption) or storage enforcement
-- — those land in later PRs.
--
-- Token amounts / storage caps:
--   tier      photos/mo   storage cap
--   starter        100    2 GB     (free trial; one-time, no monthly reset)
--   pro          2,000    75 GB
--   business    10,000    400 GB
--   agency      30,000    1.5 TB
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Plans: token allowance + storage caps + the new agency tier ──────────
-- token_count (added in 044) is the monthly allowance. storage_limit_bytes
-- (added in 015) is the cap enforced on upload (PR3). GiB = 1024^3.
UPDATE plans SET token_count = 100,    storage_limit_bytes = 2::bigint    * 1024*1024*1024 WHERE id = 'starter';
UPDATE plans SET token_count = 2000,   storage_limit_bytes = 75::bigint   * 1024*1024*1024 WHERE id = 'pro';
UPDATE plans SET token_count = 10000,  storage_limit_bytes = 400::bigint  * 1024*1024*1024 WHERE id = 'business';

-- New agency tier. Prices stored in USD cents per the existing schema (ILS is
-- the display currency in the app / LemonSqueezy): ₪349 ≈ $94 ≈ 9400¢.
INSERT INTO plans (id, name, price_monthly_cents, price_annual_cents,
                   max_galleries, max_photos_per_month, storage_limit_bytes,
                   watermark_enabled, stories_enabled, custom_branding_enabled, custom_domain_enabled,
                   sort_order, token_count)
VALUES
  ('agency', 'Agency', 9400, 7900,
   NULL, 30000, 1536::bigint * 1024*1024*1024,
   false, true, true, true,
   3, 30000)
ON CONFLICT (id) DO UPDATE SET
  name                    = EXCLUDED.name,
  price_monthly_cents     = EXCLUDED.price_monthly_cents,
  price_annual_cents      = EXCLUDED.price_annual_cents,
  max_photos_per_month    = EXCLUDED.max_photos_per_month,
  storage_limit_bytes     = EXCLUDED.storage_limit_bytes,
  watermark_enabled       = EXCLUDED.watermark_enabled,
  stories_enabled         = EXCLUDED.stories_enabled,
  custom_branding_enabled = EXCLUDED.custom_branding_enabled,
  custom_domain_enabled   = EXCLUDED.custom_domain_enabled,
  sort_order              = EXCLUDED.sort_order,
  token_count             = EXCLUDED.token_count,
  updated_at              = now();

-- ── 2. Allow a 'subscription_reset' ledger reason ───────────────────────────
-- The ledger is append-only; a monthly reset writes a delta (which may be
-- negative when unused allowance is wiped). Widen the CHECK to permit it.
ALTER TABLE token_ledger DROP CONSTRAINT IF EXISTS token_ledger_reason_check;
ALTER TABLE token_ledger ADD CONSTRAINT token_ledger_reason_check
  CHECK (reason IN (
    'signup_grant', 'purchase', 'image_upload',
    'refund', 'chargeback', 'admin_grant', 'admin_deduct',
    'subscription_reset'
  ));

-- ── 3. reset_subscription_tokens() — service_role only ──────────────────────
-- Called by the LemonSqueezy webhook on subscription_created and on every
-- recurring subscription_payment_success. SETS the balance to the plan's
-- monthly allowance (does NOT add), implementing use-it-or-lose-it. Idempotent
-- per (business, ref_id): a retried webhook for the same charge is a no-op.
--
-- NOTE: this assumes the balance holds ONLY the subscription allowance — there
-- are currently no separately-purchased token top-ups to preserve. If we ever
-- sell standalone top-up packs, split the balance first (tracked in the plan).
CREATE OR REPLACE FUNCTION reset_subscription_tokens(
  p_business_id UUID,
  p_count       INTEGER,
  p_ref_id      UUID DEFAULT NULL,
  p_metadata    JSONB DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old_balance INTEGER;
  v_delta       INTEGER;
BEGIN
  IF p_count < 0 THEN RAISE EXCEPTION 'count must be >= 0'; END IF;

  -- Idempotency: skip if this exact charge already reset the balance.
  IF p_ref_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM token_ledger
     WHERE business_id = p_business_id
       AND ref_id = p_ref_id
       AND reason = 'subscription_reset'
  ) THEN
    SELECT balance INTO v_old_balance FROM business_tokens WHERE business_id = p_business_id;
    RETURN COALESCE(v_old_balance, 0);
  END IF;

  -- Current balance (0 if the row doesn't exist yet). The ledger delta must be
  -- (new - old) so sum(delta) over a business stays equal to balance.
  SELECT balance INTO v_old_balance FROM business_tokens WHERE business_id = p_business_id;
  v_old_balance := COALESCE(v_old_balance, 0);
  v_delta := p_count - v_old_balance;

  -- Set balance to the monthly allowance (does NOT add).
  INSERT INTO business_tokens (business_id, balance, lifetime_purchased)
  VALUES (p_business_id, p_count, GREATEST(v_delta, 0))
  ON CONFLICT (business_id) DO UPDATE
     SET balance            = p_count,
         lifetime_purchased = business_tokens.lifetime_purchased + GREATEST(v_delta, 0),
         updated_at         = now();

  INSERT INTO token_ledger (business_id, delta, reason, ref_id, metadata)
  VALUES (p_business_id, v_delta, 'subscription_reset', p_ref_id,
          COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('reset_to', p_count));

  RETURN p_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION reset_subscription_tokens(UUID, INTEGER, UUID, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION reset_subscription_tokens(UUID, INTEGER, UUID, JSONB) TO service_role;

COMMIT;
