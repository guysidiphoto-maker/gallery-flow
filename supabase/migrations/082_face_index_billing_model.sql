-- 082_face_index_billing_model.sql
--
-- BILLING MODEL CHANGE: uploads become free (storage-capped only); a
-- face-recognition credit is consumed only when an image is actually indexed
-- (one credit per indexed photo). Plans keep the same numbers, reinterpreted
-- as "face-recognition photos per month" (Solo 2,000 / Pro 10,000 / Studio
-- 30,000). Partial processing is supported: when a gallery has more unindexed
-- images than remaining allowance, the covered images index, the rest are
-- marked skipped_no_allowance and resume when allowance is topped up.
--
-- Per-image lifecycle (state machine on images.face_index_status):
--   pending -> processing -> indexed | failed | skipped_no_allowance
--
-- INVARIANT: an image in 'processing' holds exactly one reserved credit.
-- Reserve-at-claim + refund-on-failure guarantees: never negative, never
-- overshoot, a failed AWS request never permanently consumes allowance, and a
-- successful index with 0 faces still consumes 1 credit (service was used).
--
-- Validated end-to-end on Supabase preview branch tmresrsyypzethfofaxn
-- (15/15 assertions: credit lifecycle 11/11, storage cap 4/4).
--
-- ROLLBACK: see 082_face_index_billing_model_rollback.sql. In short — restore
-- the previous record_image_upload (065) so uploads deduct a token again, drop
-- the reserve/finalize/fail RPCs, restore check_gallery_face_index_complete to
-- its pre-082 form, and (optionally) drop business_storage +
-- images.face_index_status. No data is destroyed by this migration; the ledger
-- keeps an auditable trail of every face_index / face_index_refund.

BEGIN;

-- ─── 1. Per-image status column ─────────────────────────────────────────────

ALTER TABLE images
  ADD COLUMN IF NOT EXISTS face_index_status TEXT NOT NULL DEFAULT 'pending';

DO $$ BEGIN
  ALTER TABLE images ADD CONSTRAINT images_face_index_status_check
    CHECK (face_index_status = ANY (ARRAY['pending','processing','indexed','failed','skipped_no_allowance']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: anything already stamped is 'indexed'; everything else stays pending.
UPDATE images SET face_index_status = 'indexed'
  WHERE face_indexed_at IS NOT NULL AND face_index_status <> 'indexed';

CREATE INDEX IF NOT EXISTS idx_images_gallery_face_index_status
  ON images (gallery_id, face_index_status);

-- ─── 2. Ledger reasons + gallery 'partial' status ───────────────────────────

ALTER TABLE token_ledger DROP CONSTRAINT IF EXISTS token_ledger_reason_check;
ALTER TABLE token_ledger ADD CONSTRAINT token_ledger_reason_check
  CHECK (reason = ANY (ARRAY[
    'signup_grant','purchase','image_upload','refund','chargeback',
    'admin_grant','admin_deduct','subscription_reset',
    'face_index','face_index_refund','migration_restore']));

ALTER TABLE galleries DROP CONSTRAINT IF EXISTS galleries_face_index_status_check;
ALTER TABLE galleries ADD CONSTRAINT galleries_face_index_status_check
  CHECK (face_index_status = ANY (ARRAY['pending','indexing','done','failed','partial']));

-- ─── 3. Storage accounting (atomic, concurrency-safe) ───────────────────────

CREATE TABLE IF NOT EXISTS business_storage (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  used_bytes  BIGINT NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill current usage from existing image sizes.
INSERT INTO business_storage (business_id, used_bytes)
SELECT g.business_id, COALESCE(SUM(COALESCE(i.original_size_bytes,0)),0)
FROM galleries g LEFT JOIN images i ON i.gallery_id = g.id
GROUP BY g.business_id
ON CONFLICT (business_id) DO UPDATE SET used_bytes = EXCLUDED.used_bytes, updated_at = now();

-- Keep the counter accurate on delete (uploads increment it inside
-- record_image_upload; deletes decrement it here).
CREATE OR REPLACE FUNCTION trg_image_storage_dec() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_biz UUID;
BEGIN
  SELECT business_id INTO v_biz FROM galleries WHERE id = OLD.gallery_id;
  IF v_biz IS NOT NULL THEN
    UPDATE business_storage
       SET used_bytes = GREATEST(0, used_bytes - COALESCE(OLD.original_size_bytes,0)),
           updated_at = now()
     WHERE business_id = v_biz;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS images_storage_dec ON images;
CREATE TRIGGER images_storage_dec AFTER DELETE ON images
  FOR EACH ROW EXECUTE FUNCTION trg_image_storage_dec();

-- ─── 4. Free, storage-capped upload (replaces the token-deducting version) ──

CREATE OR REPLACE FUNCTION public.record_image_upload(
  p_gallery_id uuid, p_filename text, p_web_preview_path text, p_thumbnail_path text,
  p_original_path text, p_original_size bigint DEFAULT NULL::bigint, p_section_id uuid DEFAULT NULL::uuid,
  p_sort_order integer DEFAULT 0, p_public_thumb_present boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_business_id UUID; v_owner_user UUID; v_image_id UUID; v_section UUID := p_section_id;
  v_size BIGINT := COALESCE(p_original_size,0); v_limit BIGINT; v_used BIGINT; v_has_sub BOOLEAN;
BEGIN
  SELECT g.business_id, b.user_id INTO v_business_id, v_owner_user
    FROM galleries g JOIN businesses b ON b.id=g.business_id WHERE g.id=p_gallery_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'gallery_not_found'; END IF;
  IF v_owner_user IS NULL OR v_owner_user <> auth.uid() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- Resolve the active plan's storage cap (fall back to the free 'starter' cap).
  SELECT p.storage_limit_bytes, true INTO v_limit, v_has_sub
    FROM subscriptions s JOIN plans p ON p.id=s.plan_id
   WHERE s.business_id=v_business_id AND s.status IN ('active','trial') ORDER BY s.plan_id LIMIT 1;
  IF v_has_sub IS NULL THEN SELECT storage_limit_bytes INTO v_limit FROM plans WHERE id='starter'; END IF;

  -- Atomic storage cap: the guarded UPDATE only succeeds while the new total
  -- fits under the limit, so concurrent uploads can never collectively exceed
  -- the cap (each commits its own +size or is rejected). A NULL limit = no cap.
  INSERT INTO business_storage(business_id,used_bytes) VALUES (v_business_id,0) ON CONFLICT DO NOTHING;
  IF v_limit IS NULL THEN
    UPDATE business_storage SET used_bytes=used_bytes+v_size, updated_at=now() WHERE business_id=v_business_id;
  ELSE
    UPDATE business_storage SET used_bytes=used_bytes+v_size, updated_at=now()
      WHERE business_id=v_business_id AND used_bytes+v_size <= v_limit RETURNING used_bytes INTO v_used;
    IF v_used IS NULL THEN RAISE EXCEPTION 'storage_limit_exceeded'; END IF;
  END IF;

  IF v_section IS NULL THEN
    SELECT id INTO v_section FROM gallery_sections WHERE gallery_id=p_gallery_id ORDER BY sort_order NULLS LAST, id LIMIT 1;
  END IF;

  INSERT INTO images (gallery_id,filename,web_preview_path,thumbnail_path,original_path,
    original_uploaded,original_size_bytes,section_id,sort_order,is_top_pick,public_thumb_present,face_index_status)
  VALUES (p_gallery_id,p_filename,p_web_preview_path,p_thumbnail_path,p_original_path,
    p_original_path IS NOT NULL,p_original_size,v_section,COALESCE(p_sort_order,0),false,COALESCE(p_public_thumb_present,false),'pending')
  RETURNING id INTO v_image_id;
  UPDATE galleries SET image_count=COALESCE(image_count,0)+1 WHERE id=p_gallery_id;
  RETURN v_image_id;  -- NO token deduction: uploads are free, only storage-capped
END $function$;

-- ─── 5. Credit lifecycle RPCs (reserve / finalize / fail) ───────────────────

-- Reserve one credit and claim a pending/skipped image (pending|skipped -> processing).
-- Atomic + concurrency-safe: the balance>0 guard means parallel workers never
-- overshoot or go negative. On no allowance the image is parked as
-- skipped_no_allowance (resumable). Returns
--   'reserved' | 'no_allowance' | 'not_claimable' | 'gallery_not_found'.
CREATE OR REPLACE FUNCTION public.reserve_face_index_credit(p_gallery_id uuid, p_image_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_biz UUID; v_claimed UUID; v_bal INTEGER;
BEGIN
  SELECT business_id INTO v_biz FROM galleries WHERE id=p_gallery_id;
  IF v_biz IS NULL THEN RETURN 'gallery_not_found'; END IF;
  UPDATE images SET face_index_status='processing'
    WHERE id=p_image_id AND gallery_id=p_gallery_id AND face_index_status IN ('pending','skipped_no_allowance')
    RETURNING id INTO v_claimed;
  IF v_claimed IS NULL THEN RETURN 'not_claimable'; END IF;
  UPDATE business_tokens SET balance=balance-1, lifetime_consumed=lifetime_consumed+1, updated_at=now()
    WHERE business_id=v_biz AND balance>0 RETURNING balance INTO v_bal;
  IF v_bal IS NULL THEN
    UPDATE images SET face_index_status='skipped_no_allowance' WHERE id=p_image_id;
    RETURN 'no_allowance';
  END IF;
  INSERT INTO token_ledger(business_id,delta,reason,ref_id,metadata)
    VALUES (v_biz,-1,'face_index',p_image_id, jsonb_build_object('gallery_id',p_gallery_id));
  RETURN 'reserved';
END $function$;

-- processing -> indexed, KEEPS the reserved credit. Idempotent on status, so a
-- duplicate/late call (crash-window retry) is a no-op and cannot double-count.
CREATE OR REPLACE FUNCTION public.finalize_face_index(p_image_id uuid, p_face_count integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_gallery UUID;
BEGIN
  UPDATE images SET face_index_status='indexed', face_indexed_at=COALESCE(face_indexed_at,now()), face_count=p_face_count
    WHERE id=p_image_id AND face_index_status='processing' RETURNING gallery_id INTO v_gallery;
  IF v_gallery IS NULL THEN RETURN false; END IF;
  UPDATE galleries SET face_indexed_count=COALESCE(face_indexed_count,0)+1 WHERE id=v_gallery;
  RETURN true;
END $function$;

-- processing -> failed (terminal) or pending (retry); REFUNDS the credit with a
-- 'face_index_refund' ledger row. Only acts on rows still 'processing', so it
-- can never clobber a finalize that actually landed.
CREATE OR REPLACE FUNCTION public.fail_face_index(p_image_id uuid, p_error text, p_terminal boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_gallery UUID; v_biz UUID;
BEGIN
  SELECT gallery_id INTO v_gallery FROM images WHERE id=p_image_id AND face_index_status='processing';
  IF v_gallery IS NULL THEN RETURN false; END IF;
  SELECT business_id INTO v_biz FROM galleries WHERE id=v_gallery;
  UPDATE business_tokens SET balance=balance+1, lifetime_consumed=GREATEST(0,lifetime_consumed-1), updated_at=now()
    WHERE business_id=v_biz;
  INSERT INTO token_ledger(business_id,delta,reason,ref_id,metadata)
    VALUES (v_biz,1,'face_index_refund',p_image_id, jsonb_build_object('gallery_id',v_gallery,'error',left(p_error,200)));
  IF p_terminal THEN
    UPDATE images SET face_index_status='failed', face_index_error=left(p_error,500) WHERE id=p_image_id;
  ELSE
    UPDATE images SET face_index_status='pending', face_index_attempts=COALESCE(face_index_attempts,0)+1, face_index_error=left(p_error,500) WHERE id=p_image_id;
  END IF;
  RETURN true;
END $function$;

-- Pre-flight summary for the UI: how much work, how much allowance, how many
-- will process now (min(remaining, allowance)).
CREATE OR REPLACE FUNCTION public.get_gallery_index_summary(p_gallery_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_biz UUID; v_bal INTEGER; r RECORD;
BEGIN
  SELECT business_id INTO v_biz FROM galleries WHERE id=p_gallery_id;
  SELECT COALESCE(balance,0) INTO v_bal FROM business_tokens WHERE business_id=v_biz;
  SELECT count(*) AS total,
         count(*) FILTER (WHERE face_index_status='indexed') AS indexed,
         count(*) FILTER (WHERE face_index_status IN ('pending','skipped_no_allowance')) AS remaining,
         count(*) FILTER (WHERE face_index_status='failed') AS failed
    INTO r FROM images WHERE gallery_id=p_gallery_id;
  RETURN json_build_object('total',r.total,'indexed',r.indexed,'remaining',r.remaining,'failed',r.failed,
    'allowance',COALESCE(v_bal,0),'will_process_now',LEAST(r.remaining,COALESCE(v_bal,0)));
END $function$;

-- ─── 6. Model-aware gallery completion trigger ──────────────────────────────
-- Old version flipped 'done' when every image had face_indexed_at, firing on
-- UPDATE OF face_indexed_at. Under the credit model some images end 'failed' or
-- 'skipped_no_allowance' and never get a timestamp, so (a) completion is
-- computed from status counts and (b) the trigger fires on UPDATE OF
-- face_index_status (every terminal per-image transition, incl. the ones that
-- don't touch face_indexed_at). Completion rule when no pending/processing
-- remain: skipped>0 -> partial (resumable); else indexed>0 -> done; else
-- failed>0 -> failed. The edge function also sets a final status as a belt-and-
-- braces; both agree.
CREATE OR REPLACE FUNCTION public.check_gallery_face_index_complete() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE v_pending INT; v_processing INT; v_skipped INT; v_indexed INT; v_failed INT; v_status TEXT;
BEGIN
  IF NEW.face_index_status NOT IN ('indexed','failed','skipped_no_allowance') THEN RETURN NEW; END IF;
  SELECT count(*) FILTER (WHERE face_index_status='pending'),
         count(*) FILTER (WHERE face_index_status='processing'),
         count(*) FILTER (WHERE face_index_status='skipped_no_allowance'),
         count(*) FILTER (WHERE face_index_status='indexed'),
         count(*) FILTER (WHERE face_index_status='failed')
    INTO v_pending, v_processing, v_skipped, v_indexed, v_failed
    FROM images WHERE gallery_id = NEW.gallery_id;
  IF v_pending > 0 OR v_processing > 0 THEN RETURN NEW; END IF;  -- work still in flight
  IF v_skipped > 0 THEN v_status := 'partial';
  ELSIF v_indexed > 0 THEN v_status := 'done';
  ELSIF v_failed > 0 THEN v_status := 'failed';
  ELSE RETURN NEW; END IF;  -- empty gallery
  UPDATE galleries
     SET face_index_status = v_status,
         face_indexed_at = CASE WHEN v_status='done' THEN now() ELSE face_indexed_at END,
         face_indexed_count = v_indexed
   WHERE id = NEW.gallery_id AND face_index_status IN ('indexing','partial');
  RETURN NEW;
END $function$;

-- Re-point the trigger onto face_index_status (was: face_indexed_at).
DROP TRIGGER IF EXISTS trg_gallery_face_index_complete ON images;
CREATE TRIGGER trg_gallery_face_index_complete AFTER UPDATE OF face_index_status ON images
  FOR EACH ROW EXECUTE FUNCTION check_gallery_face_index_complete();

-- ─── 7. One-time balance restoration for legacy per-upload consumption ───────
-- DEFINED but NOT executed here. Old model charged 1 token per uploaded image;
-- this restores those consumed credits (capped at the plan allowance) so no
-- existing customer loses allowance in the switch to free uploads. Run
-- MANUALLY after reviewing the impact:  SELECT * FROM restore_upload_consumed_credits();
CREATE OR REPLACE FUNCTION public.restore_upload_consumed_credits()
RETURNS TABLE(business_id uuid, restored integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE rec RECORD; v_restore INTEGER;
BEGIN
  FOR rec IN
    WITH last_reset AS (SELECT tl.business_id, MAX(tl.created_at) rat FROM token_ledger tl WHERE tl.reason='subscription_reset' GROUP BY tl.business_id)
    SELECT b.id AS bid, COALESCE(bt.balance,0) AS bal, COALESCE(p.token_count,100) AS cap,
           COALESCE(-SUM(tl.delta) FILTER (WHERE tl.reason='image_upload' AND tl.created_at > COALESCE(lr.rat, TIMESTAMP 'epoch')),0) AS consumed
    FROM businesses b
    LEFT JOIN business_tokens bt ON bt.business_id=b.id
    LEFT JOIN subscriptions s ON s.business_id=b.id AND s.status IN ('active','trial')
    LEFT JOIN plans p ON p.id=s.plan_id
    LEFT JOIN last_reset lr ON lr.business_id=b.id
    LEFT JOIN token_ledger tl ON tl.business_id=b.id
    GROUP BY b.id, bt.balance, p.token_count, lr.rat
  LOOP
    v_restore := LEAST(rec.consumed, GREATEST(rec.cap - rec.bal, 0));
    IF v_restore > 0 THEN
      UPDATE business_tokens SET balance=balance+v_restore, updated_at=now() WHERE business_tokens.business_id=rec.bid;
      INSERT INTO token_ledger(business_id,delta,reason,metadata) VALUES (rec.bid, v_restore, 'migration_restore', jsonb_build_object('note','restore upload-consumed credits (free-upload model)'));
      business_id := rec.bid; restored := v_restore; RETURN NEXT;
    END IF;
  END LOOP;
END $function$;

COMMIT;
