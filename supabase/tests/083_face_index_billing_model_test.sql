-- 083_face_index_billing_model_test.sql
--
-- Re-runnable validation for migration 083. Self-contained: builds a disposable
-- fixture, asserts the credit lifecycle + storage cap + completion trigger, then
-- ROLLS BACK so nothing is persisted. Run against any DB that has migration 083
-- applied (a preview branch is recommended):
--
--   psql "$DATABASE_URL" -f supabase/tests/083_face_index_billing_model_test.sql
--
-- The final SELECT prints one row per assertion (PASS/FAIL) BEFORE the rollback.
-- Requires an auth user id for the owner; uses a fixed UUID that need not exist
-- in auth.users because record_image_upload is exercised via set_config below.

BEGIN;

-- ── Fixture ─────────────────────────────────────────────────────────────────
INSERT INTO plans(id,name,token_count,storage_limit_bytes)
  VALUES ('t_tiny','TestTiny',10,1000) ON CONFLICT (id) DO UPDATE SET token_count=10, storage_limit_bytes=1000;
INSERT INTO businesses(id,user_id,business_name)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-9999-9999-9999-000000000001','T083') ON CONFLICT (id) DO NOTHING;
DELETE FROM subscriptions WHERE business_id='aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO subscriptions(business_id,plan_id,status)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','t_tiny','active');
INSERT INTO business_tokens(business_id,balance,lifetime_consumed)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',10,0) ON CONFLICT (business_id) DO UPDATE SET balance=10, lifetime_consumed=0;
INSERT INTO galleries(id,business_id,face_index_status)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','indexing') ON CONFLICT (id) DO NOTHING;
INSERT INTO gallery_sections(id,gallery_id)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002') ON CONFLICT (id) DO NOTHING;
INSERT INTO business_storage(business_id,used_bytes)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',0) ON CONFLICT (business_id) DO UPDATE SET used_bytes=0;

CREATE TEMP TABLE r(id serial, name text, pass boolean, detail text) ON COMMIT DROP;

DO $$
DECLARE
  v_biz UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_gal UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_sec UUID := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_usr UUID := 'aaaaaaaa-9999-9999-9999-000000000001';
  a UUID; res TEXT; ok BOOLEAN; bal INT; st TEXT; used INT; err TEXT; cnt INT; sk INT; ch INT; rf INT;
BEGIN
  -- credit lifecycle
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,1,'pending') RETURNING id INTO a;
  res := reserve_face_index_credit(v_gal,a);
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('reserve charges 1', res='reserved' AND bal=9, format('res=%s bal=%s',res,bal));

  ok := finalize_face_index(a,3);
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('finalize keeps charge', ok AND bal=9, format('bal=%s',bal));

  ok := finalize_face_index(a,3);            -- duplicate
  res := reserve_face_index_credit(v_gal,a); -- re-reserve indexed
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('no double charge on retry', ok=false AND res='not_claimable' AND bal=9, format('dupFinal=%s reRes=%s bal=%s',ok,res,bal));

  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,2,'pending') RETURNING id INTO a;
  PERFORM reserve_face_index_credit(v_gal,a); ok := finalize_face_index(a,0);
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('0 faces still charged', ok AND bal=8, format('bal=%s',bal));

  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_gal,v_sec,3,'pending') RETURNING id INTO a;
  PERFORM reserve_face_index_credit(v_gal,a); ok := fail_face_index(a,'boom',true);
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz; SELECT face_index_status INTO st FROM images WHERE id=a;
  INSERT INTO r(name,pass,detail) VALUES ('failed AWS refunds', ok AND bal=8 AND st='failed', format('bal=%s st=%s',bal,st));

  -- partial + never negative. Clear the ledger so the charge/refund counts in
  -- this block are isolated from the earlier single-image asserts above.
  DELETE FROM token_ledger WHERE business_id=v_biz;
  UPDATE business_tokens SET balance=2 WHERE business_id=v_biz;
  DELETE FROM images WHERE gallery_id=v_gal; UPDATE galleries SET face_index_status='indexing', face_indexed_count=0 WHERE id=v_gal;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES
    (v_gal,v_sec,1,'pending'),(v_gal,v_sec,2,'pending'),(v_gal,v_sec,3,'pending'),(v_gal,v_sec,4,'pending'),(v_gal,v_sec,5,'pending');
  PERFORM reserve_face_index_credit(v_gal,img.id) FROM images img WHERE img.gallery_id=v_gal ORDER BY img.sort_order;
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  SELECT count(*) FILTER (WHERE face_index_status='processing'), count(*) FILTER (WHERE face_index_status='skipped_no_allowance') INTO cnt,sk FROM images WHERE gallery_id=v_gal;
  INSERT INTO r(name,pass,detail) VALUES ('partial never negative (2 proc,3 skip)', bal=0 AND cnt=2 AND sk=3, format('bal=%s proc=%s skip=%s',bal,cnt,sk));

  -- resume only remaining; trigger flips partial then done
  PERFORM finalize_face_index(img.id,1) FROM images img WHERE img.gallery_id=v_gal AND img.face_index_status='processing';
  SELECT face_index_status INTO st FROM galleries WHERE id=v_gal;
  INSERT INTO r(name,pass,detail) VALUES ('gallery -> partial while skipped remain', st='partial', format('st=%s',st));
  UPDATE business_tokens SET balance=3 WHERE business_id=v_biz;
  PERFORM reserve_face_index_credit(v_gal,img.id) FROM images img WHERE img.gallery_id=v_gal AND img.face_index_status='skipped_no_allowance' ORDER BY img.sort_order;
  PERFORM finalize_face_index(img.id,1) FROM images img WHERE img.gallery_id=v_gal AND img.face_index_status='processing';
  SELECT face_index_status INTO st FROM galleries WHERE id=v_gal;
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  SELECT count(*) FILTER (WHERE reason='face_index'), count(*) FILTER (WHERE reason='face_index_refund') INTO ch,rf FROM token_ledger WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('resume -> done, exactly 5 charges 0 refunds', st='done' AND bal=0 AND ch=5 AND rf=0, format('st=%s bal=%s charges=%s refunds=%s',st,bal,ch,rf));

  -- storage cap (free upload, atomic reject, delete decrements) via auth context
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_usr::text)::text, true);
  UPDATE business_storage SET used_bytes=0 WHERE business_id=v_biz;
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  a := record_image_upload(v_gal,'a.jpg','p','t','o',400,v_sec,10,false);
  PERFORM record_image_upload(v_gal,'b.jpg','p','t','o',400,v_sec,11,false);
  INSERT INTO r(name,pass,detail) SELECT 'upload is free (no credit change)', (balance=bal), format('bal=%s',balance) FROM business_tokens WHERE business_id=v_biz;
  BEGIN
    PERFORM record_image_upload(v_gal,'c.jpg','p','t','o',300,v_sec,12,false); err:='NO_ERROR';
  EXCEPTION WHEN others THEN err := SQLERRM; END;
  SELECT used_bytes INTO used FROM business_storage WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('storage cap atomic (reject at 1100>1000)', err='storage_limit_exceeded' AND used=800, format('err=%s used=%s',err,used));
  DELETE FROM images WHERE id=a;
  SELECT used_bytes INTO used FROM business_storage WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('delete decrements storage', used=400, format('used=%s',used));
END $$;

-- ── One-time gallery entitlement (gallery-specific 10,000 + 75 GB, 12 months) ──
DO $$
DECLARE
  v_biz  UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_galA UUID := 'aaaaaaaa-0000-0000-0000-000000000002';   -- becomes one-time paid
  v_galB UUID := 'aaaaaaaa-0000-0000-0000-000000000004';   -- unpaid, same business
  v_sec  UUID := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_secB UUID := 'aaaaaaaa-0000-0000-0000-000000000005';
  v_usr  UUID := 'aaaaaaaa-9999-9999-9999-000000000001';
  v_ref  UUID := '11111111-2222-3333-4444-555555555555';
  ok BOOLEAN; res TEXT; a UUID; alw INT; gused INT; bal INT; cnt INT; sk INT; st TEXT; err TEXT;
  paid BOOLEAN; slim BIGINT; exp TIMESTAMPTZ; gstore BIGINT; bizstore BIGINT;
BEGIN
  INSERT INTO galleries(id,business_id,face_index_status) VALUES (v_galB,v_biz,'indexing') ON CONFLICT (id) DO NOTHING;
  INSERT INTO gallery_sections(id,gallery_id) VALUES (v_secB,v_galB) ON CONFLICT (id) DO NOTHING;
  DELETE FROM images WHERE gallery_id IN (v_galA,v_galB);
  DELETE FROM token_ledger WHERE business_id=v_biz;
  UPDATE galleries SET one_time_paid=false, face_index_allowance=0, gallery_credit_used=0,
    storage_used_bytes=0, storage_limit_bytes=NULL, paid_expires_at=NULL, one_time_order_ref=NULL,
    face_index_status='indexing', face_indexed_count=0 WHERE id IN (v_galA,v_galB);

  -- (1) one-time payment grants the correct gallery entitlement
  ok := mark_gallery_paid(v_biz, v_galA, v_ref, 12, NULL);
  SELECT one_time_paid, face_index_allowance, storage_limit_bytes, paid_expires_at INTO paid,alw,slim,exp FROM galleries WHERE id=v_galA;
  INSERT INTO r(name,pass,detail) VALUES ('one-time grants 10000 + 75GB + 12mo',
    ok AND paid AND alw=10000 AND slim=80530636800 AND exp>now()+interval '11 months' AND exp<now()+interval '13 months',
    format('paid=%s allow=%s store=%s',paid,alw,slim));

  -- (6) webhook retry with same ref does not grant twice
  ok := mark_gallery_paid(v_biz, v_galA, v_ref, 12, NULL);
  SELECT face_index_allowance INTO alw FROM galleries WHERE id=v_galA;
  INSERT INTO r(name,pass,detail) VALUES ('webhook retry same ref -> no double grant', ok=false AND alw=10000, format('ret=%s allow=%s',ok,alw));

  -- (3) face indexing works when business monthly balance is 0 (draws from gallery pool)
  UPDATE business_tokens SET balance=0 WHERE business_id=v_biz;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galA,v_sec,1,'pending') RETURNING id INTO a;
  res := reserve_face_index_credit(v_galA,a);
  SELECT gallery_credit_used INTO gused FROM galleries WHERE id=v_galA;
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  ok := finalize_face_index(a,2);
  INSERT INTO r(name,pass,detail) VALUES ('indexes at business balance 0 (gallery pool)', res='reserved' AND gused=1 AND bal=0 AND ok, format('res=%s gused=%s bal=%s',res,gused,bal));

  -- (2) another gallery cannot use gallery A's entitlement (galB unpaid, balance 0)
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galB,v_secB,1,'pending') RETURNING id INTO a;
  res := reserve_face_index_credit(v_galB,a);
  SELECT face_index_status INTO st FROM images WHERE id=a;
  INSERT INTO r(name,pass,detail) VALUES ('entitlement is gallery-specific (galB blocked)', res='no_allowance' AND st='skipped_no_allowance', format('res=%s st=%s',res,st));

  -- (8) monthly subscriber buys one-time gallery: gallery consumed BEFORE business
  UPDATE business_tokens SET balance=5 WHERE business_id=v_biz;
  UPDATE galleries SET face_index_allowance=2, gallery_credit_used=0 WHERE id=v_galA;
  DELETE FROM images WHERE gallery_id=v_galA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galA,v_sec,1,'pending'),(v_galA,v_sec,2,'pending'),(v_galA,v_sec,3,'pending');
  PERFORM reserve_face_index_credit(v_galA, img.id) FROM images img WHERE img.gallery_id=v_galA ORDER BY img.sort_order;
  SELECT gallery_credit_used INTO gused FROM galleries WHERE id=v_galA;
  SELECT balance INTO bal FROM business_tokens WHERE business_id=v_biz;
  INSERT INTO r(name,pass,detail) VALUES ('subscriber: gallery pool consumed before business', gused=2 AND bal=4, format('gused=%s bal=%s (gallery 2 then business 1 of 3)',gused,bal));

  -- (4) partial after the gallery cap: allowance 2, business 0, 5 imgs -> 2 + 3 skipped
  UPDATE business_tokens SET balance=0 WHERE business_id=v_biz;
  UPDATE galleries SET face_index_allowance=2, gallery_credit_used=0 WHERE id=v_galA;
  DELETE FROM images WHERE gallery_id=v_galA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galA,v_sec,1,'pending'),(v_galA,v_sec,2,'pending'),(v_galA,v_sec,3,'pending'),(v_galA,v_sec,4,'pending'),(v_galA,v_sec,5,'pending');
  PERFORM reserve_face_index_credit(v_galA, img.id) FROM images img WHERE img.gallery_id=v_galA ORDER BY img.sort_order;
  SELECT count(*) FILTER (WHERE face_index_status='processing'), count(*) FILTER (WHERE face_index_status='skipped_no_allowance') INTO cnt,sk FROM images WHERE gallery_id=v_galA;
  SELECT gallery_credit_used INTO gused FROM galleries WHERE id=v_galA;
  INSERT INTO r(name,pass,detail) VALUES ('gallery cap: 2 processed + 3 skipped, no overshoot', cnt=2 AND sk=3 AND gused=2, format('proc=%s skip=%s gused=%s',cnt,sk,gused));

  -- (7) expiration: an expired entitlement is inactive
  UPDATE galleries SET one_time_paid=true, face_index_allowance=10, gallery_credit_used=0, paid_expires_at=now()-interval '1 day' WHERE id=v_galA;
  UPDATE business_tokens SET balance=0 WHERE business_id=v_biz;
  DELETE FROM images WHERE gallery_id=v_galA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galA,v_sec,1,'pending') RETURNING id INTO a;
  res := reserve_face_index_credit(v_galA,a);
  INSERT INTO r(name,pass,detail) VALUES ('expired entitlement is inactive', res='no_allowance', format('res=%s',res));

  -- (9) refund / reversal revokes the entitlement
  UPDATE galleries SET one_time_paid=true, face_index_allowance=10, gallery_credit_used=0, paid_expires_at=now()+interval '300 days' WHERE id=v_galA;
  ok := revoke_gallery_paid(v_biz, v_galA, v_ref, NULL);
  SELECT one_time_paid, face_index_allowance INTO paid, alw FROM galleries WHERE id=v_galA;
  UPDATE business_tokens SET balance=0 WHERE business_id=v_biz;
  DELETE FROM images WHERE gallery_id=v_galA;
  INSERT INTO images(gallery_id,section_id,sort_order,face_index_status) VALUES (v_galA,v_sec,1,'pending') RETURNING id INTO a;
  res := reserve_face_index_credit(v_galA,a);
  INSERT INTO r(name,pass,detail) VALUES ('refund revokes entitlement', ok AND paid=false AND alw=0 AND res='no_allowance', format('ok=%s paid=%s allow=%s res=%s',ok,paid,alw,res));

  -- (5) gallery 75GB storage pool is atomic AND independent of the business 2GB cap
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_usr::text)::text, true);
  UPDATE galleries SET one_time_paid=true, face_index_allowance=10000, storage_limit_bytes=1000, storage_used_bytes=0, paid_expires_at=now()+interval '300 days' WHERE id=v_galA;
  UPDATE business_storage SET used_bytes=0 WHERE business_id=v_biz;
  DELETE FROM images WHERE gallery_id=v_galA;
  a := record_image_upload(v_galA,'x.jpg','p','t','o',400,v_sec,1,false);
  PERFORM record_image_upload(v_galA,'y.jpg','p','t','o',400,v_sec,2,false);
  SELECT storage_used_bytes INTO gstore FROM galleries WHERE id=v_galA;
  SELECT used_bytes INTO bizstore FROM business_storage WHERE business_id=v_biz;
  BEGIN PERFORM record_image_upload(v_galA,'z.jpg','p','t','o',300,v_sec,3,false); err:='NO_ERROR'; EXCEPTION WHEN others THEN err:=SQLERRM; END;
  INSERT INTO r(name,pass,detail) VALUES ('gallery 75GB pool atomic + independent of business 2GB',
    gstore=800 AND bizstore=0 AND err='storage_limit_exceeded', format('gallery_used=%s business_used=%s err=%s',gstore,bizstore,err));
END $$;

SELECT name, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM r ORDER BY id;

ROLLBACK;
