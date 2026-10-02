-- ─────────────────────────────────────────────────────────────────────────────
-- 076_gallery_one_time_unlock.sql — One-time gallery purchase (PR2, 2026-06-20)
--
-- The ₪590 one-time "buy this gallery" SKU. A successful LemonSqueezy
-- order_created (custom_data.purpose = 'gallery_unlock') calls
-- mark_gallery_paid(), which flags one gallery as paid + extends retention.
-- Works for both flows (photographer buys & bundles, or the couple pays
-- directly) — the webhook only needs business_id + gallery_id from custom_data.
--
-- ADDITIVE and SAFE: adds nullable columns + one service_role RPC. Default
-- retention extension is 12 months; the future archive cron (PR5) will spare
-- galleries whose paid_expires_at is in the future.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS one_time_paid       BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS one_time_paid_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_expires_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS one_time_order_ref  UUID;

-- mark_gallery_paid — service_role only (called by the webhook). Idempotent per
-- order: re-running with the same ref_id is a no-op. Verifies the gallery
-- belongs to the claimed business before flipping the flag.
CREATE OR REPLACE FUNCTION mark_gallery_paid(
  p_business_id UUID,
  p_gallery_id  UUID,
  p_ref_id      UUID DEFAULT NULL,
  p_months      INTEGER DEFAULT 12,
  p_metadata    JSONB DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_existing_ref UUID;
BEGIN
  SELECT business_id, one_time_order_ref
    INTO v_owner, v_existing_ref
    FROM galleries WHERE id = p_gallery_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'gallery_not_found'; END IF;
  IF v_owner <> p_business_id THEN RAISE EXCEPTION 'gallery_business_mismatch'; END IF;

  -- Idempotency: this exact order already unlocked the gallery.
  IF p_ref_id IS NOT NULL AND v_existing_ref = p_ref_id THEN
    RETURN false;
  END IF;

  UPDATE galleries
     SET one_time_paid      = true,
         one_time_paid_at   = now(),
         paid_expires_at    = now() + make_interval(months => GREATEST(p_months, 1)),
         one_time_order_ref = COALESCE(p_ref_id, one_time_order_ref)
   WHERE id = p_gallery_id;

  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION mark_gallery_paid(UUID, UUID, UUID, INTEGER, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION mark_gallery_paid(UUID, UUID, UUID, INTEGER, JSONB) TO service_role;

COMMIT;
