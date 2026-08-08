-- Rollback for 104_retire_gallery_paywall.sql — restores the 078 lock predicate
-- verbatim, re-enabling the one-time paywall gate. (Does not re-add UI/webhook.)

BEGIN;

CREATE OR REPLACE FUNCTION gallery_is_locked(p_gallery_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT g.requires_payment
            AND NOT (g.one_time_paid AND COALESCE(g.paid_expires_at > now(), false))
       FROM galleries g WHERE g.id = p_gallery_id),
    false);
$$;
GRANT EXECUTE ON FUNCTION gallery_is_locked(uuid) TO anon, authenticated;

COMMIT;
