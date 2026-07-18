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
INSERT INTO subscriptions(business_id,plan_id,status)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','t_tiny','active') ON CONFLICT DO NOTHING;
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

SELECT name, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM r ORDER BY id;

ROLLBACK;
