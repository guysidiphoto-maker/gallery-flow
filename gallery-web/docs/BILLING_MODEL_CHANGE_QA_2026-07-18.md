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

---

## Code-review hardening (2026-07-19)

A direct code review flagged release-blocking issues; all fixed on the branches.

### P0
- **RPC authorization** — migration 083 adds a least-privilege block: `REVOKE
  EXECUTE ... FROM PUBLIC, anon, authenticated` on every service-only SECURITY
  DEFINER function (`reserve_face_index_credit`, `finalize_face_index`,
  `fail_face_index`, `restore_upload_consumed_credits`, `mark_gallery_paid`,
  `revoke_gallery_paid`, trigger fns, + pre-existing maintenance fns guarded by
  `to_regprocedure`), `GRANT ... TO service_role`. `record_image_upload` =
  authenticated + service_role (keeps its `auth.uid()` owner check).
  `get_gallery_index_summary` = authenticated + service_role and now verifies
  `auth.uid()` owns the gallery's business (service_role, the only uid-null caller
  once anon is revoked, is trusted) — never leaks another business's balance /
  allowance / payment status.
- **Atomic refund** — `fail_face_index` claims + transitions in ONE guarded
  `UPDATE ... WHERE face_index_status='processing' RETURNING gallery_id,
  face_index_credit_source`. Only the caller that transitions refunds; a NULL /
  unknown source refunds nothing (no minting).
- **Rekognition error handling** — every Supabase call is error-checked
  (image_faces delete/insert, reserve/finalize/fail, summary, gallery updates).
  An image is reported `indexed` only if AWS + image_faces persist + finalize all
  succeed; a post-AWS persistence failure raises `PersistenceError` → the image
  stays `processing` (recoverable), never refunded, never marked indexed. The
  summary now returns a `processing` count and the worker refuses to flip a
  gallery `done` while any remain. `runBounded` removes settled promises in
  `finally()` and captures rejections (a bad worker can't wedge the batch).
- **Order identity** — `revoke_gallery_paid` revokes only when `p_ref_id` matches
  the gallery's active `one_time_order_ref` (an older/unrelated refund is a
  no-op). `mark_gallery_paid` grants +10,000 per DISTINCT paid order (idempotent
  per order), so a second $150 purchase is never silently uncredited; the latest
  order controls revocation.

### P1
- **Storage size** — `record_image_upload` derives the authoritative size from
  `storage.objects.metadata->>'size'` (the browser uploads the original before
  calling the RPC), rejecting `original_object_missing` / `size_mismatch` instead
  of trusting the client. A BEFORE-DELETE trigger on `galleries` decrements the
  business counter for cascaded image deletes (the per-image trigger can't look
  up the gallery once it's gone). Existing active paid galleries are backfilled
  into the gallery pool; `mark_gallery_paid` transfers already-uploaded bytes
  business→gallery atomically on purchase.
- **Deterministic order** — stable `(sort_order, id)` tie-breaker everywhere
  indexing work is selected (images has no `created_at`; `id` is the stable key).
- **Copy** — removed false "unlimited uploads" wording (uploads are storage-
  capped): "העלאות ללא חיוב לפי תמונה, בכפוף למגבלת האחסון במסלול" /
  "המכסה החודשית חלה רק על תמונות שעוברות זיהוי פנים". One-time-gallery pre-flight
  now shows gallery-remaining, monthly-remaining, whether monthly will also be
  consumed, and total processing now. No customer-facing "tokens/טוקנים" remains.

### Test evidence — 30/30 new + hardened assertions (staging, BEGIN/ROLLBACK)
| Group | Result |
|---|---|
| Authorization: privileges (reserve/mark/record/summary), anon RPC denied, cross-business NULL, owner/service OK | 8/8 PASS |
| Atomic refund: two fails → one transition + one refund; finalize-vs-fail; NULL source no-mint | PASS |
| Order identity: retry no-double-grant; 2nd distinct order +10000; late refund of superseded order no-op; active-order refund revokes; duplicate refund no-op | PASS |
| Server-authoritative size: mismatch rejected, missing object rejected, server size used | PASS |
| Gallery-delete cascade decrements business storage | PASS |
| Reconciliation: `business_storage == SUM(non-gallery image sizes)` | PASS |
| Core credit + gallery entitlement re-run against hardened fns (atomic fail, size-checked upload, completion trigger) | 9/9 PASS |

The repo test `supabase/tests/083_face_index_billing_model_test.sql` now has 6
blocks (credit lifecycle · gallery entitlement · authorization · atomic refund ·
order identity · server-storage/deletion/reconciliation).

**Edge-function failure-injection (item 13)** — the DB-observable cases are
covered above (finalize-vs-fail, fail-RPC idempotency). The purely TS paths
(AWS-success-then-insert-failure → stay processing; summary-RPC-failure → don't
flip done; worker rejection → runBounded catch) are covered by the error-checked
code structure; a Deno integration harness to exercise them is a follow-up.

### Storage reconciliation queries (item 22 — run post-deploy)
```sql
-- Business pool must equal the sum of business-counted (non-gallery) image bytes.
SELECT bs.business_id, bs.used_bytes AS counter,
       COALESCE(s.bytes,0) AS actual, bs.used_bytes - COALESCE(s.bytes,0) AS drift
FROM business_storage bs
LEFT JOIN (
  SELECT g.business_id, SUM(COALESCE(i.original_size_bytes,0)) bytes
  FROM images i JOIN galleries g ON g.id=i.gallery_id
  WHERE NOT COALESCE(i.counted_gallery_storage,false)
  GROUP BY g.business_id
) s ON s.business_id = bs.business_id
WHERE bs.used_bytes <> COALESCE(s.bytes,0);   -- expect 0 rows

-- Each paid gallery's pool must equal the sum of its gallery-counted image bytes.
SELECT g.id, g.storage_used_bytes AS counter,
       COALESCE(SUM(COALESCE(i.original_size_bytes,0)),0) AS actual
FROM galleries g LEFT JOIN images i
  ON i.gallery_id=g.id AND COALESCE(i.counted_gallery_storage,false)
GROUP BY g.id, g.storage_used_bytes
HAVING g.storage_used_bytes <> COALESCE(SUM(COALESCE(i.original_size_bytes,0)),0);  -- expect 0 rows
```

### Note — out of scope
`gallery-web/src/pages/LandingPage.tsx` still shows stale marketing (old prices
$19/$39, wrong photo counts, and an "אחסון ללא הגבלה" / unlimited-storage claim).
That whole block predates pricing-v2 and is unrelated marketing (the original
change scope excludes marketing pages); flagged here for a separate cleanup.

---

## Code-review hardening — round 2 (2026-07-20)

### Fixes
1. **Authoritative size persisted.** `record_image_upload` now writes the
   server-derived `v_size` (not `p_original_size`) into `original_size_bytes`,
   so delete-accounting + reconciliation use the trusted value. A present object
   whose `metadata->>'size'` is missing is **rejected** (`original_object_size_missing`)
   — never a silent client fallback.
2. **Object ownership + path binding.** The path must be
   `<business_slug>/<gallery_id>/originals/<file>` and bind to the requested
   gallery + business (`storage.foldername[2]=gallery_id`, `[1]=slug`,
   `[3]='originals'`), else `invalid_object_path`. Prevents attaching another
   gallery's/business's object. The storage RLS `gallery_storage_owner_write`
   also enforces `foldername[2]=owned gallery` at write time.
3. **Orphaned uploads.** `uploadPipeline` deletes the just-uploaded original if
   `record_image_upload` fails (storage cap / size mismatch / invalid path /
   auth), so a rejected upload leaves no billable bytes; cleanup failures →
   Sentry (`orphan_upload_cleanup_failed`, path + messages only). Stale
   "token consumed" comments removed. **Bucket audit + abuse limitation below.**
4. **Order-specific entitlement ledger.** New `gallery_entitlements` table (one
   row per LemonSqueezy `order_ref`; `granted_allowance`, `granted_storage_bytes`,
   `purchased_at`, `expires_at`, `status ∈ {active,refunded,reversed}`,
   `refunded_at`, `metadata`; UNIQUE(order_ref); RLS-denied to clients). Active
   gallery allowance / storage / expiry are computed **LIVE** from active,
   non-expired, non-refunded rows; the `galleries.*` columns are a cache. This
   makes multi-order, per-order refund, and per-order expiration correct.
5. **Copy.** Face-rec toggle desc → "האינדוקס משתמש במכסת תמונות זיהוי הפנים שלך"
   (no "tokens"). Repo-wide sweep: no customer-facing token/tokens/טוקן remains.
6. **LandingPage (`/en`).** Updated to Solo $39 / Pro $75 / Studio $120 with
   2,000 / 10,000 / 30,000 face-rec photos and 75 GB / 400 GB / 1.5 TB; removed
   the "unlimited storage" claim and the (non-offered) annual discount; FAQ free
   tier corrected to 100 face-rec photos/mo + no per-photo charge.

### ⚠️ Storage-cap abuse limitation + two-phase proposal (item 3)
**The storage cap is NOT abuse-proof against a malicious authenticated client.**
Bucket `gallery-images` is public-read, 100 MB/file, `image/*`. The write policy
`gallery_storage_owner_write` (ALL, authenticated) lets an owner upload objects
to `foldername[2]=<their gallery>` **directly**, bypassing `record_image_upload`.
Such objects are not counted in `business_storage`, so a malicious owner can
exceed their plan storage (bounded only by 100 MB × `image/*` on their own
galleries). `record_image_upload`'s atomic cap only governs the honest client
path. **Do not claim the cap is abuse-proof.**

**Smallest safe two-phase design (proposed, not implemented):**
1. Tighten storage RLS so authenticated users **cannot** directly `INSERT` into
   `gallery-images` (remove the broad ALL write policy).
2. Add a `reserve-upload` edge function (service_role) that, per file: atomically
   reserves N bytes in `business_storage` (guarded `used+N<=limit`), then returns
   a short-lived **signed upload URL** scoped to the exact `slug/gallery/originals`
   path. Upload goes only through that URL.
3. `finalize` (record_image_upload) confirms the object + reconciles the reserved
   bytes with the real object size (release the diff / reject + delete on abuse).
This moves the quota gate BEFORE bytes land, so a client cannot write un-metered
objects. Effort: one edge function + an RLS change + a small reservation table
(or reuse `business_storage` with a pending column). Tracked as a follow-up.

### Orphan-reconciliation query (run periodically / post-deploy)
```sql
-- Storage objects under gallery-images/originals with NO matching images row
-- (client crash between upload and record, or a bypassed direct upload).
SELECT o.name, (o.metadata->>'size')::bigint AS bytes
FROM storage.objects o
LEFT JOIN images i ON i.original_path = o.name
WHERE o.bucket_id='gallery-images'
  AND (storage.foldername(o.name))[3]='originals'
  AND i.id IS NULL
ORDER BY bytes DESC NULLS LAST;   -- review, then remove() the confirmed orphans
```

### Round-2 test evidence (staging, BEGIN/ROLLBACK)
| Group | Result |
|---|---|
| item 1 — NULL client size→server persisted; small diff→server size; missing size-metadata rejected; delete subtracts exact server size; reconciliation zero | PASS (5/5) |
| item 2 — path binding rejects wrong gallery / wrong slug / 2-seg structure | PASS (3/3) |
| item 4 — order1→10000; order2 distinct→20000 (2 rows); retry idempotent; refund order1 removes only its 10000 (still paid); duplicate/older refund no-op; order2 expiry independent→0, remaining≥0; reserve→no_allowance when all inactive | PASS (7/7) |
| Blocks 1+2 re-run on the order-ledger design + valid paths + completion trigger | PASS (12/12) |

Repo test `supabase/tests/083_face_index_billing_model_test.sql` updated to 6
blocks against the new design. Frontend `tsc --noEmit` clean; `vite build` OK.

---

## Code-review round 3 (2026-07-20) — per-order consumption + storage scoping

### Section F — per-order entitlement consumption (implemented + validated)
`gallery_entitlements` now has a per-row `used` counter, and `images` carries
`face_index_entitlement_id`. `reserve_face_index_credit` allocates each gallery
credit to a **specific order** — the **earliest-expiring active order with
capacity** — via an atomic per-row guarded increment in a retry loop (no order
overspends; deterministic; concurrency-safe). `fail_face_index` refunds to the
**exact funding order** (decrements that order's `used`). `get_gallery_index_summary`
and the `gallery_active_allowance/remaining/used` helpers compute from the
order-specific source of truth; `galleries.gallery_credit_used` is now only a
derived cache. An in-flight reservation whose order expires before finalize keeps
its charge (no revoke, no double-charge). Business monthly is the fallback after
all gallery orders are exhausted.

**Section F test evidence — 10/10 (staging, BEGIN/ROLLBACK):**
| Assertion | Result |
|---|---|
| two active orders, remaining=5 | PASS |
| earliest-first allocation across the 10k/10k boundary (A=2, B=3) | PASS |
| each image tagged with its funding order | PASS |
| failure refunds the EXACT order (A→1, B untouched) | PASS |
| partial refill picks earliest order first | PASS |
| refund order A removes ONLY A (allowance 3, B's unused intact) | PASS |
| refund order B too → no active allowance | PASS |
| expiry during an in-flight AWS op → finalize keeps the charge (no revoke/double) | PASS |
| fallback to business monthly when gallery exhausted | PASS |
| remaining never negative after every transition | PASS |

Concurrency at an order boundary is enforced by the atomic per-row
`used < granted_allowance` guard + retry loop (the sequential tests exercise the
guard; two workers can't both push the same row past its grant). Repo test
`083_..._test.sql` gains Block 7 for these.

### Storage cutover — explicitly NOT in this PR
Per the scoped decision, this PR does **NOT**: make `gallery-images` private,
revoke direct-write RLS, migrate/delete any of the 12,267 originals, change live
reader URLs, touch the Electron desktop uploader, or deploy a partial upload-
reservation system. Those are the dedicated **blue-green migration 084** project:
see `gallery-web/docs/PRIVATE_STORAGE_V2_MIGRATION_PLAN.md`.

### P0 follow-up recorded (accurate wording)
`gallery-images` is **public and contains originals**; known/guessable direct
object URLs **bypass** gallery passwords, private face-rec, draft state, and
access expiration. Content-addressed paths reduce casual discovery but are **not
authorization**. Bucket **listing** permission must be confirmed separately. The
storage cap is **not abuse-proof**. Do not describe current storage as private or
abuse-proof. Full remediation plan + writer/reader inventory + compatibility
matrix in the v2 migration plan doc.
