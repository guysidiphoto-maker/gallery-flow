-- ─────────────────────────────────────────────────────────────────────────────
-- 104_retire_gallery_paywall.sql — Retire the one-time "$150 gallery unlock"
-- client-payment feature (NON-DESTRUCTIVE).
--
-- The feature let a photographer opt a gallery into a paywall (requires_payment)
-- that withheld all images from the public viewer until a one-time payment.
-- It is being removed. The ONLY behavioral change needed server-side is to
-- guarantee the paywall can never lock a gallery again:
--
--   gallery_is_locked() is redefined to ALWAYS return false.
--
-- Because gallery_get_images() and gallery_bootstrap() (migration 078) call
-- gallery_is_locked() as their only gate, neutralizing this one function makes
-- every gallery — including any with a historical requires_payment = true —
-- serve its images normally, governed solely by its publish / privacy /
-- password / client-assignment rules. No gallery is ever locked by payment
-- state again.
--
-- DELIBERATELY NON-DESTRUCTIVE:
--   • No columns are dropped: galleries.requires_payment, one_time_paid,
--     one_time_paid_at, paid_expires_at, one_time_order_ref all remain, so
--     historical values and any audit data are preserved.
--   • mark_gallery_paid() (076) is left in place but is no longer called by any
--     code path (the webhook handler was removed). It is harmless dormant.
--   • No payment records are altered; no refunds are issued.
--   • gallery_get_images() and gallery_bootstrap() keep their exact signatures
--     and still return a `locked` flag — which is now always false.
--
-- Reversible: the rollback restores the 078 lock predicate verbatim.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION gallery_is_locked(p_gallery_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Paywall retired: a gallery is never locked by payment state. The argument
  -- is intentionally unused; the signature is preserved so callers
  -- (gallery_get_images, gallery_bootstrap) need no change.
  SELECT false;
$$;
GRANT EXECUTE ON FUNCTION gallery_is_locked(uuid) TO anon, authenticated;

COMMENT ON FUNCTION gallery_is_locked(uuid) IS
  'Retired one-time paywall gate (migration 104): always returns false so a '
  'gallery is never locked by payment state. Columns requires_payment / '
  'one_time_paid / paid_expires_at are retained for history but no longer gate.';

COMMIT;
