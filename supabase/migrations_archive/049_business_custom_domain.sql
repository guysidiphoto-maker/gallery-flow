-- ─────────────────────────────────────────────────────────────────────────────
-- 049_business_custom_domain.sql
-- Foundation for custom domains on the photographer's business account.
--
-- Adds the four columns that describe a custom-domain claim, plus an RPC the
-- dashboard calls to lock in a chosen domain and receive the DNS TXT record
-- the photographer has to add. Actual DNS verification + Vercel provisioning
-- ship in a later migration; this one is purely the persistence layer.
--
-- The `businesses_owner_select` / `businesses_owner_update` policies from
-- migration 006 already let the owner read and update their own row, so no
-- new RLS policies are required for these columns. INSERT remains governed
-- by the existing signup policy.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Schema ──────────────────────────────────────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS custom_domain TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS custom_domain_verification_token TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain_added_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS custom_domain_verified_at TIMESTAMPTZ;

-- Idempotent constraint: drop-then-add so re-running the migration on a DB
-- where the constraint already exists with a different definition is safe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'businesses_custom_domain_status_check'
  ) THEN
    ALTER TABLE businesses DROP CONSTRAINT businesses_custom_domain_status_check;
  END IF;
END $$;

ALTER TABLE businesses
  ADD CONSTRAINT businesses_custom_domain_status_check
  CHECK (custom_domain_status IN ('unverified','pending_dns','verified','error'));

-- One business per domain. Stored lowercased so case-insensitive uniqueness
-- holds without a functional index. Nullable: most accounts won't claim one.
CREATE UNIQUE INDEX IF NOT EXISTS businesses_custom_domain_unique
  ON businesses(custom_domain)
  WHERE custom_domain IS NOT NULL;

-- ── RPC: set_business_custom_domain ─────────────────────────────────────────
-- Validates the domain, refuses pixflow-ai.com / its subdomains, refuses
-- domains already claimed by another business, refuses callers whose plan
-- doesn't include custom_domain_enabled, and writes the new claim with a
-- fresh verification token in `pending_dns` state.
--
-- Authorization comes from auth.uid() — we look up the caller's own business
-- row so a malicious client can't pass someone else's business id.
CREATE OR REPLACE FUNCTION set_business_custom_domain(p_domain TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_biz_id UUID;
  v_domain TEXT;
  v_token TEXT;
  v_plan_allows BOOLEAN;
  v_taken BOOLEAN;
BEGIN
  -- Auth gate. Every other branch assumes a logged-in caller.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Find the caller's business. One business per user is enforced by the
  -- unique index on businesses(user_id) from migration 002.
  SELECT id INTO v_biz_id
  FROM businesses
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_biz_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_business');
  END IF;

  -- Normalize: trim + lowercase. Keeps validation and uniqueness simple.
  v_domain := lower(trim(coalesce(p_domain, '')));

  IF v_domain = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_domain');
  END IF;

  -- Reject anything containing pixflow-ai.com — including the apex itself —
  -- so a malicious user can't claim a subdomain of our own marketing domain
  -- and start serving content under it.
  IF v_domain = 'pixflow-ai.com' OR v_domain LIKE '%.pixflow-ai.com' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reserved_domain');
  END IF;

  -- Hostname validation. Each label is 1-63 chars, starts and ends with
  -- alphanumeric, can contain hyphens in the middle. At least one dot
  -- (so bare hostnames like "localhost" don't pass). No protocol prefix.
  IF v_domain !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_format');
  END IF;

  -- Plan gate. Only the `business` tier currently has custom_domain_enabled,
  -- but we read the flag rather than hard-coding the plan id so future
  -- pricing changes don't require a code change.
  SELECT COALESCE(p.custom_domain_enabled, false)
    INTO v_plan_allows
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.business_id = v_biz_id
    AND s.status IN ('active', 'trial')
  LIMIT 1;

  IF NOT COALESCE(v_plan_allows, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'plan_not_eligible');
  END IF;

  -- Uniqueness check (other businesses only — re-claiming our own domain is
  -- allowed and just rotates the verification token).
  SELECT EXISTS (
    SELECT 1 FROM businesses
    WHERE custom_domain = v_domain
      AND id <> v_biz_id
  ) INTO v_taken;

  IF v_taken THEN
    RETURN jsonb_build_object('ok', false, 'error', 'domain_taken');
  END IF;

  -- 32-char hex token. encode(gen_random_bytes(16),'hex') gives 32 chars
  -- and is cryptographically random courtesy of pgcrypto.
  v_token := encode(gen_random_bytes(16), 'hex');

  UPDATE businesses
     SET custom_domain = v_domain,
         custom_domain_status = 'pending_dns',
         custom_domain_verification_token = v_token,
         custom_domain_added_at = COALESCE(custom_domain_added_at, now()),
         custom_domain_verified_at = NULL
   WHERE id = v_biz_id;

  RETURN jsonb_build_object(
    'ok', true,
    'domain', v_domain,
    'verification_token', v_token,
    'dns_record', jsonb_build_object(
      'type', 'TXT',
      'name', '_pixflow-verify.' || v_domain,
      'value', v_token
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION set_business_custom_domain(TEXT) TO authenticated;

COMMIT;
