-- 083_face_index_billing_model.sql
--
-- NOTE: 082 is intentionally reserved for the planned security/p1-read-leak
-- migration, which must be created and applied BEFORE this one.
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
-- ROLLBACK: see 083_face_index_billing_model_rollback.sql. In short — restore
-- the previous record_image_upload (065) so uploads deduct a token again, drop
-- the reserve/finalize/fail RPCs, restore check_gallery_face_index_complete to
-- its pre-083 form, and (optionally) drop business_storage +
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

-- ─── 1b. One-time gallery entitlement (per-gallery face-rec + storage) ───────
-- A $150 one-time purchase grants ONE gallery: up to 10,000 face-recognition
-- photos + 75 GB storage, valid 12 months (existing paid_expires_at). The
-- entitlement is gallery-specific and non-transferable — indexing a paid
-- gallery consumes the GALLERY allowance first, then falls back to the business
-- monthly balance; uploads to a paid gallery count against the gallery's 75 GB,
-- not the business plan's storage cap.
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS face_index_allowance INT    NOT NULL DEFAULT 0,   -- granted gallery face-rec photos (10000 when paid)
  ADD COLUMN IF NOT EXISTS gallery_credit_used  INT    NOT NULL DEFAULT 0,   -- consumed against the gallery entitlement
  ADD COLUMN IF NOT EXISTS storage_used_bytes   BIGINT NOT NULL DEFAULT 0,   -- gallery-specific storage counter
  ADD COLUMN IF NOT EXISTS storage_limit_bytes  BIGINT;                       -- gallery-specific cap (NULL = use business limit)

ALTER TABLE images
  ADD COLUMN IF NOT EXISTS face_index_credit_source TEXT,                          -- which pool the reserved credit came from
  ADD COLUMN IF NOT EXISTS counted_gallery_storage  BOOLEAN NOT NULL DEFAULT false; -- did this upload count against the gallery storage pool?

DO $$ BEGIN
  ALTER TABLE images ADD CONSTRAINT images_face_index_credit_source_check
    CHECK (face_index_credit_source IS NULL OR face_index_credit_source IN ('gallery','business'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

-- Item 20: backfill galleries ALREADY one-time-paid (from migration 076) into the
-- entitlement model + their own 75 GB storage pool. The business_storage backfill
-- above counted ALL image bytes (incl. paid galleries'); here we grant the
-- entitlement and MOVE each active-paid gallery's bytes out of the business pool
-- into its gallery pool, flipping counted_gallery_storage. Idempotent (only acts
-- on images not already gallery-counted). Prod currently has 0 such galleries.
DO $$
DECLARE rec RECORD; v_bytes BIGINT;
BEGIN
  FOR rec IN
    SELECT id, business_id FROM galleries
    WHERE one_time_paid = true AND (paid_expires_at IS NULL OR paid_expires_at > now())
  LOOP
    UPDATE galleries SET
      face_index_allowance = GREATEST(face_index_allowance, 10000),
      storage_limit_bytes  = GREATEST(COALESCE(storage_limit_bytes,0), 80530636800)
    WHERE id = rec.id;

    SELECT COALESCE(SUM(COALESCE(original_size_bytes,0)),0) INTO v_bytes
      FROM images WHERE gallery_id = rec.id AND NOT COALESCE(counted_gallery_storage,false);
    IF v_bytes > 0 THEN
      UPDATE galleries SET storage_used_bytes = COALESCE(storage_used_bytes,0) + v_bytes WHERE id = rec.id;
      UPDATE business_storage SET used_bytes = GREATEST(0, used_bytes - v_bytes), updated_at = now()
        WHERE business_id = rec.business_id;
      UPDATE images SET counted_gallery_storage = true
        WHERE gallery_id = rec.id AND NOT COALESCE(counted_gallery_storage,false);
    END IF;
  END LOOP;
END $$;

-- Keep the counter accurate on delete (uploads increment it inside
-- record_image_upload; deletes decrement it here).
CREATE OR REPLACE FUNCTION trg_image_storage_dec() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_biz UUID;
BEGIN
  -- Decrement whichever pool this image's bytes were counted against at upload
  -- (counted_gallery_storage is stamped by record_image_upload). This stays
  -- correct even if the gallery entitlement later expires.
  IF COALESCE(OLD.counted_gallery_storage, false) THEN
    UPDATE galleries
       SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.original_size_bytes,0))
     WHERE id = OLD.gallery_id;
  ELSE
    SELECT business_id INTO v_biz FROM galleries WHERE id = OLD.gallery_id;
    IF v_biz IS NOT NULL THEN
      UPDATE business_storage
         SET used_bytes = GREATEST(0, used_bytes - COALESCE(OLD.original_size_bytes,0)),
             updated_at = now()
       WHERE business_id = v_biz;
    END IF;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS images_storage_dec ON images;
CREATE TRIGGER images_storage_dec AFTER DELETE ON images
  FOR EACH ROW EXECUTE FUNCTION trg_image_storage_dec();

-- Deleting a GALLERY cascades to its images, but by the time the per-image
-- AFTER DELETE trigger fires the parent gallery row is already gone, so its
-- business-pool branch (which needs galleries.business_id) would silently skip
-- and the business counter would drift high. Fix: a BEFORE DELETE on galleries
-- decrements the business pool by this gallery's business-counted image bytes
-- WHILE the rows still exist. Gallery-pool bytes vanish with the gallery (no
-- business impact). The per-image trigger then no-ops during the cascade
-- (business lookup NULL / gallery UPDATE hits a vanishing row), so no double
-- decrement. Individual image deletes are unaffected (this trigger doesn't fire).
CREATE OR REPLACE FUNCTION trg_gallery_storage_dec_before() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_biz_bytes BIGINT;
BEGIN
  SELECT COALESCE(SUM(COALESCE(original_size_bytes,0)),0) INTO v_biz_bytes
    FROM images WHERE gallery_id = OLD.id AND NOT COALESCE(counted_gallery_storage,false);
  IF v_biz_bytes > 0 THEN
    UPDATE business_storage
       SET used_bytes = GREATEST(0, used_bytes - v_biz_bytes), updated_at = now()
     WHERE business_id = OLD.business_id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS galleries_storage_dec ON galleries;
CREATE TRIGGER galleries_storage_dec BEFORE DELETE ON galleries
  FOR EACH ROW EXECUTE FUNCTION trg_gallery_storage_dec_before();

-- ─── 4. Free, storage-capped upload (replaces the token-deducting version) ──

CREATE OR REPLACE FUNCTION public.record_image_upload(
  p_gallery_id uuid, p_filename text, p_web_preview_path text, p_thumbnail_path text,
  p_original_path text, p_original_size bigint DEFAULT NULL::bigint, p_section_id uuid DEFAULT NULL::uuid,
  p_sort_order integer DEFAULT 0, p_public_thumb_present boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_business_id UUID; v_owner_user UUID; v_image_id UUID; v_section UUID := p_section_id;
  v_size BIGINT := COALESCE(p_original_size,0); v_limit BIGINT; v_used BIGINT; v_has_sub BOOLEAN;
  v_one_time_paid BOOLEAN; v_expires TIMESTAMPTZ; v_gallery_limit BIGINT; v_gallery_pool BOOLEAN := false;
  v_server_size BIGINT;
BEGIN
  SELECT g.business_id, b.user_id, g.one_time_paid, g.paid_expires_at, g.storage_limit_bytes
    INTO v_business_id, v_owner_user, v_one_time_paid, v_expires, v_gallery_limit
    FROM galleries g JOIN businesses b ON b.id=g.business_id WHERE g.id=p_gallery_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'gallery_not_found'; END IF;
  IF v_owner_user IS NULL OR v_owner_user <> auth.uid() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- Server-authoritative storage size. The browser uploads the original to the
  -- 'gallery-images' bucket BEFORE calling this RPC, so the object + its true
  -- byte size already exist in storage.objects. Never trust the client-supplied
  -- p_original_size for the counter: derive from storage metadata, reject a
  -- missing object, and reject a material mismatch (tamper / corruption).
  IF p_original_path IS NOT NULL THEN
    SELECT (metadata->>'size')::bigint INTO v_server_size
      FROM storage.objects WHERE bucket_id='gallery-images' AND name=p_original_path;
    IF NOT FOUND THEN RAISE EXCEPTION 'original_object_missing'; END IF;
    IF v_server_size IS NOT NULL THEN
      IF p_original_size IS NOT NULL
         AND abs(p_original_size - v_server_size) > GREATEST(1024, v_server_size / 100) THEN
        RAISE EXCEPTION 'size_mismatch';
      END IF;
      v_size := v_server_size;  -- authoritative
    END IF;
  END IF;

  -- A one-time-paid (non-expired) gallery has its OWN storage pool (75 GB); its
  -- uploads must NOT be gated by the business plan's cap (e.g. free 2 GB).
  v_gallery_pool := COALESCE(v_one_time_paid,false)
                    AND (v_expires IS NULL OR v_expires > now())
                    AND v_gallery_limit IS NOT NULL;

  IF v_gallery_pool THEN
    -- Atomic gallery-storage cap.
    UPDATE galleries SET storage_used_bytes = storage_used_bytes + v_size
      WHERE id=p_gallery_id AND storage_used_bytes + v_size <= v_gallery_limit
      RETURNING storage_used_bytes INTO v_used;
    IF v_used IS NULL THEN RAISE EXCEPTION 'storage_limit_exceeded'; END IF;
  ELSE
    -- Business plan storage pool (fall back to the free 'starter' cap).
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
  END IF;

  IF v_section IS NULL THEN
    SELECT id INTO v_section FROM gallery_sections WHERE gallery_id=p_gallery_id ORDER BY sort_order NULLS LAST, id LIMIT 1;
  END IF;

  INSERT INTO images (gallery_id,filename,web_preview_path,thumbnail_path,original_path,
    original_uploaded,original_size_bytes,section_id,sort_order,is_top_pick,public_thumb_present,face_index_status,counted_gallery_storage)
  VALUES (p_gallery_id,p_filename,p_web_preview_path,p_thumbnail_path,p_original_path,
    p_original_path IS NOT NULL,p_original_size,v_section,COALESCE(p_sort_order,0),false,COALESCE(p_public_thumb_present,false),'pending',v_gallery_pool)
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
DECLARE
  v_biz UUID; v_claimed UUID; v_bal INTEGER; v_used INTEGER;
  v_one_time_paid BOOLEAN; v_expires TIMESTAMPTZ; v_gallery_allow INTEGER; v_active_entitlement BOOLEAN;
BEGIN
  SELECT business_id, one_time_paid, paid_expires_at, face_index_allowance
    INTO v_biz, v_one_time_paid, v_expires, v_gallery_allow
    FROM galleries WHERE id=p_gallery_id;
  IF v_biz IS NULL THEN RETURN 'gallery_not_found'; END IF;

  -- Claim the image (pending|skipped -> processing).
  UPDATE images SET face_index_status='processing'
    WHERE id=p_image_id AND gallery_id=p_gallery_id AND face_index_status IN ('pending','skipped_no_allowance')
    RETURNING id INTO v_claimed;
  IF v_claimed IS NULL THEN RETURN 'not_claimable'; END IF;

  -- 1) Gallery-specific entitlement FIRST (one-time-paid galleries, non-expired,
  --    with remaining gallery allowance). Atomic guard mirrors the balance>0
  --    guard: gallery_credit_used < face_index_allowance -> never overshoot the
  --    10,000 cap. This credit is NOT drawn from the business monthly balance.
  v_active_entitlement := COALESCE(v_one_time_paid, false)
                          AND (v_expires IS NULL OR v_expires > now())
                          AND COALESCE(v_gallery_allow,0) > 0;
  IF v_active_entitlement THEN
    UPDATE galleries SET gallery_credit_used = gallery_credit_used + 1
      WHERE id=p_gallery_id AND gallery_credit_used < face_index_allowance
      RETURNING gallery_credit_used INTO v_used;
    IF v_used IS NOT NULL THEN
      UPDATE images SET face_index_credit_source='gallery' WHERE id=p_image_id;
      INSERT INTO token_ledger(business_id,delta,reason,ref_id,metadata)
        VALUES (v_biz,0,'face_index',p_image_id, jsonb_build_object('gallery_id',p_gallery_id,'source','gallery'));
      RETURN 'reserved';
    END IF;
  END IF;

  -- 2) Fall back to the business monthly balance (balance>0 guard = never negative).
  UPDATE business_tokens SET balance=balance-1, lifetime_consumed=lifetime_consumed+1, updated_at=now()
    WHERE business_id=v_biz AND balance>0 RETURNING balance INTO v_bal;
  IF v_bal IS NULL THEN
    UPDATE images SET face_index_status='skipped_no_allowance', face_index_credit_source=NULL WHERE id=p_image_id;
    RETURN 'no_allowance';
  END IF;
  UPDATE images SET face_index_credit_source='business' WHERE id=p_image_id;
  INSERT INTO token_ledger(business_id,delta,reason,ref_id,metadata)
    VALUES (v_biz,-1,'face_index',p_image_id, jsonb_build_object('gallery_id',p_gallery_id,'source','business'));
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
DECLARE v_gallery UUID; v_biz UUID; v_source TEXT;
BEGIN
  -- ATOMIC claim + transition. The guarded UPDATE flips the row out of
  -- 'processing' and returns the credit source that was on it. Row-locking +
  -- the WHERE face_index_status='processing' guarantee that of N concurrent
  -- callers exactly ONE gets a row back; the others get 0 rows -> false, no
  -- refund. finalize racing with fail: whichever flips 'processing' first wins;
  -- the loser sees status<>'processing' and no-ops. We deliberately do NOT clear
  -- face_index_credit_source in this UPDATE so RETURNING yields the pre-existing
  -- source; it is cleared in a follow-up UPDATE once the row is no longer claimable.
  UPDATE images
     SET face_index_status = CASE WHEN p_terminal THEN 'failed' ELSE 'pending' END,
         face_index_attempts = CASE WHEN p_terminal THEN COALESCE(face_index_attempts,0)
                                    ELSE COALESCE(face_index_attempts,0) + 1 END,
         face_index_error = left(p_error,500)
   WHERE id = p_image_id AND face_index_status = 'processing'
   RETURNING gallery_id, face_index_credit_source INTO v_gallery, v_source;
  IF v_gallery IS NULL THEN RETURN false; END IF;  -- lost the race / not processing

  SELECT business_id INTO v_biz FROM galleries WHERE id=v_gallery;

  -- Refund to the EXACT pool the credit came from. An unknown / NULL source
  -- must never mint or refund a balance (defensive: a processing row should
  -- always carry a source, but we never fabricate one).
  IF v_source = 'gallery' THEN
    UPDATE galleries SET gallery_credit_used = GREATEST(0, gallery_credit_used - 1) WHERE id=v_gallery;
    INSERT INTO token_ledger(business_id,delta,reason,ref_id,metadata)
      VALUES (v_biz,0,'face_index_refund',p_image_id, jsonb_build_object('gallery_id',v_gallery,'source','gallery','error',left(p_error,200)));
  ELSIF v_source = 'business' THEN
    UPDATE business_tokens SET balance=balance+1, lifetime_consumed=GREATEST(0,lifetime_consumed-1), updated_at=now()
      WHERE business_id=v_biz;
    INSERT INTO token_ledger(business_id,delta,reason,ref_id,metadata)
      VALUES (v_biz,1,'face_index_refund',p_image_id, jsonb_build_object('gallery_id',v_gallery,'source','business','error',left(p_error,200)));
  ELSE
    -- unknown/NULL source: transition already happened, but no balance is touched.
    INSERT INTO token_ledger(business_id,delta,reason,ref_id,metadata)
      VALUES (v_biz,0,'face_index_refund',p_image_id, jsonb_build_object('gallery_id',v_gallery,'source','unknown','note','no refund: unknown source','error',left(p_error,200)));
  END IF;

  -- Clear the source now that the row is out of 'processing' (safe: no other
  -- caller can claim it). A 'pending' retry re-decides its pool on next reserve.
  UPDATE images SET face_index_credit_source=NULL WHERE id=p_image_id;
  RETURN true;
END $function$;

-- Pre-flight summary for the UI: how much work, how much allowance, how many
-- will process now (min(remaining, allowance)).
CREATE OR REPLACE FUNCTION public.get_gallery_index_summary(p_gallery_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_biz UUID; v_owner UUID; v_bal INTEGER; r RECORD;
  v_one_time_paid BOOLEAN; v_expires TIMESTAMPTZ; v_gallery_allow INTEGER; v_gallery_used INTEGER;
  v_active BOOLEAN; v_gallery_remaining INTEGER; v_effective INTEGER;
BEGIN
  SELECT g.business_id, b.user_id, g.one_time_paid, g.paid_expires_at, g.face_index_allowance, g.gallery_credit_used
    INTO v_biz, v_owner, v_one_time_paid, v_expires, v_gallery_allow, v_gallery_used
    FROM galleries g JOIN businesses b ON b.id=g.business_id WHERE g.id=p_gallery_id;
  IF v_biz IS NULL THEN RETURN NULL; END IF;

  -- Authorization. EXECUTE is granted only to authenticated + service_role
  -- (anon + PUBLIC revoked). An AUTHENTICATED caller (auth.uid() present) must
  -- own the gallery's business, else return NULL — never leak another business's
  -- balance / allowance / payment status. A service_role server caller (the
  -- rekognition function) has no auth.uid() and is trusted (it already checked
  -- ownership before invoking); it passes.
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_owner THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(balance,0) INTO v_bal FROM business_tokens WHERE business_id=v_biz;
  SELECT count(*) AS total,
         count(*) FILTER (WHERE face_index_status='indexed') AS indexed,
         count(*) FILTER (WHERE face_index_status IN ('pending','skipped_no_allowance')) AS remaining,
         count(*) FILTER (WHERE face_index_status='processing') AS processing,
         count(*) FILTER (WHERE face_index_status='failed') AS failed
    INTO r FROM images WHERE gallery_id=p_gallery_id;

  v_active := COALESCE(v_one_time_paid,false) AND (v_expires IS NULL OR v_expires > now()) AND COALESCE(v_gallery_allow,0) > 0;
  v_gallery_remaining := CASE WHEN v_active THEN GREATEST(COALESCE(v_gallery_allow,0) - COALESCE(v_gallery_used,0), 0) ELSE 0 END;
  -- Effective allowance = gallery entitlement (consumed first) + business monthly.
  v_effective := v_gallery_remaining + COALESCE(v_bal,0);

  RETURN json_build_object(
    'total', r.total, 'indexed', r.indexed, 'remaining', r.remaining,
    'processing', r.processing, 'failed', r.failed,
    'allowance', v_effective,                              -- total available (gallery + business)
    'will_process_now', LEAST(r.remaining, v_effective),
    'gallery_allowance', COALESCE(v_gallery_allow,0),      -- one-time entitlement size (e.g. 10000)
    'gallery_used', COALESCE(v_gallery_used,0),
    'gallery_remaining', v_gallery_remaining,
    'business_allowance', COALESCE(v_bal,0),
    'is_one_time_paid', v_active,
    'paid_expires_at', v_expires);
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

-- ─── 8. One-time gallery entitlement grant / revoke ─────────────────────────
-- The $150 one-time purchase grants ONE gallery: 10,000 face-recognition photos
-- + 75 GB storage, 12 months. mark_gallery_paid is called by the LemonSqueezy
-- webhook with a stable per-order ref_id and is idempotent per order (the
-- ref-check returns before the UPDATE), so webhook retries never grant twice;
-- GREATEST() is a second belt so a re-grant can't stack the allowance.
-- Entitlement constants are fixed by product definition (10,000 / 75 GB).
CREATE OR REPLACE FUNCTION mark_gallery_paid(
  p_business_id UUID, p_gallery_id UUID, p_ref_id UUID DEFAULT NULL,
  p_months INTEGER DEFAULT 12, p_metadata JSONB DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID; v_existing_ref UUID; v_biz_bytes BIGINT;
BEGIN
  SELECT business_id, one_time_order_ref INTO v_owner, v_existing_ref FROM galleries WHERE id = p_gallery_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'gallery_not_found'; END IF;
  IF v_owner <> p_business_id THEN RAISE EXCEPTION 'gallery_business_mismatch'; END IF;
  -- Idempotent per ORDER: a webhook retry carrying the SAME order id (=> same
  -- ref) does not grant again.
  IF p_ref_id IS NOT NULL AND v_existing_ref = p_ref_id THEN RETURN false; END IF;

  -- A DISTINCT paid order (or the first ever) grants one entitlement unit so the
  -- customer always receives what they paid for (never "silently charged without
  -- grant"). Two distinct $150 orders for the same gallery therefore STACK to
  -- 20,000 photos and EXTEND expiry; the latest order id becomes the controlling
  -- ref, so only its refund can revoke (see revoke_gallery_paid). Note: a refund
  -- of a *superseded* order does not reduce the stacked allowance — precise
  -- partial-refund accounting is a documented follow-up, intentionally traded off
  -- against never letting an old refund nuke a newer entitlement.
  UPDATE galleries
     SET one_time_paid        = true,
         one_time_paid_at     = now(),
         paid_expires_at      = GREATEST(COALESCE(paid_expires_at, now()), now()) + make_interval(months => GREATEST(p_months, 1)),
         one_time_order_ref   = COALESCE(p_ref_id, one_time_order_ref),
         face_index_allowance = COALESCE(face_index_allowance,0) + 10000,               -- grant the purchased photos
         storage_limit_bytes  = GREATEST(COALESCE(storage_limit_bytes,0), 80530636800)  -- 75 GB
   WHERE id = p_gallery_id;

  -- Item 21: transfer ALREADY-uploaded image bytes from the business pool into
  -- this gallery's own pool, atomically. Only images not already gallery-counted.
  SELECT COALESCE(SUM(COALESCE(original_size_bytes,0)),0) INTO v_biz_bytes
    FROM images WHERE gallery_id = p_gallery_id AND NOT COALESCE(counted_gallery_storage,false);
  IF v_biz_bytes > 0 THEN
    INSERT INTO business_storage(business_id,used_bytes) VALUES (v_owner,0) ON CONFLICT DO NOTHING;
    UPDATE business_storage SET used_bytes = GREATEST(0, used_bytes - v_biz_bytes), updated_at = now() WHERE business_id = v_owner;
    UPDATE galleries SET storage_used_bytes = COALESCE(storage_used_bytes,0) + v_biz_bytes WHERE id = p_gallery_id;
    UPDATE images SET counted_gallery_storage = true WHERE gallery_id = p_gallery_id AND NOT COALESCE(counted_gallery_storage,false);
  END IF;
  RETURN true;
END $$;

-- Revoke on refund / payment reversal (LemonSqueezy order_refunded). Disables
-- the entitlement (allowance -> 0, marks expired, re-gates the paywall). Already
-- indexed photos and the business balance are untouched; gallery_credit_used is
-- kept as a historical record.
CREATE OR REPLACE FUNCTION revoke_gallery_paid(
  p_business_id UUID, p_gallery_id UUID, p_ref_id UUID DEFAULT NULL, p_metadata JSONB DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID; v_paid BOOLEAN; v_ref UUID;
BEGIN
  SELECT business_id, one_time_paid, one_time_order_ref INTO v_owner, v_paid, v_ref FROM galleries WHERE id = p_gallery_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'gallery_not_found'; END IF;
  IF v_owner <> p_business_id THEN RAISE EXCEPTION 'gallery_business_mismatch'; END IF;
  IF NOT COALESCE(v_paid, false) THEN RETURN false; END IF;  -- idempotent: already unpaid
  -- Items 14+15: ONLY the order that currently holds the entitlement may revoke
  -- it. A refund/chargeback from an older or unrelated order (ref mismatch, or a
  -- NULL ref) must NOT revoke a newer/active entitlement.
  IF p_ref_id IS NULL OR v_ref IS DISTINCT FROM p_ref_id THEN RETURN false; END IF;

  UPDATE galleries
     SET one_time_paid        = false,
         face_index_allowance = 0,
         paid_expires_at      = now()
   WHERE id = p_gallery_id;
  RETURN true;
END $$;

-- ─── 9. Plan price metadata hygiene (display-only; NOT the source of truth) ──
-- The charged price is ALWAYS the LemonSqueezy variant (env-keyed). These DB
-- columns are read nowhere in app code (only seeded by migrations 015/075) but
-- were left at the stale $19/$39/$94; align them with the current public
-- monthly USD prices so they can't mislead. Annual is NOT offered (no annual
-- LemonSqueezy variants configured) -> 0.  Solo=pro, Pro=business, Studio=agency.
UPDATE plans SET price_monthly_cents = 3900,  price_annual_cents = 0 WHERE id = 'pro';       -- Solo  $39
UPDATE plans SET price_monthly_cents = 7500,  price_annual_cents = 0 WHERE id = 'business';   -- Pro   $75
UPDATE plans SET price_monthly_cents = 12000, price_annual_cents = 0 WHERE id = 'agency';     -- Studio $120
COMMENT ON COLUMN plans.price_monthly_cents IS
  'Display metadata only. Charged price = LemonSqueezy variant (env LEMONSQUEEZY_VARIANT_*). Current public monthly USD: Solo(pro)=$39, Pro(business)=$75, Studio(agency)=$120.';
COMMENT ON COLUMN plans.price_annual_cents IS
  'Annual billing is NOT offered (no annual LemonSqueezy variants configured). 0 = not available; do not surface as a price.';

-- ─── 10. RPC authorization (least privilege) ────────────────────────────────
-- Every SECURITY DEFINER function above defaults to EXECUTE-by-PUBLIC on CREATE.
-- Lock them to exactly who may call them so a browser client can never invoke a
-- service-only function directly through PostgREST.

-- Service-only: only the trusted server (service_role) may call. Revoke PUBLIC +
-- anon + authenticated explicitly.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'reserve_face_index_credit(uuid, uuid)',
    'finalize_face_index(uuid, integer)',
    'fail_face_index(uuid, text, boolean)',
    'restore_upload_consumed_credits()',
    'mark_gallery_paid(uuid, uuid, uuid, integer, jsonb)',
    'revoke_gallery_paid(uuid, uuid, uuid, jsonb)',
    'check_gallery_face_index_complete()',
    'trg_image_storage_dec()',
    'trg_gallery_storage_dec_before()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;

-- record_image_upload: authenticated users only (owner-checked via auth.uid()),
-- plus service_role for server flows. Never anon/PUBLIC.
REVOKE EXECUTE ON FUNCTION public.record_image_upload(uuid,text,text,text,text,bigint,uuid,integer,boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_image_upload(uuid,text,text,text,text,bigint,uuid,integer,boolean) TO authenticated, service_role;

-- get_gallery_index_summary: authenticated dashboard (owner-checked inside) +
-- service_role (rekognition). Never anon/PUBLIC.
REVOKE EXECUTE ON FUNCTION public.get_gallery_index_summary(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gallery_index_summary(uuid) TO authenticated, service_role;

-- Pre-existing service-only maintenance functions (from earlier migrations):
-- lock down too, if present in this database.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'recompute_face_indexed_count(uuid)',
    'increment_face_indexed_count(uuid)',
    'try_claim_face_indexing(uuid, integer)'
  ] LOOP
    IF to_regprocedure('public.'||fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

COMMIT;
