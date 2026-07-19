-- 083_face_index_billing_model_test.sql
--
-- Re-runnable validation for migration 083 (incl. the code-review hardening).
-- Self-contained: builds a disposable fixture (including storage.objects rows,
-- since record_image_upload now derives size from the server-side object) and
-- ROLLS BACK so nothing is persisted. Run against a DB that has migration 083
-- applied (a preview branch is recommended):
--
--   psql "$DATABASE_URL" -f supabase/tests/083_face_index_billing_model_test.sql
--
-- Blocks: 1 credit lifecycle · 2 one-time gallery entitlement ·
--         3 RPC authorization · 4 atomic refund · 5 order identity ·
--         6 server-authoritative storage + deletion + reconciliation.

BEGIN;

-- ── Fixture ─────────────────────────────────────────────────────────────────
INSERT INTO plans(id,name,token_count,storage_limit_bytes) VALUES ('t_tiny','TestTiny',10,1000)
  ON CONFLICT (id) DO UPDATE SET token_count=10, storage_limit_bytes=1000;
INSERT INTO plans(id,name,token_count,storage_limit_bytes) VALUES ('starter','Starter',100,2147483648)
  ON CONFLICT (id) DO UPDATE SET token_count=100, storage_limit_bytes=2147483648;
INSERT INTO businesses(id,user_id,business_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-9999-9999-9999-000000000001','T083') ON CONFLICT (id) DO NOTHING;
DELETE FROM subscriptions WHERE business_id='aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO subscriptions(business_id,plan_id,status) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','t_tiny','active');
INSERT INTO business_tokens(business_id,balance,lifetime_consumed) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',10,0)
  ON CONFLICT (business_id) DO UPDATE SET balance=10, lifetime_consumed=0;
INSERT INTO galleries(id,business_id,face_index_status) VALUES ('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','indexing') ON CONFLICT (id) DO NOTHING;
INSERT INTO gallery_sections(id,gallery_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002') ON CONFLICT (id) DO NOTHING;
INSERT INTO business_storage(business_id,used_bytes) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',0)
  ON CONFLICT (business_id) DO UPDATE SET used_bytes=0;
-- storage objects (record_image_upload verifies size against storage.objects).
INSERT INTO storage.buckets(id,name) VALUES ('gallery-images','gallery-images') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
 ('gallery-images','oa',jsonb_build_object('size',400)),
 ('gallery-images','ob',jsonb_build_object('size',400)),
 ('gallery-images','oc',jsonb_build_object('size',300)),
 ('gallery-images','gx',jsonb_build_object('size',400)),
 ('gallery-images','gy',jsonb_build_object('size',400)),
 ('gallery-images','gz',jsonb_build_object('size',300)) ON CONFLICT DO NOTHING;

CREATE TEMP TABLE r(id serial, name text, pass boolean, detail text) ON COMMIT DROP;

-- ══════════════ BLOCK 1 — credit lifecycle + storage ══════════════
DO $$
DECLARE v_biz UUID:='aaaaaaaa-0000-0000-0000-000000000001'; v_gal UUID:='aaaaaaaa-0000-0000-0000-000000000002';
  v_sec UUID:='aaaaaaaa-0000-0000-0000-000000000003'; v_usr UUID:='aaaaaaaa-9999-9999-9999-000000000001';
  a UUID; res TEXT; ok BOOLEAN; bal INT; st TEXT; used INT; err TEXT; cnt INT; sk INT; ch INT; rf INT;
BEGIN
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,1,'pending') RETURNING id INTO a;
  res := reserve_face_index_credit(v_gal,a); SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('reserve charges 1', res='reserved' AND bal=9, format('res=%s bal=%s',res,bal));
  ok := finalize_face_index(a,3); SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('finalize keeps charge', ok AND bal=9, format('bal=%s',bal));
  ok := finalize_face_index(a,3); res := reserve_face_index_credit(v_gal,a); SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('no double charge on retry', ok=false AND res='not_claimable' AND bal=9, format('dup=%s reRes=%s bal=%s',ok,res,bal));
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,2,'pending') RETURNING id INTO a;
  PERFORM reserve_face_index_credit(v_gal,a); ok := finalize_face_index(a,0); SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('0 faces still charged', ok AND bal=8, format('bal=%s',bal));
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,3,'pending') RETURNING id INTO a;
  PERFORM reserve_face_index_credit(v_gal,a); ok := fail_face_index(a,'boom',true);
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz; SELECT face_index_status INTO st FROM images WHERE id=a;
  INSERT INTO r(name,pass,detail) VALUES ('failed AWS refunds (business)', ok AND bal=8 AND st='failed', format('bal=%s st=%s',bal,st));
  DELETE FROM token_ledger WHERE business_id=v_biz;
  UPDATE business_tokens SET balance=2 WHERE business_id=v_biz;
  DELETE FROM images WHERE gallery_id=v_gal; UPDATE galleries SET face_index_status='indexing', face_indexed_count=0 WHERE id=v_gal;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,1,'pending'),(v_gal,v_sec,2,'pending'),(v_gal,v_sec,3,'pending'),(v_gal,v_sec,4,'pending'),(v_gal,v_sec,5,'pending');
  PERFORM reserve_face_index_credit(v_gal,img.id) FROM images img WHERE img.gallery_id=v_gal ORDER BY img.sort_order, img.id;
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  SELECT count(*) FILTER (WHERE face_index_status='processing'), count(*) FILTER (WHERE face_index_status='skipped_no_allowance') INTO cnt,sk FROM images WHERE gallery_id=v_gal;
  INSERT INTO r(name,pass,detail) VALUES ('partial never negative (2 proc,3 skip)', bal=0 AND cnt=2 AND sk=3, format('bal=%s proc=%s skip=%s',bal,cnt,sk));
  PERFORM finalize_face_index(img.id,1) FROM images img WHERE img.gallery_id=v_gal AND img.face_index_status='processing';
  SELECT face_index_status INTO st FROM galleries WHERE id=v_gal;
  INSERT INTO r(name,pass,detail) VALUES ('gallery -> partial while skipped remain', st='partial', format('st=%s',st));
  UPDATE business_tokens SET balance=3 WHERE business_id=v_biz;
  PERFORM reserve_face_index_credit(v_gal,img.id) FROM images img WHERE img.gallery_id=v_gal AND img.face_index_status='skipped_no_allowance' ORDER BY img.sort_order, img.id;
  PERFORM finalize_face_index(img.id,1) FROM images img WHERE img.gallery_id=v_gal AND img.face_index_status='processing';
  SELECT face_index_status INTO st FROM galleries WHERE id=v_gal; SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  SELECT count(*) FILTER (WHERE reason='face_index' AND delta=-1), count(*) FILTER (WHERE reason='face_index_refund') INTO ch,rf FROM token_ledger WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('resume -> done, 5 business charges 0 refunds', st='done' AND bal=0 AND ch=5 AND rf=0, format('st=%s bal=%s charges=%s refunds=%s',st,bal,ch,rf));
  -- storage (server-authoritative size from storage.objects)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_usr::text)::text, true);
  UPDATE business_storage SET used_bytes=0 WHERE business_id=v_biz; SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  a := record_image_upload(v_gal,'a.jpg','p','t','oa',400,v_sec,10,false);
  PERFORM record_image_upload(v_gal,'b.jpg','p','t','ob',400,v_sec,11,false);
  INSERT INTO r(name,pass,detail) SELECT 'upload is free (no credit change)', (balance=bal), format('bal=%s',balance) FROM business_tokens WHERE business_id=v_biz;
  BEGIN PERFORM record_image_upload(v_gal,'c.jpg','p','t','oc',300,v_sec,12,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err := SQLERRM; END;
  SELECT used_bytes INTO used FROM business_storage WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('business storage cap atomic (1100>1000)', err='storage_limit_exceeded' AND used=800, format('err=%s used=%s',err,used));
  DELETE FROM images WHERE id=a; SELECT used_bytes INTO used FROM business_storage WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('delete decrements business storage', used=400, format('used=%s',used));
END $$;

-- ══════════════ BLOCK 2 — one-time gallery entitlement ══════════════
DO $$
DECLARE v_biz UUID:='aaaaaaaa-0000-0000-0000-000000000001'; v_galA UUID:='aaaaaaaa-0000-0000-0000-000000000002'; v_galB UUID:='aaaaaaaa-0000-0000-0000-000000000004';
  v_sec UUID:='aaaaaaaa-0000-0000-0000-000000000003'; v_secB UUID:='aaaaaaaa-0000-0000-0000-000000000005'; v_usr UUID:='aaaaaaaa-9999-9999-9999-000000000001'; v_ref UUID:='11111111-2222-3333-4444-555555555555';
  ok BOOLEAN; res TEXT; a UUID; alw INT; gused INT; bal INT; cnt INT; sk INT; st TEXT; err TEXT; paid BOOLEAN; slim BIGINT; exp TIMESTAMPTZ; gstore BIGINT; bizstore BIGINT;
BEGIN
  INSERT INTO galleries(id,business_id,face_index_status) VALUES (v_galB,v_biz,'indexing') ON CONFLICT (id) DO NOTHING;
  INSERT INTO gallery_sections(id,gallery_id) VALUES (v_secB,v_galB) ON CONFLICT (id) DO NOTHING;
  DELETE FROM images WHERE gallery_id IN (v_galA,v_galB); DELETE FROM token_ledger WHERE business_id=v_biz;
  UPDATE galleries SET one_time_paid=false, face_index_allowance=0, gallery_credit_used=0, storage_used_bytes=0, storage_limit_bytes=NULL, paid_expires_at=NULL, one_time_order_ref=NULL, face_index_status='indexing', face_indexed_count=0 WHERE id IN (v_galA,v_galB);
  ok := mark_gallery_paid(v_biz, v_galA, v_ref, 12, NULL);
  SELECT one_time_paid, face_index_allowance, storage_limit_bytes, paid_expires_at INTO paid,alw,slim,exp FROM galleries WHERE id=v_galA;
  INSERT INTO r(name,pass,detail) VALUES ('one-time grants 10000 + 75GB + 12mo', ok AND paid AND alw=10000 AND slim=80530636800 AND exp>now()+interval '11 months' AND exp<now()+interval '13 months', format('paid=%s allow=%s store=%s',paid,alw,slim));
  ok := mark_gallery_paid(v_biz, v_galA, v_ref, 12, NULL); SELECT face_index_allowance INTO alw FROM galleries WHERE id=v_galA;
  INSERT INTO r(name,pass,detail) VALUES ('webhook retry same ref -> no double grant', ok=false AND alw=10000, format('ret=%s allow=%s',ok,alw));
  UPDATE business_tokens SET balance=0 WHERE business_id=v_biz;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galA,v_sec,1,'pending') RETURNING id INTO a;
  res := reserve_face_index_credit(v_galA,a); SELECT gallery_credit_used INTO gused FROM galleries WHERE id=v_galA; SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz; ok := finalize_face_index(a,2);
  INSERT INTO r(name,pass,detail) VALUES ('indexes at business balance 0 (gallery pool)', res='reserved' AND gused=1 AND bal=0 AND ok, format('res=%s gused=%s bal=%s',res,gused,bal));
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galB,v_secB,1,'pending') RETURNING id INTO a;
  res := reserve_face_index_credit(v_galB,a); SELECT face_index_status INTO st FROM images WHERE id=a;
  INSERT INTO r(name,pass,detail) VALUES ('entitlement gallery-specific (galB blocked)', res='no_allowance' AND st='skipped_no_allowance', format('res=%s st=%s',res,st));
  UPDATE business_tokens SET balance=5 WHERE business_id=v_biz; UPDATE galleries SET face_index_allowance=2, gallery_credit_used=0 WHERE id=v_galA; DELETE FROM images WHERE gallery_id=v_galA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galA,v_sec,1,'pending'),(v_galA,v_sec,2,'pending'),(v_galA,v_sec,3,'pending');
  PERFORM reserve_face_index_credit(v_galA, img.id) FROM images img WHERE img.gallery_id=v_galA ORDER BY img.sort_order, img.id;
  SELECT gallery_credit_used INTO gused FROM galleries WHERE id=v_galA; SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('subscriber: gallery consumed before business', gused=2 AND bal=4, format('gused=%s bal=%s',gused,bal));
  UPDATE business_tokens SET balance=0 WHERE business_id=v_biz; UPDATE galleries SET face_index_allowance=2, gallery_credit_used=0 WHERE id=v_galA; DELETE FROM images WHERE gallery_id=v_galA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galA,v_sec,1,'pending'),(v_galA,v_sec,2,'pending'),(v_galA,v_sec,3,'pending'),(v_galA,v_sec,4,'pending'),(v_galA,v_sec,5,'pending');
  PERFORM reserve_face_index_credit(v_galA, img.id) FROM images img WHERE img.gallery_id=v_galA ORDER BY img.sort_order, img.id;
  SELECT count(*) FILTER (WHERE face_index_status='processing'), count(*) FILTER (WHERE face_index_status='skipped_no_allowance') INTO cnt,sk FROM images WHERE gallery_id=v_galA; SELECT gallery_credit_used INTO gused FROM galleries WHERE id=v_galA;
  INSERT INTO r(name,pass,detail) VALUES ('gallery cap: 2 processed + 3 skipped', cnt=2 AND sk=3 AND gused=2, format('proc=%s skip=%s gused=%s',cnt,sk,gused));
  UPDATE galleries SET one_time_paid=true, face_index_allowance=10, gallery_credit_used=0, paid_expires_at=now()-interval '1 day' WHERE id=v_galA; UPDATE business_tokens SET balance=0 WHERE business_id=v_biz; DELETE FROM images WHERE gallery_id=v_galA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galA,v_sec,1,'pending') RETURNING id INTO a; res := reserve_face_index_credit(v_galA,a);
  INSERT INTO r(name,pass,detail) VALUES ('expired entitlement inactive', res='no_allowance', format('res=%s',res));
  UPDATE galleries SET one_time_paid=true, face_index_allowance=10, gallery_credit_used=0, paid_expires_at=now()+interval '300 days', one_time_order_ref=v_ref WHERE id=v_galA;
  ok := revoke_gallery_paid(v_biz, v_galA, v_ref, NULL); SELECT one_time_paid, face_index_allowance INTO paid, alw FROM galleries WHERE id=v_galA; UPDATE business_tokens SET balance=0 WHERE business_id=v_biz; DELETE FROM images WHERE gallery_id=v_galA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galA,v_sec,1,'pending') RETURNING id INTO a; res := reserve_face_index_credit(v_galA,a);
  INSERT INTO r(name,pass,detail) VALUES ('refund revokes entitlement', ok AND paid=false AND alw=0 AND res='no_allowance', format('ok=%s paid=%s allow=%s res=%s',ok,paid,alw,res));
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_usr::text)::text, true);
  UPDATE galleries SET one_time_paid=true, face_index_allowance=10000, storage_limit_bytes=1000, storage_used_bytes=0, paid_expires_at=now()+interval '300 days' WHERE id=v_galA; UPDATE business_storage SET used_bytes=0 WHERE business_id=v_biz; DELETE FROM images WHERE gallery_id=v_galA;
  a := record_image_upload(v_galA,'x.jpg','p','t','gx',400,v_sec,1,false); PERFORM record_image_upload(v_galA,'y.jpg','p','t','gy',400,v_sec,2,false);
  SELECT storage_used_bytes INTO gstore FROM galleries WHERE id=v_galA; SELECT used_bytes INTO bizstore FROM business_storage WHERE business_id=v_biz;
  BEGIN PERFORM record_image_upload(v_galA,'z.jpg','p','t','gz',300,v_sec,3,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err:=SQLERRM; END;
  INSERT INTO r(name,pass,detail) VALUES ('gallery 75GB pool atomic + independent of business', gstore=800 AND bizstore=0 AND err='storage_limit_exceeded', format('gallery=%s business=%s err=%s',gstore,bizstore,err));
END $$;

-- ══════════════ BLOCK 3 — RPC authorization (item 5) ══════════════
DO $$
DECLARE v_owner UUID:='aaaaaaaa-9999-9999-9999-000000000001'; v_gal UUID:='aaaaaaaa-0000-0000-0000-000000000002';
BEGIN
  INSERT INTO r(name,pass,detail) VALUES ('priv reserve: anon/auth NO, service YES',
    has_function_privilege('anon','public.reserve_face_index_credit(uuid,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.reserve_face_index_credit(uuid,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.reserve_face_index_credit(uuid,uuid)','EXECUTE')=true, '');
  INSERT INTO r(name,pass,detail) VALUES ('priv mark/revoke/fail/finalize/restore: service only',
    has_function_privilege('anon','public.mark_gallery_paid(uuid,uuid,uuid,integer,jsonb)','EXECUTE')=false AND has_function_privilege('authenticated','public.revoke_gallery_paid(uuid,uuid,uuid,jsonb)','EXECUTE')=false AND has_function_privilege('anon','public.fail_face_index(uuid,text,boolean)','EXECUTE')=false AND has_function_privilege('authenticated','public.finalize_face_index(uuid,integer)','EXECUTE')=false AND has_function_privilege('authenticated','public.restore_upload_consumed_credits()','EXECUTE')=false, '');
  INSERT INTO r(name,pass,detail) VALUES ('priv record_image_upload: anon NO, auth YES',
    has_function_privilege('anon','public.record_image_upload(uuid,text,text,text,text,bigint,uuid,integer,boolean)','EXECUTE')=false AND has_function_privilege('authenticated','public.record_image_upload(uuid,text,text,text,text,bigint,uuid,integer,boolean)','EXECUTE')=true, '');
  INSERT INTO r(name,pass,detail) VALUES ('priv summary: anon NO, auth+service YES',
    has_function_privilege('anon','public.get_gallery_index_summary(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.get_gallery_index_summary(uuid)','EXECUTE')=true AND has_function_privilege('service_role','public.get_gallery_index_summary(uuid)','EXECUTE')=true, '');
  PERFORM set_config('request.jwt.claims', json_build_object('sub','ffffffff-9999-9999-9999-000000000009')::text, true);
  INSERT INTO r(name,pass,detail) VALUES ('summary non-owner -> NULL (no cross-business leak)', get_gallery_index_summary(v_gal) IS NULL, '');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_owner::text)::text, true);
  INSERT INTO r(name,pass,detail) VALUES ('summary owner -> data', get_gallery_index_summary(v_gal) IS NOT NULL, '');
  PERFORM set_config('request.jwt.claims', '{}', true);
  INSERT INTO r(name,pass,detail) VALUES ('summary service_role (no uid) -> data', get_gallery_index_summary(v_gal) IS NOT NULL, '');
END $$;
DO $t$ BEGIN
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.reserve_face_index_credit('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002');
    RESET ROLE; INSERT INTO r(name,pass,detail) VALUES ('anon cannot EXECUTE reserve RPC', false, 'NO ERROR (leak!)');
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; INSERT INTO r(name,pass,detail) VALUES ('anon cannot EXECUTE reserve RPC', true, 'permission denied');
  WHEN others THEN RESET ROLE; INSERT INTO r(name,pass,detail) VALUES ('anon cannot EXECUTE reserve RPC', SQLSTATE='42501', 'sqlstate '||SQLSTATE); END;
END $t$;

-- ══════════════ BLOCK 4 — atomic refund (items 6-8) ══════════════
DO $$
DECLARE v_biz UUID:='aaaaaaaa-0000-0000-0000-000000000001'; v_gal UUID:='aaaaaaaa-0000-0000-0000-000000000002'; v_sec UUID:='aaaaaaaa-0000-0000-0000-000000000003';
  a UUID; b UUID; ok BOOLEAN; ok2 BOOLEAN; bal INT; refunds INT;
BEGIN
  UPDATE galleries SET one_time_paid=false, face_index_allowance=0 WHERE id=v_gal;
  UPDATE business_tokens SET balance=5 WHERE business_id=v_biz; DELETE FROM token_ledger WHERE business_id=v_biz; DELETE FROM images WHERE gallery_id=v_gal;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,1,'pending') RETURNING id INTO a;
  PERFORM reserve_face_index_credit(v_gal,a);
  ok := fail_face_index(a,'boom',true); ok2 := fail_face_index(a,'again',true);   -- two fails: exactly one transitions+refunds
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  SELECT count(*) INTO refunds FROM token_ledger WHERE business_id=v_biz AND reason='face_index_refund' AND (metadata->>'source')='business';
  INSERT INTO r(name,pass,detail) VALUES ('two concurrent-style fails: one transition, exactly one refund', ok AND ok2=false AND bal=5 AND refunds=1, format('ok=%s ok2=%s bal=%s refunds=%s',ok,ok2,bal,refunds));
  UPDATE business_tokens SET balance=5 WHERE business_id=v_biz; DELETE FROM token_ledger WHERE business_id=v_biz;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,2,'pending') RETURNING id INTO b;
  PERFORM reserve_face_index_credit(v_gal,b); ok := finalize_face_index(b,3); ok2 := fail_face_index(b,'late',true);   -- finalize vs fail
  SELECT count(*) INTO refunds FROM token_ledger WHERE business_id=v_biz AND reason='face_index_refund';
  INSERT INTO r(name,pass,detail) VALUES ('finalize wins race, later fail no-ops (0 refunds)', ok AND ok2=false AND refunds=0, format('fin=%s fail=%s refunds=%s',ok,ok2,refunds));
  DELETE FROM token_ledger WHERE business_id=v_biz; UPDATE business_tokens SET balance=5 WHERE business_id=v_biz;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status,face_index_credit_source) VALUES (v_gal,v_sec,3,'processing',NULL) RETURNING id INTO b;
  ok := fail_face_index(b,'nullsrc',true);   -- NULL source: no mint
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  SELECT count(*) FILTER (WHERE delta<>0) INTO refunds FROM token_ledger WHERE business_id=v_biz AND reason='face_index_refund';
  INSERT INTO r(name,pass,detail) VALUES ('NULL source: transition ok, no balance minted', ok AND bal=5 AND refunds=0, format('ok=%s bal=%s nonzero_refunds=%s',ok,bal,refunds));
END $$;

-- ══════════════ BLOCK 5 — refund / order identity (items 14-17) ══════════════
DO $$
DECLARE v_biz UUID:='aaaaaaaa-0000-0000-0000-000000000001'; v_gal UUID:='aaaaaaaa-0000-0000-0000-000000000002';
  ok BOOLEAN; ok2 BOOLEAN; alw INT; paid BOOLEAN; o1 UUID:='11111111-0000-0000-0000-0000000000a1'; o2 UUID:='22222222-0000-0000-0000-0000000000a2';
BEGIN
  UPDATE galleries SET one_time_paid=false, face_index_allowance=0, gallery_credit_used=0, paid_expires_at=NULL, one_time_order_ref=NULL WHERE id=v_gal;
  ok := mark_gallery_paid(v_biz,v_gal,o1,12,NULL); ok2 := mark_gallery_paid(v_biz,v_gal,o1,12,NULL); SELECT face_index_allowance INTO alw FROM galleries WHERE id=v_gal;
  INSERT INTO r(name,pass,detail) VALUES ('order retry same ref: no double grant (10000)', ok AND ok2=false AND alw=10000, format('a=%s',alw));
  ok := mark_gallery_paid(v_biz,v_gal,o2,12,NULL); SELECT face_index_allowance INTO alw FROM galleries WHERE id=v_gal;
  INSERT INTO r(name,pass,detail) VALUES ('second distinct order grants +10000 (=20000)', ok AND alw=20000, format('a=%s',alw));
  ok := revoke_gallery_paid(v_biz,v_gal,o1,NULL); SELECT one_time_paid INTO paid FROM galleries WHERE id=v_gal;
  INSERT INTO r(name,pass,detail) VALUES ('late refund of superseded order does NOT revoke', ok=false AND paid=true, format('revoked=%s paid=%s',ok,paid));
  ok := revoke_gallery_paid(v_biz,v_gal,o2,NULL); SELECT one_time_paid,face_index_allowance INTO paid,alw FROM galleries WHERE id=v_gal;
  INSERT INTO r(name,pass,detail) VALUES ('refund of active order revokes (allow 0)', ok AND paid=false AND alw=0, format('revoked=%s paid=%s a=%s',ok,paid,alw));
  ok := revoke_gallery_paid(v_biz,v_gal,o2,NULL);
  INSERT INTO r(name,pass,detail) VALUES ('duplicate refund is a no-op', ok=false, format('r=%s',ok));
END $$;

-- ══════════════ BLOCK 6 — server-authoritative storage + deletion + reconciliation (items 18,19,22) ══════════════
DO $$
DECLARE v_biz UUID:='aaaaaaaa-0000-0000-0000-000000000001'; v_gal UUID:='aaaaaaaa-0000-0000-0000-000000000002'; v_sec UUID:='aaaaaaaa-0000-0000-0000-000000000003'; v_usr UUID:='aaaaaaaa-9999-9999-9999-000000000001';
  a UUID; err TEXT; sz BIGINT; used BIGINT; after BIGINT; recon_biz BIGINT; recon_img BIGINT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_usr::text)::text, true);
  UPDATE galleries SET one_time_paid=false, paid_expires_at=NULL, storage_limit_bytes=NULL WHERE id=v_gal;
  UPDATE business_storage SET used_bytes=0 WHERE business_id=v_biz; DELETE FROM images WHERE gallery_id=v_gal;
  BEGIN PERFORM record_image_upload(v_gal,'m.jpg','p','t','oa',999999,v_sec,1,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err:=SQLERRM; END;
  INSERT INTO r(name,pass,detail) VALUES ('size_mismatch rejected (client 999999 vs server 400)', err='size_mismatch', format('err=%s',err));
  BEGIN PERFORM record_image_upload(v_gal,'n.jpg','p','t','no-such-object',400,v_sec,2,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err:=SQLERRM; END;
  INSERT INTO r(name,pass,detail) VALUES ('missing storage object rejected', err='original_object_missing', format('err=%s',err));
  a := record_image_upload(v_gal,'m.jpg','p','t','oa',400,v_sec,1,false); SELECT original_size_bytes INTO sz FROM images WHERE id=a;
  INSERT INTO r(name,pass,detail) VALUES ('server size authoritative (stored=400)', sz=400, format('sz=%s',sz));
  SELECT used_bytes INTO used FROM business_storage WHERE business_id=v_biz;
  DELETE FROM galleries WHERE id=v_gal;   -- cascade: BEFORE-DELETE trigger decrements business pool
  SELECT used_bytes INTO after FROM business_storage WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('gallery delete cascades storage decrement', used=400 AND after=0, format('before=%s after=%s',used,after));
  -- reconciliation: business_storage vs SUM(non-gallery image sizes)
  SELECT COALESCE(SUM(bs.used_bytes),0) INTO recon_biz FROM business_storage bs;
  SELECT COALESCE(SUM(COALESCE(i.original_size_bytes,0)),0) INTO recon_img FROM images i WHERE NOT COALESCE(i.counted_gallery_storage,false);
  INSERT INTO r(name,pass,detail) VALUES ('reconciliation: business_storage == SUM(non-gallery image sizes)', recon_biz=recon_img, format('counter=%s images=%s',recon_biz,recon_img));
END $$;

SELECT name, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM r ORDER BY id;

ROLLBACK;
