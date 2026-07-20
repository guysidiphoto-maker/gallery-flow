-- 083_face_index_billing_model_test.sql
--
-- Re-runnable validation for migration 083 (incl. both code-review rounds).
-- Self-contained: builds a disposable fixture (business slug + storage.objects
-- under <slug>/<gallery>/originals/, since record_image_upload now validates the
-- path + derives the authoritative size) and ROLLS BACK. Run against a DB with
-- migration 083 applied:
--   psql "$DATABASE_URL" -f supabase/tests/083_face_index_billing_model_test.sql
--
-- Blocks: 1 credit lifecycle · 2 gallery entitlement (order-ledger) ·
--         3 RPC authorization · 4 atomic refund · 5 multi-order accounting ·
--         6 server-authoritative size + path binding + deletion + reconciliation.

BEGIN;

-- ── Fixture ─────────────────────────────────────────────────────────────────
INSERT INTO plans(id,name,token_count,storage_limit_bytes) VALUES ('starter','Starter',100,2147483648)
  ON CONFLICT (id) DO UPDATE SET token_count=100, storage_limit_bytes=2147483648;
INSERT INTO plans(id,name,token_count,storage_limit_bytes) VALUES ('t_tiny','TestTiny',10,1000)
  ON CONFLICT (id) DO UPDATE SET token_count=10, storage_limit_bytes=1000;
INSERT INTO businesses(id,user_id,business_name,slug) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-9999-9999-9999-000000000001','T083','t083')
  ON CONFLICT (id) DO UPDATE SET slug='t083';
DELETE FROM subscriptions WHERE business_id='aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO subscriptions(business_id,plan_id,status) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','t_tiny','active');
INSERT INTO business_tokens(business_id,balance,lifetime_consumed) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',10,0)
  ON CONFLICT (business_id) DO UPDATE SET balance=10, lifetime_consumed=0;
INSERT INTO galleries(id,business_id,face_index_status) VALUES ('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','indexing') ON CONFLICT (id) DO NOTHING;
INSERT INTO galleries(id,business_id,face_index_status) VALUES ('aaaaaaaa-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','indexing') ON CONFLICT (id) DO NOTHING;
INSERT INTO gallery_sections(id,gallery_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002') ON CONFLICT (id) DO NOTHING;
INSERT INTO gallery_sections(id,gallery_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000004') ON CONFLICT (id) DO NOTHING;
INSERT INTO business_storage(business_id,used_bytes) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',0)
  ON CONFLICT (business_id) DO UPDATE SET used_bytes=0;
INSERT INTO storage.buckets(id,name) VALUES ('gallery-images','gallery-images') ON CONFLICT (id) DO NOTHING;
-- Valid paths: <slug>/<galleryId>/originals/<name>. gA=gallery ...0002, gB=...0004.
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
 ('gallery-images','t083/aaaaaaaa-0000-0000-0000-000000000002/originals/oa','{"size":400}'),
 ('gallery-images','t083/aaaaaaaa-0000-0000-0000-000000000002/originals/ob','{"size":400}'),
 ('gallery-images','t083/aaaaaaaa-0000-0000-0000-000000000002/originals/oc','{"size":300}'),
 ('gallery-images','t083/aaaaaaaa-0000-0000-0000-000000000002/originals/onosize','{"etag":"x"}'),
 ('gallery-images','t083/aaaaaaaa-0000-0000-0000-000000000002/originals/gx','{"size":400}'),
 ('gallery-images','t083/aaaaaaaa-0000-0000-0000-000000000002/originals/gy','{"size":400}'),
 ('gallery-images','t083/aaaaaaaa-0000-0000-0000-000000000002/originals/gz','{"size":300}'),
 ('gallery-images','wrongslug/aaaaaaaa-0000-0000-0000-000000000002/originals/ow','{"size":400}') ON CONFLICT DO NOTHING;

CREATE TEMP TABLE r(id serial, name text, pass boolean, detail text) ON COMMIT DROP;

-- helper: valid path prefix for gallery A
-- 't083/aaaaaaaa-0000-0000-0000-000000000002/originals/'

-- ══════════════ BLOCK 1 — credit lifecycle + storage ══════════════
DO $$
DECLARE v_biz UUID:='aaaaaaaa-0000-0000-0000-000000000001'; v_gal UUID:='aaaaaaaa-0000-0000-0000-000000000002';
  v_sec UUID:='aaaaaaaa-0000-0000-0000-000000000003'; v_usr UUID:='aaaaaaaa-9999-9999-9999-000000000001';
  pfx TEXT:='t083/aaaaaaaa-0000-0000-0000-000000000002/originals/'; a UUID; res TEXT; ok BOOLEAN; bal INT; st TEXT; used INT; err TEXT; cnt INT; sk INT; ch INT; rf INT;
BEGIN
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,1,'pending') RETURNING id INTO a;
  res := reserve_face_index_credit(v_gal,a); SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('reserve charges 1', res='reserved' AND bal=9, format('res=%s bal=%s',res,bal));
  ok := finalize_face_index(a,3); ok := finalize_face_index(a,3); res := reserve_face_index_credit(v_gal,a); SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('finalize idempotent + no recharge', ok=false AND res='not_claimable' AND bal=9, format('bal=%s',bal));
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,2,'pending') RETURNING id INTO a;
  PERFORM reserve_face_index_credit(v_gal,a); ok := finalize_face_index(a,0); SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('0 faces still charged', ok AND bal=8, format('bal=%s',bal));
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,3,'pending') RETURNING id INTO a;
  PERFORM reserve_face_index_credit(v_gal,a); ok := fail_face_index(a,'boom',true);
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz; SELECT face_index_status INTO st FROM images WHERE id=a;
  INSERT INTO r(name,pass,detail) VALUES ('failed AWS refunds (business)', ok AND bal=8 AND st='failed', format('bal=%s st=%s',bal,st));
  DELETE FROM token_ledger WHERE business_id=v_biz; UPDATE business_tokens SET balance=2 WHERE business_id=v_biz;
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
  -- storage (server-authoritative size; valid paths)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_usr::text)::text, true);
  UPDATE business_storage SET used_bytes=0 WHERE business_id=v_biz; SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  a := record_image_upload(v_gal,'a.jpg','p','t',pfx||'oa',400,v_sec,10,false);
  PERFORM record_image_upload(v_gal,'b.jpg','p','t',pfx||'ob',400,v_sec,11,false);
  INSERT INTO r(name,pass,detail) SELECT 'upload is free (no credit change)', (balance=bal), format('bal=%s',balance) FROM business_tokens WHERE business_id=v_biz;
  BEGIN PERFORM record_image_upload(v_gal,'c.jpg','p','t',pfx||'oc',300,v_sec,12,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err := SQLERRM; END;
  SELECT used_bytes INTO used FROM business_storage WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('business storage cap atomic (1100>1000)', err='storage_limit_exceeded' AND used=800, format('err=%s used=%s',err,used));
  DELETE FROM images WHERE id=a; SELECT used_bytes INTO used FROM business_storage WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('delete decrements business storage', used=400, format('used=%s',used));
END $$;

-- ══════════════ BLOCK 2 — gallery entitlement (order-ledger backed) ══════════════
DO $$
DECLARE v_biz UUID:='aaaaaaaa-0000-0000-0000-000000000001'; gA UUID:='aaaaaaaa-0000-0000-0000-000000000002'; gB UUID:='aaaaaaaa-0000-0000-0000-000000000004';
  v_sec UUID:='aaaaaaaa-0000-0000-0000-000000000003'; v_secB UUID:='aaaaaaaa-0000-0000-0000-000000000005'; v_usr UUID:='aaaaaaaa-9999-9999-9999-000000000001';
  ref UUID:='11111111-2222-3333-4444-555555555555'; pfx TEXT:='t083/aaaaaaaa-0000-0000-0000-000000000002/originals/';
  ok BOOLEAN; res TEXT; a UUID; alw INT; gused INT; bal INT; cnt INT; sk INT; st TEXT; err TEXT; slim BIGINT; gstore BIGINT; bizstore BIGINT;
BEGIN
  DELETE FROM images WHERE gallery_id IN (gA,gB); DELETE FROM gallery_entitlements WHERE gallery_id IN (gA,gB); DELETE FROM token_ledger WHERE business_id=v_biz;
  UPDATE galleries SET one_time_paid=false, face_index_allowance=0, gallery_credit_used=0, storage_used_bytes=0, storage_limit_bytes=NULL, paid_expires_at=NULL, one_time_order_ref=NULL, face_index_status='indexing', face_indexed_count=0 WHERE id IN (gA,gB);
  ok := mark_gallery_paid(v_biz, gA, ref, 12, NULL);
  SELECT one_time_paid, storage_limit_bytes, paid_expires_at INTO ok, slim, err FROM galleries WHERE id=gA;  -- reuse ok/err loosely
  INSERT INTO r(name,pass,detail) VALUES ('grant: cache one_time_paid + 75GB + 10000 active',
    (SELECT one_time_paid FROM galleries WHERE id=gA) AND (SELECT storage_limit_bytes FROM galleries WHERE id=gA)=80530636800 AND gallery_active_allowance(gA)=10000,
    format('active=%s',gallery_active_allowance(gA)));
  ok := mark_gallery_paid(v_biz, gA, ref, 12, NULL);
  INSERT INTO r(name,pass,detail) VALUES ('webhook retry same order -> no double grant', ok=false AND gallery_active_allowance(gA)=10000, format('active=%s',gallery_active_allowance(gA)));
  -- index at business balance 0 (gallery pool)
  UPDATE business_tokens SET balance=0 WHERE business_id=v_biz;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (gA,v_sec,1,'pending') RETURNING id INTO a;
  res := reserve_face_index_credit(gA,a); SELECT gallery_credit_used INTO gused FROM galleries WHERE id=gA; SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz; ok := finalize_face_index(a,2);
  INSERT INTO r(name,pass,detail) VALUES ('indexes at business balance 0 (gallery pool)', res='reserved' AND gused=1 AND bal=0 AND ok, format('res=%s gused=%s bal=%s',res,gused,bal));
  -- entitlement gallery-specific: gB has none, balance 0 -> skipped
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (gB,v_secB,1,'pending') RETURNING id INTO a;
  res := reserve_face_index_credit(gB,a); SELECT face_index_status INTO st FROM images WHERE id=a;
  INSERT INTO r(name,pass,detail) VALUES ('entitlement gallery-specific (gB blocked)', res='no_allowance' AND st='skipped_no_allowance', format('res=%s st=%s',res,st));
  -- subscriber: gallery consumed before business (shrink entitlement to 2)
  UPDATE business_tokens SET balance=5 WHERE business_id=v_biz;
  UPDATE gallery_entitlements SET granted_allowance=2 WHERE gallery_id=gA; UPDATE galleries SET gallery_credit_used=0 WHERE id=gA; DELETE FROM images WHERE gallery_id=gA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (gA,v_sec,1,'pending'),(gA,v_sec,2,'pending'),(gA,v_sec,3,'pending');
  PERFORM reserve_face_index_credit(gA, img.id) FROM images img WHERE img.gallery_id=gA ORDER BY img.sort_order, img.id;
  SELECT gallery_credit_used INTO gused FROM galleries WHERE id=gA; SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('subscriber: gallery consumed before business', gused=2 AND bal=4, format('gused=%s bal=%s',gused,bal));
  -- cap partial: allowance 2, business 0, 5 imgs -> 2 + 3 skipped
  UPDATE business_tokens SET balance=0 WHERE business_id=v_biz; UPDATE galleries SET gallery_credit_used=0 WHERE id=gA; DELETE FROM images WHERE gallery_id=gA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (gA,v_sec,1,'pending'),(gA,v_sec,2,'pending'),(gA,v_sec,3,'pending'),(gA,v_sec,4,'pending'),(gA,v_sec,5,'pending');
  PERFORM reserve_face_index_credit(gA, img.id) FROM images img WHERE img.gallery_id=gA ORDER BY img.sort_order, img.id;
  SELECT count(*) FILTER (WHERE face_index_status='processing'), count(*) FILTER (WHERE face_index_status='skipped_no_allowance') INTO cnt,sk FROM images WHERE gallery_id=gA; SELECT gallery_credit_used INTO gused FROM galleries WHERE id=gA;
  INSERT INTO r(name,pass,detail) VALUES ('gallery cap: 2 processed + 3 skipped', cnt=2 AND sk=3 AND gused=2, format('proc=%s skip=%s gused=%s',cnt,sk,gused));
  -- expired entitlement inactive (expire the order)
  UPDATE gallery_entitlements SET granted_allowance=10, expires_at=now()-interval '1 day' WHERE gallery_id=gA; UPDATE galleries SET gallery_credit_used=0 WHERE id=gA; UPDATE business_tokens SET balance=0 WHERE business_id=v_biz; DELETE FROM images WHERE gallery_id=gA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (gA,v_sec,1,'pending') RETURNING id INTO a; res := reserve_face_index_credit(gA,a);
  INSERT INTO r(name,pass,detail) VALUES ('expired entitlement inactive', res='no_allowance' AND gallery_active_allowance(gA)=0, format('res=%s active=%s',res,gallery_active_allowance(gA)));
  -- refund revokes (un-expire first, then revoke)
  UPDATE gallery_entitlements SET expires_at=now()+interval '300 days', status='active' WHERE gallery_id=gA; UPDATE galleries SET gallery_credit_used=0 WHERE id=gA;
  ok := revoke_gallery_paid(v_biz, gA, ref, NULL); UPDATE business_tokens SET balance=0 WHERE business_id=v_biz; DELETE FROM images WHERE gallery_id=gA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (gA,v_sec,1,'pending') RETURNING id INTO a; res := reserve_face_index_credit(gA,a);
  INSERT INTO r(name,pass,detail) VALUES ('refund revokes entitlement', ok AND gallery_active_allowance(gA)=0 AND (SELECT one_time_paid FROM galleries WHERE id=gA)=false AND res='no_allowance', format('active=%s res=%s',gallery_active_allowance(gA),res));
  -- gallery 75GB pool atomic + independent of business (fresh order w/ small storage)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_usr::text)::text, true);
  DELETE FROM gallery_entitlements WHERE gallery_id=gA; DELETE FROM images WHERE gallery_id=gA;
  PERFORM mark_gallery_paid(v_biz, gA, '99999999-0000-0000-0000-000000000099', 12, NULL);
  UPDATE gallery_entitlements SET granted_storage_bytes=1000 WHERE gallery_id=gA; PERFORM recompute_gallery_entitlement_cache(gA);
  UPDATE galleries SET storage_used_bytes=0 WHERE id=gA; UPDATE business_storage SET used_bytes=0 WHERE business_id=v_biz;
  a := record_image_upload(gA,'x.jpg','p','t',pfx||'gx',400,v_sec,1,false); PERFORM record_image_upload(gA,'y.jpg','p','t',pfx||'gy',400,v_sec,2,false);
  SELECT storage_used_bytes INTO gstore FROM galleries WHERE id=gA; SELECT used_bytes INTO bizstore FROM business_storage WHERE business_id=v_biz;
  BEGIN PERFORM record_image_upload(gA,'z.jpg','p','t',pfx||'gz',300,v_sec,3,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err:=SQLERRM; END;
  INSERT INTO r(name,pass,detail) VALUES ('gallery pool atomic + independent of business', gstore=800 AND bizstore=0 AND err='storage_limit_exceeded', format('gallery=%s business=%s err=%s',gstore,bizstore,err));
END $$;

-- ══════════════ BLOCK 3 — RPC authorization (item 5, round 1) ══════════════
DO $$
DECLARE v_owner UUID:='aaaaaaaa-9999-9999-9999-000000000001'; v_gal UUID:='aaaaaaaa-0000-0000-0000-000000000002';
BEGIN
  INSERT INTO r(name,pass,detail) VALUES ('priv reserve/mark/fail: service only',
    has_function_privilege('anon','public.reserve_face_index_credit(uuid,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.reserve_face_index_credit(uuid,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.reserve_face_index_credit(uuid,uuid)','EXECUTE')=true
    AND has_function_privilege('anon','public.mark_gallery_paid(uuid,uuid,uuid,integer,jsonb)','EXECUTE')=false, '');
  INSERT INTO r(name,pass,detail) VALUES ('priv helpers gallery_active_* service only',
    has_function_privilege('authenticated','public.gallery_active_allowance(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.gallery_active_allowance(uuid)','EXECUTE')=true, '');
  INSERT INTO r(name,pass,detail) VALUES ('priv record/summary: authenticated allowed, anon no',
    has_function_privilege('anon','public.record_image_upload(uuid,text,text,text,text,bigint,uuid,integer,boolean)','EXECUTE')=false AND has_function_privilege('authenticated','public.record_image_upload(uuid,text,text,text,text,bigint,uuid,integer,boolean)','EXECUTE')=true
    AND has_function_privilege('anon','public.get_gallery_index_summary(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.get_gallery_index_summary(uuid)','EXECUTE')=true, '');
  PERFORM set_config('request.jwt.claims', json_build_object('sub','ffffffff-9999-9999-9999-000000000009')::text, true);
  INSERT INTO r(name,pass,detail) VALUES ('summary non-owner -> NULL (no cross-business leak)', get_gallery_index_summary(v_gal) IS NULL, '');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_owner::text)::text, true);
  INSERT INTO r(name,pass,detail) VALUES ('summary owner -> data', get_gallery_index_summary(v_gal) IS NOT NULL, '');
END $$;
DO $t$ BEGIN
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.reserve_face_index_credit('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002');
    RESET ROLE; INSERT INTO r(name,pass,detail) VALUES ('anon cannot EXECUTE reserve RPC', false, 'NO ERROR (leak!)');
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; INSERT INTO r(name,pass,detail) VALUES ('anon cannot EXECUTE reserve RPC', true, 'permission denied');
  WHEN others THEN RESET ROLE; INSERT INTO r(name,pass,detail) VALUES ('anon cannot EXECUTE reserve RPC', SQLSTATE='42501', 'sqlstate '||SQLSTATE); END;
END $t$;
DO $t$ BEGIN
  SET LOCAL ROLE anon;
  BEGIN PERFORM 1 FROM gallery_entitlements LIMIT 1;
    RESET ROLE; INSERT INTO r(name,pass,detail) VALUES ('anon cannot read gallery_entitlements', false, 'NO ERROR (leak!)');
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; INSERT INTO r(name,pass,detail) VALUES ('anon cannot read gallery_entitlements', true, 'permission denied');
  WHEN others THEN RESET ROLE; INSERT INTO r(name,pass,detail) VALUES ('anon cannot read gallery_entitlements', SQLSTATE IN ('42501'), 'sqlstate '||SQLSTATE); END;
END $t$;

-- ══════════════ BLOCK 4 — atomic refund (items 6-8, round 1) ══════════════
DO $$
DECLARE v_biz UUID:='aaaaaaaa-0000-0000-0000-000000000001'; v_gal UUID:='aaaaaaaa-0000-0000-0000-000000000002'; v_sec UUID:='aaaaaaaa-0000-0000-0000-000000000003';
  a UUID; b UUID; ok BOOLEAN; ok2 BOOLEAN; bal INT; refunds INT;
BEGIN
  DELETE FROM gallery_entitlements WHERE gallery_id=v_gal; PERFORM recompute_gallery_entitlement_cache(v_gal);
  UPDATE business_tokens SET balance=5 WHERE business_id=v_biz; DELETE FROM token_ledger WHERE business_id=v_biz; DELETE FROM images WHERE gallery_id=v_gal;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,1,'pending') RETURNING id INTO a;
  PERFORM reserve_face_index_credit(v_gal,a);
  ok := fail_face_index(a,'boom',true); ok2 := fail_face_index(a,'again',true);
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  SELECT count(*) INTO refunds FROM token_ledger WHERE business_id=v_biz AND reason='face_index_refund' AND (metadata->>'source')='business';
  INSERT INTO r(name,pass,detail) VALUES ('two fails: one transition, exactly one refund', ok AND ok2=false AND bal=5 AND refunds=1, format('ok=%s ok2=%s bal=%s refunds=%s',ok,ok2,bal,refunds));
  UPDATE business_tokens SET balance=5 WHERE business_id=v_biz; DELETE FROM token_ledger WHERE business_id=v_biz;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,2,'pending') RETURNING id INTO b;
  PERFORM reserve_face_index_credit(v_gal,b); ok := finalize_face_index(b,3); ok2 := fail_face_index(b,'late',true);
  SELECT count(*) INTO refunds FROM token_ledger WHERE business_id=v_biz AND reason='face_index_refund';
  INSERT INTO r(name,pass,detail) VALUES ('finalize wins race, later fail no-ops (0 refunds)', ok AND ok2=false AND refunds=0, format('fin=%s fail=%s refunds=%s',ok,ok2,refunds));
  DELETE FROM token_ledger WHERE business_id=v_biz; UPDATE business_tokens SET balance=5 WHERE business_id=v_biz;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status,face_index_credit_source) VALUES (v_gal,v_sec,3,'processing',NULL) RETURNING id INTO b;
  ok := fail_face_index(b,'nullsrc',true);
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  SELECT count(*) FILTER (WHERE delta<>0) INTO refunds FROM token_ledger WHERE business_id=v_biz AND reason='face_index_refund';
  INSERT INTO r(name,pass,detail) VALUES ('NULL source: transition ok, no balance minted', ok AND bal=5 AND refunds=0, format('ok=%s bal=%s nonzero=%s',ok,bal,refunds));
END $$;

-- ══════════════ BLOCK 5 — multi-order entitlement accounting (round 2 item 4) ══════════════
DO $$
DECLARE v_biz UUID:='aaaaaaaa-0000-0000-0000-000000000001'; v_gal UUID:='aaaaaaaa-0000-0000-0000-000000000002'; v_sec UUID:='aaaaaaaa-0000-0000-0000-000000000003';
  ok BOOLEAN; ok2 BOOLEAN; a UUID; gcu INT; paid BOOLEAN; o1 UUID:='b1b1b1b1-0000-0000-0000-0000000000b1'; o2 UUID:='b2b2b2b2-0000-0000-0000-0000000000b2';
BEGIN
  DELETE FROM gallery_entitlements WHERE gallery_id=v_gal; DELETE FROM images WHERE gallery_id=v_gal;
  UPDATE galleries SET gallery_credit_used=0 WHERE id=v_gal; PERFORM recompute_gallery_entitlement_cache(v_gal);
  UPDATE business_tokens SET balance=0 WHERE business_id=v_biz;
  ok := mark_gallery_paid(v_biz,v_gal,o1,12,NULL);
  INSERT INTO r(name,pass,detail) VALUES ('order1 -> allowance 10000', ok AND gallery_active_allowance(v_gal)=10000, format('a=%s',gallery_active_allowance(v_gal)));
  ok := mark_gallery_paid(v_biz,v_gal,o2,12,NULL);
  INSERT INTO r(name,pass,detail) VALUES ('order2 distinct -> 20000 (2 rows)', ok AND gallery_active_allowance(v_gal)=20000 AND (SELECT count(*) FROM gallery_entitlements WHERE gallery_id=v_gal)=2, format('a=%s',gallery_active_allowance(v_gal)));
  ok2 := mark_gallery_paid(v_biz,v_gal,o1,12,NULL);
  INSERT INTO r(name,pass,detail) VALUES ('retry order1 idempotent (still 20000)', ok2=false AND gallery_active_allowance(v_gal)=20000, format('ret=%s',ok2));
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,1,'pending') RETURNING id INTO a;
  PERFORM reserve_face_index_credit(v_gal,a); SELECT gallery_credit_used INTO gcu FROM galleries WHERE id=v_gal;
  ok := revoke_gallery_paid(v_biz,v_gal,o1,NULL); SELECT one_time_paid INTO paid FROM galleries WHERE id=v_gal;
  INSERT INTO r(name,pass,detail) VALUES ('refund order1 removes only its 10000 (->10000, still paid)', ok AND gallery_active_allowance(v_gal)=10000 AND paid=true AND gcu=1, format('a=%s paid=%s used=%s',gallery_active_allowance(v_gal),paid,gcu));
  ok := revoke_gallery_paid(v_biz,v_gal,o1,NULL);
  INSERT INTO r(name,pass,detail) VALUES ('duplicate/older refund no-op', ok=false, format('r=%s',ok));
  UPDATE gallery_entitlements SET expires_at=now()-interval '1 day' WHERE order_ref=o2;
  SELECT gallery_credit_used INTO gcu FROM galleries WHERE id=v_gal;
  INSERT INTO r(name,pass,detail) VALUES ('order2 expiry independent -> 0, remaining>=0', gallery_active_allowance(v_gal)=0 AND GREATEST(gallery_active_allowance(v_gal)-gcu,0)=0, format('a=%s used=%s',gallery_active_allowance(v_gal),gcu));
END $$;

-- ══════════════ BLOCK 6 — server size + path binding + deletion + reconciliation ══════════════
DO $$
DECLARE v_biz UUID:='aaaaaaaa-0000-0000-0000-000000000001'; v_gal UUID:='aaaaaaaa-0000-0000-0000-000000000002'; v_sec UUID:='aaaaaaaa-0000-0000-0000-000000000003'; v_usr UUID:='aaaaaaaa-9999-9999-9999-000000000001';
  pfx TEXT:='t083/aaaaaaaa-0000-0000-0000-000000000002/originals/'; a UUID; err TEXT; sz BIGINT; used BIGINT; after BIGINT; recon_biz BIGINT; recon_img BIGINT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_usr::text)::text, true);
  DELETE FROM gallery_entitlements WHERE gallery_id=v_gal; PERFORM recompute_gallery_entitlement_cache(v_gal);
  UPDATE business_storage SET used_bytes=0 WHERE business_id=v_biz; DELETE FROM images WHERE gallery_id=v_gal;
  -- item 1: NULL client size -> server size persisted
  a := record_image_upload(v_gal,'m.jpg','p','t',pfx||'oa',NULL,v_sec,1,false); SELECT original_size_bytes INTO sz FROM images WHERE id=a;
  INSERT INTO r(name,pass,detail) VALUES ('server size persisted with NULL client size', sz=400, format('sz=%s',sz));
  -- item 1: missing size metadata -> reject (no fallback)
  BEGIN PERFORM record_image_upload(v_gal,'n.jpg','p','t',pfx||'onosize',400,v_sec,2,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err:=SQLERRM; END;
  INSERT INTO r(name,pass,detail) VALUES ('missing size metadata rejected (no client fallback)', err='original_object_size_missing', err);
  -- item 1: mismatch rejected
  BEGIN PERFORM record_image_upload(v_gal,'m2.jpg','p','t',pfx||'oa',999999,v_sec,3,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err:=SQLERRM; END;
  INSERT INTO r(name,pass,detail) VALUES ('size_mismatch rejected', err='size_mismatch', err);
  -- item 2: path binding rejects wrong gallery / wrong slug / bad structure
  BEGIN PERFORM record_image_upload(v_gal,'w.jpg','p','t','t083/ffffffff-0000-0000-0000-00000000000f/originals/oa',400,v_sec,4,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err:=SQLERRM; END;
  INSERT INTO r(name,pass,detail) VALUES ('path binding: wrong gallery rejected', err='invalid_object_path', err);
  BEGIN PERFORM record_image_upload(v_gal,'w.jpg','p','t','wrongslug/aaaaaaaa-0000-0000-0000-000000000002/originals/ow',400,v_sec,5,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err:=SQLERRM; END;
  INSERT INTO r(name,pass,detail) VALUES ('path binding: wrong slug rejected', err='invalid_object_path', err);
  BEGIN PERFORM record_image_upload(v_gal,'w.jpg','p','t','aaaaaaaa-0000-0000-0000-000000000002/originals/oa',400,v_sec,6,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err:=SQLERRM; END;
  INSERT INTO r(name,pass,detail) VALUES ('path binding: 2-seg structure rejected', err='invalid_object_path', err);
  -- deletion cascade decrements business storage
  SELECT used_bytes INTO used FROM business_storage WHERE business_id=v_biz;
  DELETE FROM galleries WHERE id=v_gal;
  SELECT used_bytes INTO after FROM business_storage WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('gallery delete cascades storage decrement', used>0 AND after=0, format('before=%s after=%s',used,after));
  -- reconciliation
  SELECT COALESCE(SUM(bs.used_bytes),0) INTO recon_biz FROM business_storage bs;
  SELECT COALESCE(SUM(COALESCE(i.original_size_bytes,0)),0) INTO recon_img FROM images i WHERE NOT COALESCE(i.counted_gallery_storage,false);
  INSERT INTO r(name,pass,detail) VALUES ('reconciliation: business_storage == SUM(non-gallery image sizes)', recon_biz=recon_img, format('counter=%s images=%s',recon_biz,recon_img));
END $$;

SELECT name, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM r ORDER BY id;

ROLLBACK;
