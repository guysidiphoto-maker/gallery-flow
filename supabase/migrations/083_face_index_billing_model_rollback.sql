-- 083_face_index_billing_model_rollback.sql
--
-- Reverts 083. Restores per-upload token deduction and the pre-083 gallery
-- completion trigger. Non-destructive: face_index_status, business_storage and
-- the ledger history are LEFT IN PLACE (dropping them loses audit trail and
-- storage counters). Uncomment the final section only if you truly want them
-- gone. Run inside a transaction.

BEGIN;

-- 1. Restore the token-deducting upload (pre-083 / migration 065 behaviour).
--    Uploads deduct one token again; storage cap is not enforced here.
CREATE OR REPLACE FUNCTION public.record_image_upload(
  p_gallery_id uuid, p_filename text, p_web_preview_path text, p_thumbnail_path text,
  p_original_path text, p_original_size bigint DEFAULT NULL::bigint, p_section_id uuid DEFAULT NULL::uuid,
  p_sort_order integer DEFAULT 0, p_public_thumb_present boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_business_id UUID; v_owner_user UUID; v_image_id UUID; v_section UUID := p_section_id; v_bal INTEGER;
BEGIN
  SELECT g.business_id, b.user_id INTO v_business_id, v_owner_user
    FROM galleries g JOIN businesses b ON b.id=g.business_id WHERE g.id=p_gallery_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'gallery_not_found'; END IF;
  IF v_owner_user IS NULL OR v_owner_user <> auth.uid() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE business_tokens SET balance=balance-1, lifetime_consumed=lifetime_consumed+1, updated_at=now()
    WHERE business_id=v_business_id AND balance>0 RETURNING balance INTO v_bal;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'insufficient_tokens'; END IF;

  IF v_section IS NULL THEN
    SELECT id INTO v_section FROM gallery_sections WHERE gallery_id=p_gallery_id ORDER BY sort_order NULLS LAST, id LIMIT 1;
  END IF;

  INSERT INTO images (gallery_id,filename,web_preview_path,thumbnail_path,original_path,
    original_uploaded,original_size_bytes,section_id,sort_order,is_top_pick,public_thumb_present)
  VALUES (p_gallery_id,p_filename,p_web_preview_path,p_thumbnail_path,p_original_path,
    p_original_path IS NOT NULL,p_original_size,v_section,COALESCE(p_sort_order,0),false,COALESCE(p_public_thumb_present,false))
  RETURNING id INTO v_image_id;
  INSERT INTO token_ledger(business_id,delta,reason,ref_id,metadata)
    VALUES (v_business_id,-1,'image_upload',v_image_id, jsonb_build_object('gallery_id',p_gallery_id));
  UPDATE galleries SET image_count=COALESCE(image_count,0)+1 WHERE id=p_gallery_id;
  RETURN v_image_id;
END $function$;

-- 2. Restore the pre-083 completion trigger (flip 'done' by timestamp).
CREATE OR REPLACE FUNCTION public.check_gallery_face_index_complete() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE total_images INT; indexed_images INT;
BEGIN
  IF NEW.face_indexed_at IS NULL OR OLD.face_indexed_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO total_images FROM images WHERE gallery_id = NEW.gallery_id;
  SELECT count(*) INTO indexed_images FROM images WHERE gallery_id = NEW.gallery_id AND face_indexed_at IS NOT NULL;
  IF indexed_images >= total_images AND total_images > 0 THEN
    UPDATE galleries SET face_index_status='done', face_indexed_at=now(), face_indexed_count=indexed_images
     WHERE id = NEW.gallery_id AND face_index_status = 'indexing';
  END IF;
  RETURN NEW;
END $function$;

-- 3. Drop the credit-lifecycle RPCs.
DROP FUNCTION IF EXISTS public.reserve_face_index_credit(uuid, uuid);
DROP FUNCTION IF EXISTS public.finalize_face_index(uuid, integer);
DROP FUNCTION IF EXISTS public.fail_face_index(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.get_gallery_index_summary(uuid);
DROP FUNCTION IF EXISTS public.restore_upload_consumed_credits();

-- 4. Restore the pre-083 mark_gallery_paid (076 form — unlock only, no
--    face-rec/storage entitlement) and drop the refund-revoke RPC. New one-time
--    purchases then behave as they did before 083.
CREATE OR REPLACE FUNCTION mark_gallery_paid(
  p_business_id UUID, p_gallery_id UUID, p_ref_id UUID DEFAULT NULL,
  p_months INTEGER DEFAULT 12, p_metadata JSONB DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID; v_existing_ref UUID;
BEGIN
  SELECT business_id, one_time_order_ref INTO v_owner, v_existing_ref FROM galleries WHERE id = p_gallery_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'gallery_not_found'; END IF;
  IF v_owner <> p_business_id THEN RAISE EXCEPTION 'gallery_business_mismatch'; END IF;
  IF p_ref_id IS NOT NULL AND v_existing_ref = p_ref_id THEN RETURN false; END IF;
  UPDATE galleries
     SET one_time_paid=true, one_time_paid_at=now(),
         paid_expires_at=now() + make_interval(months => GREATEST(p_months, 1)),
         one_time_order_ref=COALESCE(p_ref_id, one_time_order_ref)
   WHERE id = p_gallery_id;
  RETURN true;
END $$;
DROP FUNCTION IF EXISTS public.revoke_gallery_paid(uuid, uuid, uuid, jsonb);

-- 4a. Drop the order-entitlement ledger helpers (the restored mark_gallery_paid
--     above no longer references them).
DROP FUNCTION IF EXISTS public.gallery_active_allowance(uuid);
DROP FUNCTION IF EXISTS public.gallery_active_storage_limit(uuid);
DROP FUNCTION IF EXISTS public.gallery_active_remaining(uuid);
DROP FUNCTION IF EXISTS public.gallery_active_used(uuid);
DROP FUNCTION IF EXISTS public.recompute_gallery_entitlement_cache(uuid);
-- gallery_entitlements table is LEFT IN PLACE (financial audit trail; dropping it
-- loses order history). Uncomment to remove entirely:
-- DROP TABLE IF EXISTS public.gallery_entitlements;

-- 4b. Remove the gallery-delete storage trigger added by 083 (the per-image
--     images_storage_dec trigger + restored record_image_upload are enough for
--     the pre-083 model).
DROP TRIGGER IF EXISTS galleries_storage_dec ON galleries;
DROP FUNCTION IF EXISTS public.trg_gallery_storage_dec_before();

-- NOTE: plan price metadata ($39/$75/$120) is display-only and is intentionally
-- NOT rolled back to the stale $19/$39/$94 (that would re-introduce misleading
-- values). LemonSqueezy variants remain the payment source of truth regardless.
-- NOTE: EXECUTE grants tightened by 083's authorization block are left in place
-- (least-privilege is safe to keep); the restored record_image_upload/
-- mark_gallery_paid keep their authenticated/service_role grants.

-- 5. (Optional, DESTRUCTIVE) also remove the new state + storage counters.
-- DROP TRIGGER IF EXISTS images_storage_dec ON images;
-- DROP FUNCTION IF EXISTS public.trg_image_storage_dec();
-- DROP TABLE IF EXISTS business_storage;
-- ALTER TABLE images DROP COLUMN IF EXISTS face_index_status;
-- ALTER TABLE images DROP COLUMN IF EXISTS face_index_credit_source;
-- ALTER TABLE images DROP COLUMN IF EXISTS counted_gallery_storage;
-- ALTER TABLE galleries DROP COLUMN IF EXISTS face_index_allowance, DROP COLUMN IF EXISTS gallery_credit_used,
--   DROP COLUMN IF EXISTS storage_used_bytes, DROP COLUMN IF EXISTS storage_limit_bytes;
-- (Leave the token_ledger + galleries CHECK constraints widened — harmless.)

COMMIT;
