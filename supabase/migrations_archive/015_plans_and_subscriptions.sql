-- ─────────────────────────────────────────────────────────────────────────────
-- 015_plans_and_subscriptions.sql
-- Introduces per-business plans and subscriptions. A business is linked to
-- exactly one active subscription which references a plan row. Every free
-- account is auto-assigned the "starter" plan on creation.
--
-- This migration intentionally does NOT include any payment-provider
-- integration. Stripe / Paddle / LemonSqueezy wiring lands in a separate
-- migration once a provider is chosen. Until then, all accounts live on the
-- seeded starter plan and upgrades are performed manually via SQL.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── plans ───────────────────────────────────────────────────────────────────
-- Reference table: one row per plan tier. Limits are enforced by the app.
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,                         -- 'starter' | 'pro' | 'business'
  name TEXT NOT NULL,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  price_annual_cents INTEGER NOT NULL DEFAULT 0,

  -- Hard limits (enforced in the app layer)
  max_galleries INTEGER,                       -- NULL = unlimited
  max_photos_per_month INTEGER,                -- NULL = unlimited
  storage_limit_bytes BIGINT,                  -- NULL = unlimited

  -- Feature flags
  watermark_enabled BOOLEAN NOT NULL DEFAULT true,
  stories_enabled BOOLEAN NOT NULL DEFAULT false,
  custom_branding_enabled BOOLEAN NOT NULL DEFAULT false,
  custom_domain_enabled BOOLEAN NOT NULL DEFAULT false,

  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the three tiers from the marketing site. Prices are in USD cents.
-- Adjust these rows once real cost/margin numbers are settled.
INSERT INTO plans (id, name, price_monthly_cents, price_annual_cents,
                   max_galleries, max_photos_per_month, storage_limit_bytes,
                   watermark_enabled, stories_enabled, custom_branding_enabled, custom_domain_enabled,
                   sort_order)
VALUES
  ('starter',  'Starter',      0,    0,    3,      500,   2  * 1024 * 1024 * 1024,  true,  false, false, false, 0),
  ('pro',      'Pro',       1900, 1600, NULL,    5000,   50 * 1024 * 1024 * 1024,  false, true,  true,  false, 1),
  ('business', 'Business',  3900, 3300, NULL,    NULL,   NULL,                      false, true,  true,  true,  2)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  price_annual_cents = EXCLUDED.price_annual_cents,
  max_galleries = EXCLUDED.max_galleries,
  max_photos_per_month = EXCLUDED.max_photos_per_month,
  storage_limit_bytes = EXCLUDED.storage_limit_bytes,
  watermark_enabled = EXCLUDED.watermark_enabled,
  stories_enabled = EXCLUDED.stories_enabled,
  custom_branding_enabled = EXCLUDED.custom_branding_enabled,
  custom_domain_enabled = EXCLUDED.custom_domain_enabled,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ── subscriptions ───────────────────────────────────────────────────────────
-- One active subscription per business. When we add Stripe, `provider_*`
-- columns will link to external state; `status` becomes the source of truth.
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled', 'trial')),
  billing_cycle TEXT DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'annual')),

  -- Payment-provider linkage (NULL until we wire Stripe/Paddle/etc)
  provider TEXT,                               -- 'stripe' | 'paddle' | 'lemonsqueezy'
  provider_customer_id TEXT,
  provider_subscription_id TEXT,

  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- One active row per business. Enforced partial-unique index: only rows with
-- status IN ('active', 'trial') must be unique per business.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active_per_business
  ON subscriptions(business_id)
  WHERE status IN ('active', 'trial');

CREATE INDEX IF NOT EXISTS subscriptions_business_id_idx ON subscriptions(business_id);

-- ── monthly_usage ───────────────────────────────────────────────────────────
-- Counters for the "photos uploaded this month" limit. Incremented by the
-- publish flow; reset on period rollover. We keep rows per (business, month)
-- so historical usage survives plan changes.
CREATE TABLE IF NOT EXISTS monthly_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,                  -- first day of the month (UTC)
  photos_uploaded INTEGER NOT NULL DEFAULT 0,
  galleries_created INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS monthly_usage_business_period
  ON monthly_usage(business_id, period_start);

-- ── Auto-assign starter plan to every business ──────────────────────────────
CREATE OR REPLACE FUNCTION assign_default_subscription()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO subscriptions (business_id, plan_id, status)
  VALUES (NEW.id, 'starter', 'active')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_default_subscription ON businesses;
CREATE TRIGGER trg_assign_default_subscription
  AFTER INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION assign_default_subscription();

-- Backfill: any existing business that has no subscription gets starter.
INSERT INTO subscriptions (business_id, plan_id, status)
SELECT b.id, 'starter', 'active'
FROM businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.business_id = b.id AND s.status IN ('active', 'trial')
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- plans: readable by anyone (pricing is public)
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_public_select ON plans
  FOR SELECT TO anon, authenticated
  USING (true);

-- subscriptions: owner-only read. Upgrades go through a trusted server
-- function (or webhook) so direct writes from the client are blocked.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_owner_select ON subscriptions
  FOR SELECT TO authenticated
  USING (business_id = current_business_id());

-- monthly_usage: owner-only read; writes via security-definer helper below.
ALTER TABLE monthly_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY monthly_usage_owner_select ON monthly_usage
  FOR SELECT TO authenticated
  USING (business_id = current_business_id());

-- ── Helpers the client can call via RPC ─────────────────────────────────────

-- Returns the current business's active plan row.
CREATE OR REPLACE FUNCTION get_my_plan()
RETURNS TABLE (
  plan_id TEXT,
  name TEXT,
  max_galleries INTEGER,
  max_photos_per_month INTEGER,
  storage_limit_bytes BIGINT,
  watermark_enabled BOOLEAN,
  stories_enabled BOOLEAN,
  custom_branding_enabled BOOLEAN,
  custom_domain_enabled BOOLEAN,
  status TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.max_galleries, p.max_photos_per_month, p.storage_limit_bytes,
         p.watermark_enabled, p.stories_enabled, p.custom_branding_enabled, p.custom_domain_enabled,
         s.status
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.business_id = current_business_id()
    AND s.status IN ('active', 'trial')
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION get_my_plan() TO authenticated;

-- Returns storage + monthly usage + limits in one call, so the client can
-- render a quota widget without multiple round-trips.
CREATE OR REPLACE FUNCTION get_my_usage()
RETURNS TABLE (
  storage_used_bytes BIGINT,
  storage_limit_bytes BIGINT,
  galleries_count INTEGER,
  max_galleries INTEGER,
  photos_this_month INTEGER,
  max_photos_per_month INTEGER,
  plan_id TEXT,
  plan_name TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH biz AS (
    SELECT current_business_id() AS id
  ),
  plan_info AS (
    SELECT p.id, p.name, p.max_galleries, p.max_photos_per_month, p.storage_limit_bytes
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.business_id = (SELECT id FROM biz)
      AND s.status IN ('active', 'trial')
    LIMIT 1
  ),
  storage_used AS (
    SELECT COALESCE(SUM(
      COALESCE(i.thumbnail_size_bytes, 0) +
      COALESCE(i.web_preview_size_bytes, 0) +
      COALESCE((i.metadata->>'original_size')::BIGINT, 0)
    ), 0) AS used_bytes
    FROM images i
    JOIN galleries g ON g.id = i.gallery_id
    WHERE g.business_id = (SELECT id FROM biz)
  ),
  gallery_count AS (
    SELECT COUNT(*)::INTEGER AS count
    FROM galleries
    WHERE business_id = (SELECT id FROM biz)
  ),
  month_usage AS (
    SELECT COALESCE(photos_uploaded, 0) AS photos
    FROM monthly_usage
    WHERE business_id = (SELECT id FROM biz)
      AND period_start = DATE_TRUNC('month', CURRENT_DATE)::DATE
  )
  SELECT
    (SELECT used_bytes FROM storage_used)::BIGINT,
    pi.storage_limit_bytes,
    (SELECT count FROM gallery_count),
    pi.max_galleries,
    COALESCE((SELECT photos FROM month_usage), 0),
    pi.max_photos_per_month,
    pi.id,
    pi.name
  FROM plan_info pi
$$;
GRANT EXECUTE ON FUNCTION get_my_usage() TO authenticated;

-- Called by the publish flow each time a gallery is successfully created,
-- to increment the monthly counters. SECURITY DEFINER so RLS doesn't block
-- the write, but the helper is scoped to the caller's own business.
CREATE OR REPLACE FUNCTION bump_monthly_usage(p_photos INTEGER, p_galleries INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  biz UUID := current_business_id();
  period DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
BEGIN
  IF biz IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO monthly_usage (business_id, period_start, photos_uploaded, galleries_created)
  VALUES (biz, period, p_photos, p_galleries)
  ON CONFLICT (business_id, period_start)
  DO UPDATE SET
    photos_uploaded = monthly_usage.photos_uploaded + EXCLUDED.photos_uploaded,
    galleries_created = monthly_usage.galleries_created + EXCLUDED.galleries_created,
    updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION bump_monthly_usage(INTEGER, INTEGER) TO authenticated;

COMMIT;
