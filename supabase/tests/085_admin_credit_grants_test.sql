-- 085_admin_credit_grants_test.sql
-- Run AFTER applying 085 (RPCs + index exist). Wrap in a transaction and roll
-- back so nothing persists:
--   BEGIN; \i supabase/tests/085_admin_credit_grants_test.sql ROLLBACK;
-- (Or paste inside a single BEGIN … ROLLBACK block.)
--
-- Covers the DB-level guarantees of the admin backend. The Edge Function's
-- JWT + ADMIN_USER_IDS 401/403 checks are covered separately at the HTTP layer;
-- here we prove the RPCs are service_role-only (so a non-admin browser can never
-- reach them via PostgREST) plus grant idempotency, validation, and the
-- list/audit shape.

DO $$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_user  uuid := gen_random_uuid();
  v_biz   uuid := gen_random_uuid();
  v_req   uuid := gen_random_uuid();
  v_res   jsonb;
  v_bal   integer;
  v_ledger_count integer;
  v_total bigint;
  v_ok    boolean;
BEGIN
  -- ── Fixtures ──────────────────────────────────────────────────────────────
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'admintest@example.com', '', now(), now());
  INSERT INTO businesses (id, user_id, business_name, slug)
  VALUES (v_biz, v_user, 'Admin Test Biz', 'admin-test-biz-'||left(v_biz::text,8));

  -- ── 1. RPCs are service_role-only (non-admin browsers blocked at PostgREST) ─
  ASSERT NOT has_function_privilege('anon', 'public.admin_grant_credits(uuid,integer,text,uuid,uuid)', 'EXECUTE'),
    '1a FAIL: anon can EXECUTE admin_grant_credits';
  ASSERT NOT has_function_privilege('authenticated', 'public.admin_grant_credits(uuid,integer,text,uuid,uuid)', 'EXECUTE'),
    '1b FAIL: authenticated can EXECUTE admin_grant_credits';
  ASSERT NOT has_function_privilege('authenticated', 'public.admin_list_businesses(text,integer,integer)', 'EXECUTE'),
    '1c FAIL: authenticated can EXECUTE admin_list_businesses';
  ASSERT NOT has_function_privilege('authenticated', 'public.admin_recent_grants(integer)', 'EXECUTE'),
    '1d FAIL: authenticated can EXECUTE admin_recent_grants';
  ASSERT has_function_privilege('service_role', 'public.admin_grant_credits(uuid,integer,text,uuid,uuid)', 'EXECUTE'),
    '1e FAIL: service_role cannot EXECUTE admin_grant_credits';
  RAISE NOTICE 'PASS 1: RPCs are service_role-only';

  -- ── 2. Admin can grant credits ─────────────────────────────────────────────
  v_res := admin_grant_credits(v_biz, 100, 'friend account', v_admin, v_req);
  ASSERT (v_res->>'granted')::boolean IS TRUE, '2a FAIL: not granted';
  ASSERT (v_res->>'balance')::int = 100, '2b FAIL: balance != 100';
  SELECT balance INTO v_bal FROM business_tokens WHERE business_id = v_biz;
  ASSERT v_bal = 100, '2c FAIL: business_tokens balance != 100';
  SELECT count(*) INTO v_ledger_count FROM token_ledger WHERE business_id = v_biz AND reason='admin_grant';
  ASSERT v_ledger_count = 1, '2d FAIL: expected 1 ledger row';
  -- audit metadata recorded
  ASSERT EXISTS (SELECT 1 FROM token_ledger WHERE ref_id = v_req
                 AND metadata->>'admin_id' = v_admin::text
                 AND metadata->>'reason' = 'friend account'
                 AND (metadata->>'granted_at') IS NOT NULL), '2e FAIL: metadata not recorded';
  RAISE NOTICE 'PASS 2: grant credited balance + ledger + metadata';

  -- ── 3. Duplicate request_id does NOT grant twice (idempotent) ──────────────
  v_res := admin_grant_credits(v_biz, 100, 'friend account', v_admin, v_req); -- same v_req
  ASSERT (v_res->>'granted')::boolean IS FALSE, '3a FAIL: duplicate reported granted';
  ASSERT (v_res->>'duplicate')::boolean IS TRUE, '3b FAIL: duplicate flag not set';
  ASSERT (v_res->>'balance')::int = 100, '3c FAIL: duplicate changed balance';
  SELECT balance INTO v_bal FROM business_tokens WHERE business_id = v_biz;
  ASSERT v_bal = 100, '3d FAIL: balance changed on duplicate';
  SELECT count(*) INTO v_ledger_count FROM token_ledger WHERE business_id = v_biz AND reason='admin_grant';
  ASSERT v_ledger_count = 1, '3e FAIL: duplicate inserted a second ledger row';
  RAISE NOTICE 'PASS 3: duplicate request_id is idempotent';

  -- ── 4. A different request_id DOES grant again ─────────────────────────────
  v_res := admin_grant_credits(v_biz, 50, 'second grant', v_admin, gen_random_uuid());
  ASSERT (v_res->>'balance')::int = 150, '4a FAIL: balance != 150 after second grant';
  RAISE NOTICE 'PASS 4: distinct request_id grants again';

  -- ── 5. Invalid amounts rejected ────────────────────────────────────────────
  v_ok := false; BEGIN PERFORM admin_grant_credits(v_biz, 0, 'x', v_admin, gen_random_uuid());
    EXCEPTION WHEN others THEN v_ok := true; END; ASSERT v_ok, '5a FAIL: 0 not rejected';
  v_ok := false; BEGIN PERFORM admin_grant_credits(v_biz, -5, 'x', v_admin, gen_random_uuid());
    EXCEPTION WHEN others THEN v_ok := true; END; ASSERT v_ok, '5b FAIL: negative not rejected';
  v_ok := false; BEGIN PERFORM admin_grant_credits(v_biz, 1000001, 'x', v_admin, gen_random_uuid());
    EXCEPTION WHEN others THEN v_ok := true; END; ASSERT v_ok, '5c FAIL: oversized not rejected';
  v_ok := false; BEGIN PERFORM admin_grant_credits(gen_random_uuid(), 10, 'x', v_admin, gen_random_uuid());
    EXCEPTION WHEN others THEN v_ok := true; END; ASSERT v_ok, '5d FAIL: unknown business not rejected';
  -- none of the rejected attempts touched the balance
  SELECT balance INTO v_bal FROM business_tokens WHERE business_id = v_biz;
  ASSERT v_bal = 150, '5e FAIL: rejected attempt changed balance';
  RAISE NOTICE 'PASS 5: invalid amounts + unknown business rejected, balance intact';

  -- ── 6. Balance == sum of admin_grant deltas (consistency) ──────────────────
  SELECT coalesce(sum(delta),0) INTO v_ledger_count FROM token_ledger WHERE business_id = v_biz;
  ASSERT v_ledger_count = v_bal, '6 FAIL: ledger sum != balance';
  RAISE NOTICE 'PASS 6: ledger sum == balance';

  -- ── 7. List: search + pagination + total_count ─────────────────────────────
  SELECT total_count INTO v_total FROM admin_list_businesses('Admin Test Biz', 25, 0) LIMIT 1;
  ASSERT v_total >= 1, '7a FAIL: search found no rows';
  ASSERT EXISTS (SELECT 1 FROM admin_list_businesses('admintest@example.com', 25, 0) WHERE business_id = v_biz),
    '7b FAIL: email search miss';
  ASSERT EXISTS (SELECT 1 FROM admin_list_businesses(v_biz::text, 25, 0) WHERE business_id = v_biz),
    '7c FAIL: id search miss';
  ASSERT (SELECT balance FROM admin_list_businesses('Admin Test Biz', 25, 0) WHERE business_id = v_biz) = 150,
    '7d FAIL: listed balance != 150';
  ASSERT (SELECT count(*) FROM admin_list_businesses(NULL, 1, 0)) <= 1, '7e FAIL: limit not honored';
  RAISE NOTICE 'PASS 7: list search + pagination + balance';

  -- ── 8. Audit shows the grant ───────────────────────────────────────────────
  ASSERT EXISTS (SELECT 1 FROM admin_recent_grants(50)
                 WHERE business_id = v_biz AND admin_id = v_admin AND request_id = v_req AND amount = 100),
    '8 FAIL: audit missing the grant';
  RAISE NOTICE 'PASS 8: audit shows grant with admin + request id';

  RAISE NOTICE '✅ ALL 085 ADMIN TESTS PASSED';
END $$;
