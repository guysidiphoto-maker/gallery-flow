# Production Deployment Runbook — Migrations 082 + 083

**Owner of this document:** whoever executes the deploy fills in Section 11.
**Audience:** a senior engineer with repo + Supabase + Vercel + LemonSqueezy
access, executing WITHOUT any prior conversation context.

> ⚠️ **Every step that changes production is marked `‹PROD CHANGE›` and is
> preceded by a `☐ APPROVAL` checkpoint. Do not proceed past an approval
> checkpoint without an explicit human go.**
> This runbook never prints secret values. It does **not** switch LemonSqueezy
> to Live mode.

---

## 1. Scope and current status

Two independent branches, each adding exactly one migration. No file overlap.

| PR | Branch | Migration file(s) | Compare URL |
|----|--------|-------------------|-------------|
| **PR 1 (082)** | `security/p1-read-leak-cleanup` | `supabase/migrations/082_p1_read_leak_cleanup.sql` | https://github.com/guysidiphoto-maker/gallery-flow/pull/new/security/p1-read-leak-cleanup |
| **PR 2 (083)** | `feat/face-index-billing-model` | `supabase/migrations/083_face_index_billing_model.sql` (+ `_rollback.sql`, `supabase/tests/083_face_index_billing_model_test.sql`) | https://github.com/guysidiphoto-maker/gallery-flow/pull/new/feat/face-index-billing-model |

- **Production Supabase project ref:** `vlyiqfawkrjvqcmkpfvs`
- **Staging Supabase project ref:** `bkccdomovxtuqdxrahnc` (behind prod — no token economy; used only for `BEGIN/ROLLBACK` proofs)
- **Production is currently UNTOUCHED.** Neither migration applied; nothing merged or deployed.
- **LemonSqueezy is in Test mode.** This deployment does **NOT** activate Live payments. Going Live (verify identity → create Live variants → swap `LEMONSQUEEZY_VARIANT_*` + `LEMONSQUEEZY_API_KEY` to Live) is a **separate, out-of-scope** procedure.
- **Billing UI flag:** `VITE_FEATURE_GALLERY_BILLING` (Vercel build-time env; UI checks `=== 'true'`). Leave as-is for this deploy; it does not gate the DB/edge changes.

**Prod schema note:** the production `supabase_migrations.schema_migrations` table uses **timestamp version ids** (latest observed `20260629093343`), NOT `NNN_` filenames. The `082`/`083` numbers are repo filename ordering only. Apply via your normal mechanism (Supabase SQL editor, `supabase db push`, or the Supabase MCP `apply_migration`).

---

## 2. Required deployment order (authoritative)

Execute strictly in this order. Do not reorder.

1. Review **PR 082**.
2. Merge **PR 082** into `main`.  ‹PROD CHANGE - repo›
3. Apply **migration 082** to prod.  ‹PROD CHANGE - db›
4. Run **082 security smoke tests** (Section 4).
5. **Rebase PR 083 onto the updated `main`** (082 is now on main).
6. **Re-run the full 083 test suite** (`supabase/tests/083_face_index_billing_model_test.sql`) on a fresh/rolled-back environment.
7. Review and merge **PR 083**.  ‹PROD CHANGE - repo›
8. **Pause face-index processing** (Section 7) to avoid a mixed-version window.
9. Apply **migration 083** to prod.  ‹PROD CHANGE - db›
10. Deploy the **`rekognition`** edge function.  ‹PROD CHANGE - edge›
11. Deploy the **`lemonsqueezy-webhook`** edge function.  ‹PROD CHANGE - edge›
12. Redeploy the **web application** (Vercel).  ‹PROD CHANGE - web›
13. **Resume processing** (Section 7).
14. Run **billing + gallery smoke tests** (Sections 5 + 6).
15. Re-run the **read-only credit-restoration preview** (Section 8).
16. **Restore credits ONCE**, only if the preview is unchanged (Section 8).  ‹PROD CHANGE - db›
17. **Verify the restoration ledger** (Section 8).
18. **Monitor** production (Section 10).

Steps 9–12 must be executed as a tight block with processing paused (Section 7).

---

## 3. Pre-deployment checklist

Run and record BEFORE step 2. All read-only.

- ☐ `main` is clean; both PR diffs reviewed. Confirm **PR 082 touches only** `supabase/migrations/082_p1_read_leak_cleanup.sql`, and **PR 083 touches only** `083_*` migrations/test + `supabase/functions/rekognition/index.ts` + `supabase/functions/lemonsqueezy-webhook/index.ts` + `gallery-web/src/{pages/Dashboard.tsx,pages/StudioSettings.tsx,pages/PricingPage.tsx,components/landing3d/HomepagePricing.tsx,App.tsx,types.ts}` + docs. No unrelated migrations or frontend changes.
- ☐ Confirm 082 precedes 083 in the deploy order and 083 has been rebased after 082 merges.
- ☐ Capture current prod schema / objects (baseline for rollback):

```sql
-- Baseline: RLS policies + function defs the migrations touch (082)
SELECT polname, (SELECT relname FROM pg_class WHERE oid=polrelid) tbl
FROM pg_policy WHERE polname IN ('vendors_public_read','image_scores_public_read','image_scores_owner_read');
SELECT pg_get_functiondef(oid) FROM pg_proc
WHERE proname IN ('gallery_get_meta','current_business_id') AND pronamespace='public'::regnamespace;

-- Baseline: 083 objects should NOT yet exist
SELECT proname FROM pg_proc WHERE proname IN
 ('reserve_face_index_credit','finalize_face_index','fail_face_index','get_gallery_index_summary',
  'restore_upload_consumed_credits','revoke_gallery_paid') AND pronamespace='public'::regnamespace;
SELECT to_regclass('public.business_storage');  -- expect NULL pre-083
SELECT column_name FROM information_schema.columns WHERE table_name='images' AND column_name='face_index_status'; -- expect empty pre-083
```

- ☐ Capture financial baseline (for restoration + audit):

```sql
SELECT count(*) businesses, COALESCE(SUM(balance),0) total_balance FROM business_tokens;
SELECT reason, count(*), COALESCE(SUM(delta),0) FROM token_ledger GROUP BY reason ORDER BY reason;
```

- ☐ Capture plan allowances / storage / variant mapping (read-only):

```sql
SELECT id, name, token_count AS face_rec_allowance, storage_limit_bytes,
       price_monthly_cents, price_annual_cents
FROM plans ORDER BY sort_order NULLS LAST, id;
-- Expect after 083 (step 9): pro/Solo=2000, business/Pro=10000, agency/Studio=30000;
-- price_monthly_cents 3900/7500/12000, price_annual_cents 0.
```

- ☐ Confirm required Supabase edge secrets EXIST (names only — **never print values**): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `IP_HASH_SALT`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_VARIANT_PRO`, `LEMONSQUEEZY_VARIANT_BUSINESS`, `LEMONSQUEEZY_VARIANT_AGENCY`, `LEMONSQUEEZY_VARIANT_GALLERY`, `PUBLIC_SITE_URL`. Vercel: `VITE_FEATURE_GALLERY_BILLING`.
- ☐ Named **deployment owner** and **rollback owner** (can be the same person). Record in Section 11.
- ☐ Announce a low-traffic maintenance window for steps 8–13.

---

## 4. Migration 082 verification (run after step 3, before step 5)

All checks are read-only or rolled back. Run against prod ref `vlyiqfawkrjvqcmkpfvs`.

**4.1 Policy state changed as intended:**
```sql
SELECT polname FROM pg_policy WHERE polname IN
 ('vendors_public_read','image_scores_public_read','image_scores_owner_read');
-- Expect ONLY: image_scores_owner_read  (the two *_public_read are gone)
```

**4.2 Anonymous cannot read vendors / AI scores (rolled-back role probe):**
```sql
BEGIN; SET LOCAL ROLE anon;
SELECT count(*) FROM public.vendors;          -- expect: permission denied / 0 rows
SELECT count(*) FROM public.image_ai_scores;  -- expect: permission denied / 0 rows
ROLLBACK;
```

**4.3 Authenticated cannot read another business's AI scores:** as an authenticated
session for business A, `SELECT * FROM image_ai_scores` returns only rows whose
image→gallery→business = `current_business_id()`; scores of business B are not visible.

**4.4 Owners retain access to their own records:** business A's dashboard (FeedStudio)
still loads its own AI scores; business A still reads its own vendors.

**4.5 Draft-metadata leak closed / public preserved:**
- As anon: `SELECT gallery_get_meta('<a DRAFT gallery uuid>')` → **NULL**.
- As anon: `SELECT gallery_get_meta('<a PUBLISHED gallery uuid>')` → **metadata** (unchanged).
- As the owner (authenticated): `SELECT gallery_get_meta('<own DRAFT uuid>')` → **metadata** (preview preserved).

**4.6 No regressions:** public gallery viewer loads published galleries logged-out;
vendor + dashboard flows work; service-role workflows (edge functions using the
service role) are unaffected (they bypass RLS).

☐ **APPROVAL:** all of Section 4 pass → proceed to Section 2 step 5.

---

## 5. Migration 083 verification (run after step 12, processing resumed)

Prefer the packaged suite first, then targeted prod smoke checks.

**5.1 Packaged suite** — run `supabase/tests/083_face_index_billing_model_test.sql`
(self-contained; wraps in `BEGIN … ROLLBACK`). Expect **all PASS** (11 rows).

**5.2 Targeted behaviour (observe on a real low-risk gallery):**
- Uploading photos does **not** reduce `business_tokens.balance` (uploads free). ✓
- Storage limit still enforced: `record_image_upload` raises `storage_limit_exceeded` at the cap; `business_storage.used_bytes` never exceeds the plan limit.
- Enabling face recognition + indexing consumes **exactly one** allowance per indexed photo (one `token_ledger` row `reason='face_index'`, `delta=-1` for business-sourced; gallery-sourced rows are `delta=0` with `metadata.source='gallery'`).
- AWS success with **0 faces still consumes one** allowance (image → `face_index_status='indexed'`, credit kept).
- A failed index **refunds** (`fail_face_index` writes `reason='face_index_refund'`; image → `pending` or `failed`).
- Retries do **not** double-charge or duplicate AWS faces (`finalize_face_index` idempotent on `face_index_status='processing'`; crash-window recovery purges by `ExternalImageId` via paginated `ListFaces` before re-index).
- Concurrent workers never drive `business_tokens.balance` or `galleries.gallery_credit_used` negative (atomic `balance>0` / `gallery_credit_used < face_index_allowance` guards).
- Partial indexing + resume: a gallery larger than the allowance ends `face_index_status='partial'` with `skipped_no_allowance` images; adding allowance and re-invoking `index_gallery` resumes only the remaining images.
- Existing galleries remain compatible (backfill set already-indexed images to `face_index_status='indexed'`).

**5.3 Customer-facing wording + numbers:**
- No customer-facing "tokens/טוקנים" wording remains (Dashboard + StudioSettings show "תמונות שנותרו" / "שדרג מסלול").
- Solo / Pro / Studio show **2,000 / 10,000 / 30,000** photos.
- Prices show **$39 / $75 / $120**.

☐ **APPROVAL:** Section 5 pass → proceed to Section 6.

---

## 6. One-time gallery test (LemonSqueezy Test mode)

Test mode only — no real charge. Uses variant `LEMONSQUEEZY_VARIANT_GALLERY`.

1. Complete a **Test-mode** one-time gallery purchase (`custom_data.purpose='gallery_unlock'`, `business_id`, `gallery_id`).
2. Webhook `order_created` → `mark_gallery_paid` grants the entitlement. Confirm on **only the purchased gallery**:
```sql
SELECT one_time_paid, face_index_allowance, storage_limit_bytes, paid_expires_at
FROM galleries WHERE id='<purchased gallery uuid>';
-- expect: true, 10000, 80530636800 (75 GB), now()+~12 months
```
3. Confirm **10,000** face-rec photos, **75 GB**, **12-month** expiry (above).
4. **Webhook retry** (replay the same order event): `mark_gallery_paid` returns false; `face_index_allowance` stays **10000** (not 20000).
5. **Free-plan 2 GB does not block the paid gallery:** as the (free-plan) owner, upload to the paid gallery; uploads count against the gallery's 75 GB pool (`galleries.storage_used_bytes`), not `business_storage`; not blocked at 2 GB.
6. **Another gallery cannot use the entitlement:** index a *different* gallery of the same business with `business_tokens.balance=0` → images go `skipped_no_allowance` (entitlement is gallery-specific).
7. **Partial at the cap:** with the gallery entitlement exhausted and business balance 0, remaining images are `skipped_no_allowance`; gallery `face_index_status='partial'`; gallery stays viewable; UI shows exact progress + upgrade.
8. **Order of consumption:** for a subscriber (business balance > 0) with a paid gallery, indexing consumes the **gallery pool first** (`gallery_credit_used` rises, `business_tokens.balance` unchanged) until the gallery entitlement is exhausted, then the business balance.
9. **Refund/reversal:** trigger a Test-mode refund (`order_refunded`) → `revoke_gallery_paid` sets `one_time_paid=false`, `face_index_allowance=0`, `paid_expires_at=now()`; the gallery re-gates behind the paywall; already-indexed photos and the business balance are untouched.

☐ **APPROVAL:** Section 6 pass → proceed to Section 8 (restoration).

---

## 7. Mixed-version protection (steps 8–13)

**The window.** Migration 083 replaces `record_image_upload` (free + storage-capped),
adds the credit RPCs, and re-points the completion trigger onto `face_index_status`.
The **old** `rekognition` function does not call `reserve_face_index_credit` and
stamps `face_indexed_at` directly — if it runs **after** 083 is applied but
**before** the new `rekognition` is deployed, it will index without consuming a
credit and leave galleries in an inconsistent status. Therefore steps 9–11 must be
a tight block with indexing paused.

**No global kill-switch exists.** Indexing is on-demand: the frontend invokes
`rekognition` with `action:'index_gallery'` on publish and after uploads; a
per-gallery lock (`try_claim_face_indexing`, staleness `INDEXING_LOCK_STALENESS_SEC`
= 600 s) prevents concurrent workers per gallery.

**Safest method (recommended):**
1. Before step 9, deploy a **temporary pause build** of the `rekognition` function
   whose `actionIndexGallery` returns `{ paused: true }` immediately (no claim, no
   AWS, no DB writes). This makes new index requests no-ops for the window.
   ‹PROD CHANGE - edge›
2. Apply migration 083 (step 9), deploy the **real** new `rekognition` (step 10)
   and `lemonsqueezy-webhook` (step 11), redeploy web (step 12).
3. Resume: the real function's `recoverStuckProcessing` reclaims any `processing`
   orphan (reuses its reserved credit — no re-charge), and `pending` /
   `skipped_no_allowance` images resume on the next `index_gallery`.

**If a pause build is not used** (shorter but riskier): schedule steps 9–12 in a
low-traffic window, do **not** publish galleries or upload during the window, and
apply 083 → deploy new `rekognition` back-to-back (target < 5 min). In-flight
handling: images already stamped before 083 are backfilled to `indexed`; unindexed
images become `pending` and are reprocessed under the credit model. No double-charge
is possible because the old path never reserved a credit.

**Queued/processing during deploy:** there is no external queue. After the new
function is live, invoke `index_gallery` on any gallery that was mid-flight;
`recoverStuckProcessing` + the pending/skipped resume path converge it.

> ❌ Do not leave the old and new billing/indexing logic running concurrently
> without the pause build or the "no publish/upload" window above.

☐ **APPROVAL:** confirm pause is in effect before step 9; confirm resume after step 12.

---

## 8. Credit restoration (step 15–17)

> Restoration **never** runs automatically as part of a migration.
> `restore_upload_consumed_credits()` is DEFINED by 083 but not executed.

**8.1 Read-only preview (run first, no writes):**
```sql
WITH last_reset AS (
  SELECT tl.business_id, MAX(tl.created_at) rat
  FROM token_ledger tl WHERE tl.reason='subscription_reset' GROUP BY tl.business_id),
calc AS (
  SELECT b.id, b.business_name, COALESCE(bt.balance,0) balance,
         COALESCE(p.token_count,100) plan_cap,
         COALESCE(-SUM(tl.delta) FILTER (WHERE tl.reason='image_upload'
           AND tl.created_at > COALESCE(lr.rat, TIMESTAMP 'epoch')),0) consumed_by_uploads
  FROM businesses b
  LEFT JOIN business_tokens bt ON bt.business_id=b.id
  LEFT JOIN subscriptions s ON s.business_id=b.id AND s.status IN ('active','trial')
  LEFT JOIN plans p ON p.id=s.plan_id
  LEFT JOIN last_reset lr ON lr.business_id=b.id
  LEFT JOIN token_ledger tl ON tl.business_id=b.id
  GROUP BY b.id, b.business_name, bt.balance, p.token_count, lr.rat)
SELECT business_name, balance, plan_cap, consumed_by_uploads,
       LEAST(consumed_by_uploads, GREATEST(plan_cap-balance,0)) AS would_restore
FROM calc WHERE LEAST(consumed_by_uploads, GREATEST(plan_cap-balance,0)) > 0
ORDER BY would_restore DESC;
```

**8.2 Required approval gate — the preview MUST show EXACTLY:**

| business_name | would_restore |
|---|---|
| eclipse media | **+69** |
| Or Doga | **+5** |

Total **74 credits across those two accounts**, and no others.
❌ **ABORT** restoration if the accounts, per-account amounts, or total differ in
any way — reconcile first.

**8.3 Run restoration ONCE:**  ‹PROD CHANGE - db›
```sql
SELECT * FROM restore_upload_consumed_credits();  -- returns (business_id, restored) rows
```

**8.4 Verify:**
```sql
SELECT business_name, balance FROM business_tokens bt
JOIN businesses b ON b.id=bt.business_id
WHERE b.business_name IN ('eclipse media','Or Doga');
-- expect both = 100
SELECT business_id, delta, reason, metadata FROM token_ledger WHERE reason='migration_restore';
-- expect exactly two rows: +69 and +5
```

**8.5 Idempotency:** running `restore_upload_consumed_credits()` a **second** time
restores **0** (the cap `GREATEST(plan_cap-balance,0)` is now 0). Confirm the
second call returns no rows and writes no new ledger entries.

☐ **APPROVAL:** required before 8.3. Record executor + timestamp in Section 11.

---

## 9. Rollback plan

Preserve `token_ledger` history at all times — **never delete financial/audit records.**

**9.1 Migration 082** — run the dedicated, staging-proven rollback file
`supabase/migrations/082_p1_read_leak_cleanup_rollback.sql`. It restores the
exact pre-082 policies (`vendors_public_read` TO anon; `image_scores_public_read`
TO {authenticated,anon}) + the pre-082 `gallery_get_meta` body, and drops
`image_scores_owner_read`. ⚠️ Re-opens the three anon read-leaks — only run to
revert 082. Safe/reversible.  ‹PROD CHANGE - db›

**9.2 Migration 083** — run `supabase/migrations/083_face_index_billing_model_rollback.sql`.
It restores the token-deducting `record_image_upload` (065 form), restores the
pre-083 completion trigger, drops the credit RPCs + `revoke_gallery_paid`, and
restores the pre-083 `mark_gallery_paid` (unlock only). **Non-destructive by
default** — it leaves `face_index_status`, `business_storage`, gallery entitlement
columns and the widened CHECKs in place (dropping them is optional/commented).
Corrected plan price metadata is intentionally NOT reverted. ‹PROD CHANGE - db›

> ⚠️ **Forward-repair, not rollback, once credits have moved.** If face indexing
> has already consumed credits under 083, rolling `record_image_upload` back does
> not un-consume them. Prefer forward repair over reverting billing state.

**9.3 `rekognition` edge function** — redeploy the previous version.  ‹PROD CHANGE - edge›
(If 083 is being rolled back, the old function is required.)

**9.4 `lemonsqueezy-webhook`** — redeploy the previous version. ‹PROD CHANGE - edge›
Note: without `order_refunded`, refunds won't auto-revoke entitlements (revoke
manually via `revoke_gallery_paid` if it still exists, else clear the gallery
columns).

**9.5 Frontend** — redeploy the previous Vercel build.  ‹PROD CHANGE - web›

**9.6 Disable NEW indexing while preserving uploads:** deploy the pause build
(Section 7) — `actionIndexGallery` → `{ paused:true }`. Uploaded images and
existing indexed faces are untouched; only new indexing stops.

**9.7 Stop conditions (halt deploy, invoke rollback owner) on any of:**
unexpected authorization failures (RLS denying legitimate owners / allowing anon),
negative `business_tokens.balance` or `galleries.gallery_credit_used`, duplicate
`face_index` charges for one image, `lemonsqueezy-webhook` 5xx / signature
failures, or public/published-gallery viewer breakage.

---

## 10. Post-deployment monitoring

Watch after each production-changing block; checkpoints at **immediately**,
**+15 min**, **+1 hour**, **next day**.

- **Supabase function errors** — `rekognition` + `lemonsqueezy-webhook` logs (5xx, thrown errors).
- **Rekognition failures / stale processing:**
```sql
SELECT face_index_status, count(*) FROM images GROUP BY face_index_status;   -- watch 'failed' and long-lived 'processing'
SELECT id, face_index_status, face_index_error FROM images
WHERE face_index_status='processing' ORDER BY updated_at LIMIT 50;           -- stale 'processing' orphans
```
- **Negative / unexpected balances:**
```sql
SELECT business_id, balance FROM business_tokens WHERE balance < 0;                 -- expect none
SELECT id, face_index_allowance, gallery_credit_used FROM galleries
WHERE gallery_credit_used > face_index_allowance OR gallery_credit_used < 0;        -- expect none
```
- **Duplicate ledger entries (double charge):**
```sql
SELECT ref_id, count(*) FROM token_ledger WHERE reason='face_index' AND delta=-1
GROUP BY ref_id HAVING count(*) > 1;                                                -- expect none
```
- **Storage reconciliation (counters vs actual image bytes) — expect 0 drift rows:**
```sql
-- Business pool == SUM(business-counted image bytes)
SELECT bs.business_id, bs.used_bytes AS counter, COALESCE(s.bytes,0) AS actual
FROM business_storage bs LEFT JOIN (
  SELECT g.business_id, SUM(COALESCE(i.original_size_bytes,0)) bytes
  FROM images i JOIN galleries g ON g.id=i.gallery_id
  WHERE NOT COALESCE(i.counted_gallery_storage,false) GROUP BY g.business_id) s
  ON s.business_id=bs.business_id
WHERE bs.used_bytes <> COALESCE(s.bytes,0);
-- Paid-gallery pool == SUM(gallery-counted image bytes)
SELECT g.id, g.storage_used_bytes AS counter,
       COALESCE(SUM(COALESCE(i.original_size_bytes,0)),0) AS actual
FROM galleries g LEFT JOIN images i ON i.gallery_id=g.id AND COALESCE(i.counted_gallery_storage,false)
GROUP BY g.id, g.storage_used_bytes
HAVING g.storage_used_bytes <> COALESCE(SUM(COALESCE(i.original_size_bytes,0)),0);
```
- **RPC authorization spot-check** (should all be `f` except service/authenticated as noted):
```sql
SELECT has_function_privilege('anon','public.reserve_face_index_credit(uuid,uuid)','EXECUTE') AS anon_reserve,       -- f
       has_function_privilege('anon','public.get_gallery_index_summary(uuid)','EXECUTE') AS anon_summary,             -- f
       has_function_privilege('authenticated','public.record_image_upload(uuid,text,text,text,text,bigint,uuid,integer,boolean)','EXECUTE') AS auth_upload; -- t
```
- **LemonSqueezy webhook failures** — webhook logs + LemonSqueezy dashboard delivery status.
- **Storage-limit rejection rate** — frequency of `storage_limit_exceeded` (frontend toast / function logs); a spike may mean a mis-set plan/gallery limit.
- **Public + private gallery access errors** — viewer 4xx/5xx; selfie-search availability on `partial` galleries.

---

## 11. Final sign-off checklist

| Item | Pass / Fail | Notes |
|------|-------------|-------|
| Pre-deploy checklist (Sec 3) | ☐ | |
| PR 082 merged | ☐ | |
| Migration 082 applied | ☐ | |
| 082 security smoke tests (Sec 4) | ☐ | |
| PR 083 rebased on main | ☐ | |
| 083 test suite re-run | ☐ | |
| PR 083 merged | ☐ | |
| Processing paused (Sec 7) | ☐ | |
| Migration 083 applied | ☐ | |
| `rekognition` deployed | ☐ | |
| `lemonsqueezy-webhook` deployed | ☐ | |
| Web redeployed | ☐ | |
| Processing resumed | ☐ | |
| 083 billing + gallery smoke (Sec 5) | ☐ | |
| One-time gallery test (Sec 6) | ☐ | |
| Restoration preview = 74 (eclipse +69 / Or Doga +5) | ☐ | |
| Restoration run once + verified (Sec 8) | ☐ | |
| Monitoring clean at +1h (Sec 10) | ☐ | |

- **Executed by:** ________________________
- **Timestamp (UTC):** ____________________
- **Production commit SHA / release:** ____________________
- **Rollback decision (proceed / rolled back):** ____________________
- **Final approval (name):** ____________________

> Reminder: this runbook does not merge, deploy, apply migrations, restore
> credits, or switch LemonSqueezy to Live. Each of those is an explicit,
> approval-gated human action above.
