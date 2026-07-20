-- 085_admin_credit_grants.sql — owner-only admin: idempotent credit grants +
-- read-only user list + grant audit.
--
-- Numbering: literal next is 083, but 083 = the reverted face-index billing
-- migration (may be re-landed) and 084 = the reserved private-storage plan, so
-- this uses 085 to avoid collision. Does NOT touch 082 or reintroduce 083.
--
-- Uses the EXISTING credit model (business_tokens + token_ledger, reason
-- 'admin_grant'). All privileged RPCs are SECURITY DEFINER and granted ONLY to
-- service_role — they are called by the `admin` Edge Function AFTER it verifies
-- the caller's JWT against the ADMIN_USER_IDS allowlist. A browser/authenticated
-- client can never call them directly through PostgREST.

BEGIN;

-- ── Idempotency backstop ────────────────────────────────────────────────────
-- One admin_grant per request id. A retry / double-click reuses the same
-- request_id and conflicts here, so the balance is never credited twice — even
-- under a race (the DB, not the app, is the source of truth for uniqueness).
CREATE UNIQUE INDEX IF NOT EXISTS ux_token_ledger_admin_grant_ref
  ON token_ledger (ref_id)
  WHERE reason = 'admin_grant' AND ref_id IS NOT NULL;

-- ── Idempotent admin credit grant ───────────────────────────────────────────
-- Returns {granted, duplicate, balance, business_id}. Positive integer only,
-- bounded. Records acting admin + internal reason + request id + timestamp in
-- the ledger metadata. NEVER updates business_tokens.balance unless a NEW ledger
-- row was inserted (so a duplicate request grants nothing and returns the
-- current balance). No deduction path.
CREATE OR REPLACE FUNCTION public.admin_grant_credits(
  p_business_id uuid,
  p_count       integer,
  p_reason      text,
  p_admin_id    uuid,
  p_request_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_ins uuid; v_balance integer; v_max constant integer := 1000000;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'request_id required'; END IF;
  IF p_admin_id IS NULL THEN RAISE EXCEPTION 'admin_id required'; END IF;
  IF p_count IS NULL OR p_count <= 0 THEN RAISE EXCEPTION 'count must be a positive integer'; END IF;
  IF p_count > v_max THEN RAISE EXCEPTION 'count exceeds max %', v_max; END IF;
  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN RAISE EXCEPTION 'business_not_found'; END IF;

  -- Idempotent ledger insert (unique per request id). If it conflicts, this is a
  -- duplicate request → grant nothing.
  INSERT INTO token_ledger (business_id, delta, reason, ref_id, metadata)
  VALUES (p_business_id, p_count, 'admin_grant', p_request_id,
          jsonb_build_object('admin_id', p_admin_id, 'reason', left(COALESCE(p_reason,''),500),
                             'request_id', p_request_id, 'granted_at', now()))
  ON CONFLICT (ref_id) WHERE reason='admin_grant' AND ref_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_ins;

  IF v_ins IS NULL THEN
    -- Duplicate request: return the current balance, granted=false.
    SELECT COALESCE(balance,0) INTO v_balance FROM business_tokens WHERE business_id = p_business_id;
    RETURN jsonb_build_object('granted', false, 'duplicate', true, 'balance', COALESCE(v_balance,0), 'business_id', p_business_id);
  END IF;

  -- First time for this request id → credit the balance atomically.
  INSERT INTO business_tokens (business_id, balance)
  VALUES (p_business_id, p_count)
  ON CONFLICT (business_id) DO UPDATE
    SET balance = business_tokens.balance + EXCLUDED.balance, updated_at = now()
  RETURNING balance INTO v_balance;

  RETURN jsonb_build_object('granted', true, 'duplicate', false, 'balance', v_balance, 'business_id', p_business_id);
END $function$;

-- ── Read-only user list (paginated + searchable) ────────────────────────────
-- Email comes from auth.users (SECURITY DEFINER read). NO password/token/secret
-- data. total_count is the filtered total (window) for pagination. gallery_count
-- is a cheap per-business subquery.
CREATE OR REPLACE FUNCTION public.admin_list_businesses(
  p_search text DEFAULT NULL, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0
) RETURNS TABLE(
  business_id uuid, email text, business_name text, slug text, created_at timestamptz,
  plan_id text, plan_name text, subscription_status text, balance integer,
  gallery_count integer, total_count bigint
) LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH filtered AS (
    SELECT b.id, u.email::text AS email, b.business_name, b.slug, b.created_at,
           s.plan_id, p.name AS plan_name, s.status AS subscription_status,
           COALESCE(bt.balance,0) AS balance,
           (SELECT count(*) FROM galleries g WHERE g.business_id = b.id)::int AS gallery_count
    FROM businesses b
    LEFT JOIN auth.users u ON u.id = b.user_id
    LEFT JOIN business_tokens bt ON bt.business_id = b.id
    LEFT JOIN subscriptions s ON s.business_id = b.id AND s.status IN ('active','trial')
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE p_search IS NULL OR p_search = ''
       OR u.email ILIKE '%'||p_search||'%'
       OR b.business_name ILIKE '%'||p_search||'%'
       OR b.id::text = p_search
  )
  SELECT f.id, f.email, f.business_name, f.slug, f.created_at, f.plan_id, f.plan_name,
         f.subscription_status, f.balance, f.gallery_count, count(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC NULLS LAST, f.business_name ASC
  LIMIT GREATEST(LEAST(COALESCE(p_limit,25), 200), 1)
  OFFSET GREATEST(COALESCE(p_offset,0), 0);
$function$;

-- ── Grant audit (recent admin_grant ledger entries) ─────────────────────────
CREATE OR REPLACE FUNCTION public.admin_recent_grants(p_limit integer DEFAULT 50)
RETURNS TABLE(
  ledger_id uuid, business_id uuid, business_name text, amount integer,
  admin_id uuid, admin_email text, reason text, request_id uuid, created_at timestamptz
) LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT tl.id, tl.business_id, b.business_name, tl.delta,
         (tl.metadata->>'admin_id')::uuid AS admin_id,
         au.email::text AS admin_email,
         tl.metadata->>'reason' AS reason,
         tl.ref_id AS request_id,
         tl.created_at
  FROM token_ledger tl
  LEFT JOIN businesses b ON b.id = tl.business_id
  LEFT JOIN auth.users au ON au.id = (tl.metadata->>'admin_id')::uuid
  WHERE tl.reason = 'admin_grant'
  ORDER BY tl.created_at DESC
  LIMIT GREATEST(LEAST(COALESCE(p_limit,50), 500), 1);
$function$;

-- ── Least privilege: service_role only (Edge Function calls these) ──────────
REVOKE EXECUTE ON FUNCTION public.admin_grant_credits(uuid,integer,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_grant_credits(uuid,integer,text,uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_list_businesses(text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_list_businesses(text,integer,integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_recent_grants(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_recent_grants(integer) TO service_role;

COMMIT;
