# Face-recognition billing model — QA evidence & design

**Date:** 2026-07-18
**Migration:** `supabase/migrations/083_face_index_billing_model.sql` (+ `_rollback.sql`)
**Validated on:** Supabase preview branch `tmresrsyypzethfofaxn` (production left untouched)

---

## What changed

Uploads become **free and unlimited**, bounded only by the plan's storage
allowance. A face-recognition credit is consumed only when an image is actually
**indexed** — one credit per indexed photo. Plan numbers are unchanged and now
mean "face-recognition photos per month" (Solo 2,000 / Pro 10,000 / Studio
30,000). Customer-facing copy drops the word "tokens" in favour of "תמונות עם
זיהוי פנים" / "תמונות שנותרו" / "שדרג מסלול".

### Per-image state machine (`images.face_index_status`)

```
pending ──reserve──▶ processing ──finalize──▶ indexed
                          │
                          ├──fail(terminal)──▶ failed
                          └──fail(retry)─────▶ pending
   (no allowance at reserve time) ─────────▶ skipped_no_allowance ──(top-up)──▶ processing
```

**INVARIANT:** an image in `processing` holds exactly one reserved credit. This
is what makes crash recovery safe and double-charging impossible.

### Credit lifecycle RPCs

- `reserve_face_index_credit(gallery, image)` — atomically claims a
  pending/skipped image (`→ processing`) and deducts one credit under a
  `balance > 0` guard. Returns `reserved | no_allowance | not_claimable |
  gallery_not_found`. The guard is why parallel workers **never overshoot or go
  negative**; on no allowance the image parks as `skipped_no_allowance`.
- `finalize_face_index(image, faceCount)` — `processing → indexed`, **keeps** the
  credit. Idempotent on status, so a duplicate/late call after a crash-window
  retry is a no-op → no double-count. A successful index with **0 faces still
  keeps the credit** (the paid service was used).
- `fail_face_index(image, error, terminal)` — `processing → failed | pending`,
  **refunds** the credit with a `face_index_refund` ledger row. Only acts on rows
  still `processing`, so it can never clobber a finalize that already landed.

### Storage cap (atomic)

`record_image_upload` no longer deducts a token. It increments a
`business_storage.used_bytes` counter under a guarded UPDATE
(`used_bytes + size <= limit`), so concurrent uploads can never collectively
exceed the plan cap. A delete trigger decrements the counter.

---

## Test evidence (all on the preview branch)

### Credit lifecycle — 11/11 PASS

| Assertion | Result |
|---|---|
| reserve charges exactly 1 | PASS (`bal 10→9`) |
| finalize keeps the charge + increments count | PASS |
| no double-charge on retry (finalize idempotent, re-reserve `not_claimable`) | PASS |
| AWS success with **0 faces still charged** | PASS (`bal 9→8`) |
| failed AWS **refunds**, no charge, status=failed | PASS |
| transient fail → refund + back to pending | PASS |
| **crash window** (AWS ok, DB retry) = exactly one charge | PASS |
| partial processing **never goes negative** (5 imgs / 2 allowance → 2 processing + 3 skipped) | PASS |
| resume charges **only remaining**, never re-charges indexed | PASS (isolated: bal 0, indexed 5, **face_charges 5, refunds 0**) |
| summary `will_process_now = min(remaining, allowance)` | PASS |
| restoration caps at plan allowance | PASS |

### Storage cap — 4/4 PASS

| Assertion | Result |
|---|---|
| upload is **free** (no credit change) | PASS (`5→5`) |
| storage tracked accurately | PASS (`used=800`) |
| **cap enforced atomically** (rejects with `storage_limit_exceeded`, counter unchanged) | PASS |
| delete decrements storage | PASS (`800→400`) |

### Gallery completion trigger — 4/4 PASS

Trigger fires on every terminal `face_index_status` transition (not just
`face_indexed_at`, which failed/skipped rows never set):

| Scenario | Gallery status |
|---|---|
| some skipped_no_allowance remain | **partial** ✓ |
| top up allowance → all indexed | **done** ✓ |
| indexed + failed (bad file), none skipped | **done** ✓ |
| all failed, nothing indexable | **failed** ✓ |

---

## One-time gallery entitlement ($150 SKU)

A $150 one-time purchase grants **one specific gallery**: up to **10,000
face-recognition photos**, **75 GB storage**, valid **12 months**. Gallery-specific
and non-transferable.

- **Grant** — `mark_gallery_paid` (LemonSqueezy `order_created`,
  `custom_data.purpose='gallery_unlock'`) sets `face_index_allowance=10000`,
  `storage_limit_bytes=75 GB`, `paid_expires_at=now()+12mo`. Idempotent per order
  (stable `ref_id`), and `GREATEST()` prevents a re-grant from stacking.
- **Consume gallery-first** — `reserve_face_index_credit` draws from the gallery
  entitlement (atomic `gallery_credit_used < face_index_allowance` guard) BEFORE
  the business monthly balance. `images.face_index_credit_source` records the pool
  so `fail_face_index` refunds the right one. Same atomic / refund / retry /
  crash-recovery / no-double-charge guarantees as the business pool.
- **Cap at 10,000** — when the gallery entitlement is exhausted and the business
  has no monthly balance, remaining photos are `skipped_no_allowance` (gallery
  stays accessible, progress is exact, the UI offers a subscription upgrade). A
  subscriber's monthly balance transparently continues past the gallery cap.
- **Storage** — uploads to a paid gallery count against the gallery's 75 GB pool
  (`galleries.storage_used_bytes`, atomic), NOT the business plan cap, so a
  free-plan photographer is not blocked by the 2 GB business limit.
  `images.counted_gallery_storage` routes the delete-decrement to the right pool.
- **Refund/reversal** — `revoke_gallery_paid` (LemonSqueezy `order_refunded`)
  disables the entitlement (allowance→0, re-gates the paywall); indexed photos and
  the business balance are untouched. Idempotent.
- **Copy** — the one-time card now reads "גלריה אחת, עד 10,000 תמונות עם זיהוי
  פנים והורדות, עד 75GB אחסון, לשנה" (no more "full/unlimited" claim).

### One-time gallery tests — 10/10 PASS

| Assertion | Result |
|---|---|
| one-time payment grants 10,000 + 75 GB + 12 months | PASS |
| webhook retry (same ref) does not grant twice | PASS |
| face indexing works when business monthly balance is 0 (gallery pool) | PASS |
| entitlement is gallery-specific — another gallery cannot use it | PASS |
| subscriber: gallery pool consumed BEFORE business balance | PASS |
| partial after the gallery cap (2 processed + 3 skipped, no overshoot) | PASS |
| expired entitlement is inactive | PASS |
| refund/reversal revokes the entitlement | PASS |
| gallery 75 GB storage pool is atomic AND independent of business 2 GB cap | PASS |
| (business-storage cap + delete-decrement, re-confirmed) | PASS |

Full run on a prod-schema fixture: **20/20** (10 core credit/storage + 10
one-time gallery). Two business-storage assertions initially reported FAIL due to
a staging-only fixture quirk (`ON CONFLICT DO NOTHING` skipped the subscription
row on staging's real table); re-run with the subscription forced in → PASS.

---

## Plan price metadata (stale $19/$39/$94 → corrected)

`plans.price_monthly_cents` / `price_annual_cents` are **read nowhere** in app
code (only seeded by migrations 015/075); the charged price is always the
LemonSqueezy variant (env `LEMONSQUEEZY_VARIANT_*`). They were left at the stale
$19/$39/$94. Migration 083 aligns them with the current public monthly USD
prices — **Solo(pro)=$39, Pro(business)=$75, Studio(agency)=$120** — and sets
`price_annual_cents=0` (annual is **not** offered — no annual LemonSqueezy
variants are configured). `COMMENT ON COLUMN` documents both as display-only.
LemonSqueezy variants remain the single source of truth for actual charges.

---

## Crash-window / idempotency handling (edge function)

`supabase/functions/rekognition/index.ts`:

1. **Reserve → AWS IndexFaces → finalize.** On any failure, `fail_face_index`
   refunds. A failed AWS call therefore never permanently consumes allowance.
2. **Crash window** (AWS succeeded, DB writes didn't): on retry we
   `purgeExistingFaces()` — a **paginated ListFaces sweep** (MaxResults 1000 +
   NextToken) filtered by `ExternalImageId`, then DeleteFaces in ≤1000-id
   batches — before re-indexing. This is the only reliable way to remove AWS
   faces the DB has no record of, so a re-index can't double the faces.
3. **Stale `processing` recovery**: `recoverStuckProcessing()` runs first, under
   the per-gallery lock (which only grants once a prior worker's lock is stale),
   so any `processing` row is a guaranteed orphan. It **reuses** the reserved
   credit (no re-charge) — purge, re-index, finalize.
4. **Deterministic order**: work is processed by `sort_order`. When allowance is
   ample, reserve+index run concurrently (order-irrelevant); when constrained,
   the earliest `allowance` images are reserved strictly in order and the rest
   marked `skipped_no_allowance`.

---

## Existing-balance restoration (impact preview — NOT applied)

Old model charged 1 token per uploaded image. `restore_upload_consumed_credits()`
restores that consumption (capped at the plan allowance) so no customer loses
allowance. **Read-only production preview (nothing written):**

| Business | Balance | Cap | Consumed by uploads | Would restore |
|---|---|---|---|---|
| eclipse media | 31 | 100 | 69 | **+69 → 100** |
| Or Doga | 95 | 100 | 5 | **+5 → 100** |
| (3 others) | 100 | 100 | 0 | 0 |

**Total: 74 credits across 2 pre-launch accounts.** The function is defined in
the migration but **not executed**; run `SELECT * FROM
restore_upload_consumed_credits();` manually after the migration is applied and
reviewed.

---

## Deploy order (after review & merge — nothing auto-applied)

1. Apply migration `083` to production (adds columns/tables/RPCs/trigger +
   gallery entitlement + price-metadata fix; free, storage-capped uploads and
   the one-time gallery entitlement take effect). NOTE: create + apply the
   reserved `082` security migration FIRST.
2. Deploy the `rekognition` edge function AND the `lemonsqueezy-webhook` edge
   function (the webhook now grants/revokes the gallery entitlement + handles
   `order_refunded`).
3. Redeploy the web app (copy relabels + preflight + one-time-gallery copy are
   build-time).
4. Run `restore_upload_consumed_credits()` once and verify the 74-credit impact.

Rollback: `083_face_index_billing_model_rollback.sql` (non-destructive by
default; restores per-upload token deduction and the prior completion trigger).
