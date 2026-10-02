-- ─────────────────────────────────────────────────────────────────────────────
-- 043_token_economy.sql
-- Token-per-photo billing model.
--
-- 1 token = 1 successful image upload. Photographer gets 100 free tokens on
-- signup; tops up via LemonSqueezy. Every image insert deducts 1 token in the
-- same transaction. Ledger preserves a full audit trail (purchase / consume /
-- refund / admin_grant) so we can reconcile, investigate disputes, and refund.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── business_tokens ─────────────────────────────────────────────────────────
-- One row per business. Holds the live balance + lifetime counters for fast
-- "credits available" lookups. Lifetime fields are convenience aggregates
-- maintained alongside the ledger inserts; the ledger is still the source of
-- truth for reconciliation.
CREATE TABLE IF NOT EXISTS business_tokens (
  business_id        UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  balance            INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_purchased INTEGER NOT NULL DEFAULT 0,
  lifetime_consumed  INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE business_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_tokens_owner_select ON business_tokens
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = business_tokens.business_id
               AND b.user_id = auth.uid())
  );
-- All writes go through SECURITY DEFINER RPCs.

-- ── token_ledger ────────────────────────────────────────────────────────────
-- Append-only audit trail. Every balance change inserts a row. `delta` can be
-- positive (purchase, refund, admin_grant) or negative (image_upload,
-- chargeback). Sum(delta) over a business should always equal balance.
CREATE TABLE IF NOT EXISTS token_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  delta         INTEGER NOT NULL,
  reason        TEXT NOT NULL CHECK (reason IN (
                  'signup_grant', 'purchase', 'image_upload',
                  'refund', 'chargeback', 'admin_grant', 'admin_deduct'
                )),
  ref_id        UUID,           -- gallery_id / image_id / lemonsqueezy order id
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS token_ledger_business_idx
  ON token_ledger(business_id, created_at DESC);

ALTER TABLE token_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY token_ledger_owner_select ON token_ledger
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM businesses b
             WHERE b.id = token_ledger.business_id
               AND b.user_id = auth.uid())
  );

-- ── Signup grant trigger ────────────────────────────────────────────────────
-- New businesses get 100 free tokens. Implemented as a trigger so we can't
-- forget to call it from the app, and so admins can recreate the row safely
-- in incident recovery without double-granting.
CREATE OR REPLACE FUNCTION _grant_signup_tokens() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO business_tokens (business_id, balance, lifetime_purchased)
  VALUES (NEW.id, 100, 100)
  ON CONFLICT (business_id) DO NOTHING;
  -- Only insert ledger row if we actually created the row above.
  IF FOUND THEN
    INSERT INTO token_ledger (business_id, delta, reason, metadata)
    VALUES (NEW.id, 100, 'signup_grant',
            jsonb_build_object('source', 'business_insert_trigger'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_grant_signup_tokens ON businesses;
CREATE TRIGGER businesses_grant_signup_tokens
  AFTER INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION _grant_signup_tokens();

-- Backfill: any business already in prod gets the row (balance 100 if they've
-- never had any tokens — these are alma + lsports + the founder's own row).
INSERT INTO business_tokens (business_id, balance, lifetime_purchased)
SELECT b.id, 100, 100
  FROM businesses b
 WHERE NOT EXISTS (SELECT 1 FROM business_tokens t WHERE t.business_id = b.id)
ON CONFLICT DO NOTHING;

INSERT INTO token_ledger (business_id, delta, reason, metadata)
SELECT b.id, 100, 'signup_grant',
       jsonb_build_object('source', 'backfill_2026_05_04')
  FROM businesses b
 WHERE NOT EXISTS (
   SELECT 1 FROM token_ledger l
    WHERE l.business_id = b.id AND l.reason = 'signup_grant'
 );

-- ── RPCs ────────────────────────────────────────────────────────────────────
-- get_my_token_balance() — fast read for the dashboard sidebar badge.
CREATE OR REPLACE FUNCTION get_my_token_balance()
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_balance INTEGER;
BEGIN
  SELECT id INTO v_business_id FROM businesses WHERE user_id = auth.uid() LIMIT 1;
  IF v_business_id IS NULL THEN RETURN 0; END IF;
  SELECT balance INTO v_balance FROM business_tokens WHERE business_id = v_business_id;
  RETURN COALESCE(v_balance, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION get_my_token_balance() TO authenticated;

-- record_image_upload — the ONLY way a row should land in `images` from the
-- web. Atomically: validates ownership, consumes 1 token, inserts the row,
-- writes a ledger entry. Everything in one transaction → if any step fails
-- the token isn't burned. Returns the new image id (or raises).
CREATE OR REPLACE FUNCTION record_image_upload(
  p_gallery_id        UUID,
  p_filename          TEXT,
  p_web_preview_path  TEXT,
  p_thumbnail_path    TEXT,
  p_original_path     TEXT,
  p_original_size     BIGINT DEFAULT NULL,
  p_section_id        UUID DEFAULT NULL,
  p_sort_order        INTEGER DEFAULT 0
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_owner_user  UUID;
  v_balance     INTEGER;
  v_image_id    UUID;
BEGIN
  -- Authz: caller must be the gallery's owning business user.
  SELECT g.business_id, b.user_id
    INTO v_business_id, v_owner_user
    FROM galleries g JOIN businesses b ON b.id = g.business_id
   WHERE g.id = p_gallery_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'gallery_not_found';
  END IF;
  IF v_owner_user IS NULL OR v_owner_user <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Consume token. UPDATE…WHERE balance > 0 prevents going negative under
  -- race; the missing RETURN means the photographer is out.
  UPDATE business_tokens
     SET balance = balance - 1,
         lifetime_consumed = lifetime_consumed + 1,
         updated_at = now()
   WHERE business_id = v_business_id AND balance > 0
   RETURNING balance INTO v_balance;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient_tokens';
  END IF;

  -- Insert image.
  INSERT INTO images (
    gallery_id, filename,
    web_preview_path, thumbnail_path, original_path,
    original_uploaded, original_size_bytes,
    section_id, sort_order, is_top_pick
  ) VALUES (
    p_gallery_id, p_filename,
    p_web_preview_path, p_thumbnail_path, p_original_path,
    p_original_path IS NOT NULL, p_original_size,
    p_section_id, COALESCE(p_sort_order, 0), false
  )
  RETURNING id INTO v_image_id;

  -- Ledger.
  INSERT INTO token_ledger (business_id, delta, reason, ref_id, metadata)
  VALUES (v_business_id, -1, 'image_upload', v_image_id,
          jsonb_build_object('gallery_id', p_gallery_id, 'filename', p_filename));

  -- Bump the gallery's image_count counter (best-effort; reconcile on a sweep).
  UPDATE galleries SET image_count = COALESCE(image_count, 0) + 1
   WHERE id = p_gallery_id;

  RETURN v_image_id;
END;
$$;
GRANT EXECUTE ON FUNCTION record_image_upload(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, UUID, INTEGER) TO authenticated;

-- add_tokens — service-role only. Called by the LemonSqueezy webhook.
CREATE OR REPLACE FUNCTION add_tokens(
  p_business_id UUID,
  p_count       INTEGER,
  p_reason      TEXT,
  p_ref_id      UUID DEFAULT NULL,
  p_metadata    JSONB DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_count <= 0 THEN RAISE EXCEPTION 'count must be positive'; END IF;
  IF p_reason NOT IN ('purchase', 'refund', 'admin_grant') THEN
    RAISE EXCEPTION 'invalid reason for credit: %', p_reason;
  END IF;

  INSERT INTO business_tokens (business_id, balance, lifetime_purchased)
  VALUES (p_business_id, p_count, CASE WHEN p_reason = 'purchase' THEN p_count ELSE 0 END)
  ON CONFLICT (business_id) DO UPDATE
     SET balance = business_tokens.balance + EXCLUDED.balance,
         lifetime_purchased = business_tokens.lifetime_purchased
                            + CASE WHEN p_reason = 'purchase' THEN p_count ELSE 0 END,
         updated_at = now()
  RETURNING balance INTO v_balance;

  INSERT INTO token_ledger (business_id, delta, reason, ref_id, metadata)
  VALUES (p_business_id, p_count, p_reason, p_ref_id, p_metadata);

  RETURN v_balance;
END;
$$;
REVOKE EXECUTE ON FUNCTION add_tokens(UUID, INTEGER, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION add_tokens(UUID, INTEGER, TEXT, UUID, JSONB) TO service_role;

COMMIT;
