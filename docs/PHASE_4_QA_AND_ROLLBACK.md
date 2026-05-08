# Phase 4.1 — QA, Surface Verification & Rollback Rehearsal

**Author**: QA + Surface Verification Agent
**Date**: 2026-05-06
**Repository**: `/Users/guysidi/gallery-flow`
**Scope**: Verification of Phase 4.1.A–E prep work; 30-test acceptance plan; rehearsed rollback procedure; go/no-go checklist before Phase 4.5 (the actual bucket flip).

---

## 1. Surface Map Verification

The Surface Map doc (`docs/PHASE_4_IMAGE_SURFACE_MAP.md`) claims **57 render sites**.

### Independent grep counts (run 2026-05-06)

| Target | Command | Raw result |
|--------|---------|-----------|
| `gallery-web/src` (`.tsx` + `.ts`) | `grep -nrE "storageUrl\|/storage/v1/object/public/"` | **72 lines** |
| `gallery-web/api` (`.ts` + `.tsx`) | same pattern | **3 lines** |
| **Total** | | **75 lines** |

### Why 75 lines does NOT mean 75 distinct render sites

After manually inspecting the full grep output the 75 lines break down as:

| Category | Lines | Notes |
|----------|-------|-------|
| Import statements | 8 | `import { storageUrl } from '../supabase'` — not render sites |
| TypeScript prop/interface declarations | 4 | `storageUrl: (path: string) => string` — type signatures, not renders |
| Helper function definition body | 2 | `supabase.ts:8-9` — the canonical implementation itself |
| `buildPublicUrl` function bodies (API) | 2 | `og.tsx:48-49`, `score-images.ts:110-111` — helper bodies, not callsites |
| Prop-pass-through (no URL constructed) | 3 | `App.tsx:1414,1428,2248`; `ClientDashboard.tsx:893` pass `storageUrl` as a prop |
| `signedStorage.ts` internal references | 4 | fallback calls inside the new helper module |
| **Actual URL-constructing render/fetch callsites** | **52** | SPA (49) + API callsites (3) |

**Verdict**: The doc's claim of 57 is within the expected range for the methodology used (the doc authors counted unique code locations including the download-path `fetch()` calls). The independent grep yields **52 true callsites** (excluding imports, type declarations, and helper bodies). The discrepancy is 5 lines and comes from the surface map counting some multi-line function bodies as separate entries. There is NO evidence of undiscovered render sites. The surface map is directionally correct and sufficient for Phase 4 planning.

### Drift site status (as of 2026-05-06)

| File | Line | Status |
|------|------|--------|
| `Dashboard.tsx:294` | `storageUrl('gallery-images', path)` | CLEANED — already uses helper |
| `Dashboard.tsx:910` | `storageUrl('gallery-images', path)` | CLEANED — already uses helper |
| `Dashboard.tsx:2696` | `storageUrl(STORY_BUCKET, st.storage_path)` | CLEANED — already uses helper |
| `api/og.tsx:48` | `buildPublicUrl()` local helper (mirrors `storageUrl()`) | ACCEPTABLE — server-side edge runtime cannot import SPA helpers; `buildPublicUrl` is a single-line wrapper, swappable in one file |
| `api/score-images.ts:110` | `buildPublicUrl()` local helper | ACCEPTABLE — same reason as above |
| `LandingPage.tsx:11` | Hardcoded absolute URL for demo asset | INTENTIONAL — confirmed single fixed UUID, not a customer photo path; out of scope |

**All three Dashboard.tsx drift sites are eliminated.** The two API `buildPublicUrl` helpers are correctly isolated in their own files. The only remaining hardcoded URL (`LandingPage.tsx:11`) is intentional and confirmed not a drift bug.

**Post-cleanup grep check** (`grep -nrE "/storage/v1/object/public/" gallery-web/src --include='*.tsx' --include='*.ts'`) returns **only** `supabase.ts:9` (the helper definition) and `LandingPage.tsx:11` (the intentional demo asset). Zero unauthorized drift remains in `src/`.

---

## 2. Helper Coverage Assessment

### Phase 4.1.B — signedStorage.ts

`gallery-web/src/lib/signedStorage.ts` exists and is fully implemented. Key characteristics verified:

- Exports `signedStorageUrl(bucket, path, options?)` as an async function.
- In-memory cache with 55-minute TTL (`CACHE_TTL_MS = 55 * 60 * 1000`). Signed URL TTL is 60 minutes server-side. No race window.
- In-flight de-duplication via `inflight: Map<string, Promise<string>>` — 10 simultaneous calls for the same `(bucket, path)` key trigger exactly one network roundtrip.
- Fallback to `storageUrl(bucket, path)` on any error (line 79, 82), unless `options.fallbackToPublic === false`.
- Reads Phase-3 session token from `sessionStorage` (`client-token-*` prefix, line 23-29).
- Sends token as `X-Client-Session` header when present.
- **Status**: NOT yet wired to any callsite. All 52 callsites still call `storageUrl()` directly. This is correct for Phase 4.1 — the helper is prep work, not yet activated.

### Phase 4.1.A — Drift cleanup

All gallery photo `<img src>` and `<video src>` paths in `src/` now go through `storageUrl()` or through a component prop that ultimately resolves to `storageUrl()`. The `signedStorageUrl()` helper is available as a drop-in replacement for Phase 4.3 when the bucket flips.

### LandingPage.tsx

`LandingPage.tsx:11` hardcodes one specific UUID path (`dfa8f1a5-f558-4800-a09a-272020476da1`). This is a static demo asset, not a customer photo. It is deliberately outside the `storageUrl()` pattern and correctly excluded from scope.

---

## 3. Production-Safety Verdict

| Agent | Work | Production-safe? | Notes |
|-------|------|-----------------|-------|
| **4.1.A** Drift cleanup | `Dashboard.tsx:294,910,2696` — string swap `https://...supabase.co/storage/v1/object/public/gallery-images/${path}` → `storageUrl('gallery-images', path)` | YES | Output URL is byte-for-byte identical. No behavior change. 1:1 swap, no async path, no new dependencies. Safe to ship immediately. |
| **4.1.A** API helpers | `og.tsx` and `score-images.ts` each define a local `buildPublicUrl()` that wraps the same template string | YES | Server-side edge/node runtime; output URL identical to what was there before. One-line wrappers make a future signed-URL swap trivial. |
| **4.1.B** signedStorage.ts | Net-new file; exports two functions; not imported anywhere yet | YES — trivially | No callsite touches it. Cannot break anything. Backward compatible by construction. |
| **4.1.B** `signed_url` action | New dispatch branch in `append-event-posts.ts:647-649`; calls `handleSignedUrl()` defined at line 574 | YES | Existing actions (`append_event_posts`, `choose_variant`, `unchoose_variant`, `save_post_edit`) are untouched. The dispatcher falls through to `unknown_action` for unrecognized strings, same as before. Origin allowlist runs before dispatch, unchanged. |
| **4.1.C** Public viewer session DESIGN | Plan-only doc (`PHASE_4_PUBLIC_SESSION_DESIGN.md`) | YES — trivially | Zero code changes. |
| **4.1.D** Upload dual-write PLAN | Plan-only | YES — trivially | Zero code changes. |
| **4.1.E** AI/rekognition PLAN | Plan-only | YES — trivially | Zero code changes. |

**Summary**: All Phase 4.1 work is production-safe and ship-ready. None of it touches the bucket ACL, existing URL construction for live galleries, or any customer-facing async path.

---

## 4. Acceptance Test Plan

Severity codes: **RB** = regression-block (must pass before merge), **SB** = security-block, **C** = cosmetic.

### A. Drift Cleanup Correctness (4.1.A)

| ID | Test | Steps | Pass criteria | Severity |
|----|------|-------|--------------|----------|
| T1 | Dashboard gallery thumbnails | Sign in as photographer → open `/dashboard` | All gallery cover thumbnails load; no 401/broken images in Network tab | RB |
| T2 | Dashboard image grid | Open any gallery's edit screen from dashboard | Full image grid renders; `imgUrl()` at `Dashboard.tsx:910` produces correct URLs | RB |
| T3 | Dashboard story video | Open a gallery with stories → play story | Story video plays; no 401 in Network tab for `gallery-stories` bucket | RB |
| T4 | OG image on WhatsApp share | Send a known gallery URL in WhatsApp (or use `curl -A "WhatsApp/2.x" /<biz>/<slug>`, parse `og:image`, fetch it) | Returns HTTP 200, content-type `image/png`, dimensions 1200×630 | RB |
| T5 | AI scoring produces valid URLs | POST to `/api/score-images` with a valid `clientId` containing top picks | Response `ok: true`; Anthropic vision call completes without 401; scores written to `image_ai_scores` table | RB |

### B. Signed URL Infrastructure (4.1.B)

| ID | Test | Steps | Pass criteria | Severity |
|----|------|-------|--------------|----------|
| T6 | Helper compiles | `cd gallery-web && npx tsc --noEmit` | Zero TypeScript errors in `src/lib/signedStorage.ts` and its imports | RB |
| T7 | Valid signed URL request | `POST /api/append-event-posts` body `{"action":"signed_url","bucket":"gallery-images","path":"<known-path>"}` | Response `{"ok":true,"url":"https://...","expires_at":"...","token_present":false}` | RB |
| T8 | Unknown bucket rejected | Same but `"bucket":"evil-bucket"` | Response 400 `{"ok":false,"error":"bucket_not_allowed"}` | SB |
| T9 | Path traversal rejected | `"path":"../../etc/passwd"` | Response 400 `{"ok":false,"error":"invalid_path"}` | SB |
| T10 | Origin allowlist blocks evil origin | Same request with header `Origin: https://evil.example.com` | Response 403 `{"ok":false,"error":"origin_not_allowed"}` | SB |
| T11 | Signed URL actually serves the image | Take the `url` from T7, `curl -I "<url>"` | HTTP 200, `content-type: image/jpeg` (or matching mime), non-zero `content-length` | RB |
| T12 | Cache de-duplication | In browser: call `signedStorageUrl('gallery-images', '<same-path>')` 10 times simultaneously | Network tab shows exactly 1 POST to `/api/append-event-posts`; all 10 Promises resolve with the same URL | RB |
| T13 | Endpoint 500 → fallback to public URL | Mock `/api/append-event-posts` to return 500 → call `signedStorageUrl(bucket, path)` | Returns `storageUrl(bucket, path)` (public URL); no uncaught exception | RB |
| T14 | Token echoed in response | Send request with header `X-Client-Session: <valid-phase3-token>` | Response includes `"token_present": true` | C |

### C. Coexistence with Phase 1–3 Changes

| ID | Test | Steps | Pass criteria | Severity |
|----|------|-------|--------------|----------|
| T15 | Phase 1–3 regression suites | Run `docs/PHASE_1_REGRESSION_CHECKLIST.md` and `docs/PHASE_2_REGRESSION_CHECKLIST.md` against staging | All checklist items pass | RB |
| T16 | Origin allowlist still guards all actions | POST to `/api/append-event-posts` with `Origin: https://attacker.io` for each action (`choose_variant`, `save_post_edit`, `signed_url`) | All return 403 | SB |
| T17 | verify_code flow | Submit a Phase 3 `verify_code` action via the client dashboard PIN flow | Returns 200 with valid token; dispatcher correctly routes to `handleVerifyCode`; `signed_url` dispatch does not interfere | RB |
| T18 | feed_plans writes | In Feed Studio, choose a variant, save a post edit | `feed_plans` row updated; `choose_variant` and `save_post_edit` actions still dispatch correctly | RB |

### D. Surface Integrity — No Breakage

| ID | Test | Steps | Pass criteria | Severity |
|----|------|-------|--------------|----------|
| T19 | Anon gallery viewer | Open `/<biz>/<gallery-slug>` cold in incognito | Welcome screen loads, cover image renders, masonry grid renders first 30 images | RB |
| T20 | Public client dashboard | Open `/<biz>/c/<client-slug>` with a valid PIN | Gallery cards render; story thumbnails visible; no broken images | RB |
| T21 | Photographer dashboard | Sign in → `/dashboard` | Gallery list renders; all cover images load | RB |
| T22 | Bulk download via JSZip | Click "Download all" on a 50-photo gallery | ZIP downloads; open ZIP, count 50 valid JPEG files | RB |
| T23 | Face recognition selfie upload + match | On face-indexed gallery, upload a selfie | Match results return; result photo URLs render | RB |
| T24 | Story autoplays | Open gallery with stories | Story player autoplays without 401; no regression in `App.tsx:1144,1174` | RB |
| T25 | Mobile Safari | Run T19 + T20 on real iOS Safari | All images load; no layout shift; no console 401 errors | RB |
| T26 | Mobile Chrome Android | Run T19 + T20 on Pixel Chrome | Same as T25 | RB |

### E. Future-Flip Readiness

| ID | Test | Steps | Pass criteria | Severity |
|----|------|-------|--------------|----------|
| T27 | Signed URL works on still-public bucket | Call `POST /api/append-event-posts {"action":"signed_url",...}` while bucket is still public | Returns a valid signed URL; `curl` the URL returns 200 (Supabase supports signing on public buckets) | RB |
| T28 | Cache TTL < issued URL TTL | Inspect `signedStorage.ts:15` (`CACHE_TTL_MS = 55 * 60 * 1000`) vs `append-event-posts.ts:603` (`createSignedUrl(path, 60 * 60)`) | 55 min < 60 min — no race window where a cached entry refers to an expired signed URL | RB |
| T29 | Dual-path fallback allows seamless transition | Mock signed URL endpoint to succeed; call `signedStorageUrl()`; then mock it to return 500 | First call returns signed URL; second call returns public URL via fallback; no exception thrown | RB |
| T30 | Synthetic heartbeat monitor | Curl `https://<public-bucket-url>/<known-path>` every 60 seconds in CI cron | Alert fires within 2 minutes if response changes from 200 to 401 | RB |

---

## 5. Rollback Rehearsal Procedure

Target: any engineer completes this in under 30 minutes against staging.

### Step 1 — Setup (5 min)

1. Stand up `pixflow-staging` Supabase project (separate from prod `vlyiqfawkrjvqcmkpfvs`).
2. Apply migrations 001–057 in order: `supabase db push --db-url <staging-db-url>`.
3. Deploy SPA + API to a dedicated Vercel staging project linked to the `staging` branch. Set env vars: `SUPABASE_URL` (staging), `SUPABASE_ANON_KEY` (staging), `SUPABASE_SERVICE_ROLE_KEY` (staging).
4. Open a known-good gallery URL in the staging Vercel deployment. Confirm all images load (HTTP 200 in Network tab).
5. Record the staging gallery URL for steps 2–4.

### Step 2 — Simulate the flip (2 min)

In the Supabase dashboard for `pixflow-staging` → SQL Editor:

```sql
UPDATE storage.buckets SET public = false WHERE id = 'gallery-images';
SELECT id, public FROM storage.buckets WHERE id = 'gallery-images';
-- Expected: public = false
```

### Step 3 — Verify breakage (2 min)

1. Hard-refresh the staging gallery URL (Cmd+Shift+R or clear site data).
2. Open DevTools → Network → filter by `Img`.
3. Confirm images return HTTP 401 or 400.
4. Record timestamp: `T_BREAK`.

### Step 4 — Execute rollback (1 min)

In the same Supabase SQL editor:

```sql
UPDATE storage.buckets SET public = true WHERE id = 'gallery-images';
SELECT id, public FROM storage.buckets WHERE id = 'gallery-images';
-- Expected: public = true
```

### Step 5 — Verify recovery and time the cycle (<60 sec)

1. Immediately hard-refresh the gallery URL.
2. Confirm all images load (HTTP 200). If still broken, wait 10 seconds and refresh again (CDN propagation).
3. Record timestamp: `T_RECOVER`.
4. Compute: `T_RECOVER - T_BREAK`. **Target: < 90 seconds**.
5. Document the elapsed time in the PR or Slack channel before proceeding to prod.

### Automated rehearsal script

`scripts/storage-rollback-rehearsal.sh` should NOT exist yet. When created, it should contain:

1. A `psql` command (or Supabase CLI invocation) to set `public = false` on `gallery-images` in staging and log the timestamp.
2. A `curl` loop that polls `https://<staging-url>/<known-path>` every 2 seconds and reports the first HTTP status change from 200.
3. A fixed 30-second wait to simulate detection lag.
4. A `psql` command to restore `public = true` and log the restore timestamp.
5. A second `curl` loop that polls until the image returns HTTP 200 again, then prints elapsed seconds.
6. An assertion: if elapsed > 90 seconds, print `FAIL: recovery too slow` and exit 1; otherwise print `PASS: <N>s`.

The script requires `STAGING_DB_URL` and `STAGING_GALLERY_IMAGE_URL` as environment variables. It should never touch production env vars.

---

## 6. Image Failure Detection Plan

### Browser-side (Sentry)

Instrument every `<img onError>` handler in the gallery viewer (`App.tsx`), client dashboard (`ClientDashboard.tsx`), and photographer dashboard (`Dashboard.tsx`) to call:

```typescript
Sentry.captureMessage('image_load_failed', {
  level: 'warning',
  extra: { bucket, path, status: event.target?.['status'] ?? 'unknown' },
  fingerprint: ['image_load_failed', bucket],
})
```

Set a Sentry alert: **if `image_load_failed` events exceed 1% of total image render events in any 5-minute window → PagerDuty/Slack notification within 60 seconds**. Sentry's "Percentage of Sessions" alert type supports this threshold.

### Synthetic monitor (GitHub Actions cron)

Create `.github/workflows/storage-heartbeat.yml` (not in scope for Phase 4.1, but specify now):

- Schedule: `cron: '*/5 * * * *'` (every 5 minutes).
- Steps: `curl -f -s -o /dev/null -w "%{http_code}" <known-gallery-url>/<image-path>`.
- If exit code non-zero or HTTP != 200: send a Slack webhook notification with the status code and timestamp.
- Cheaper and lower latency than Better Uptime for this use case; no external SaaS needed.

If an external tool is preferred, Better Uptime is acceptable: create a heartbeat monitor on `https://<prod-gallery-url>/<known-thumb-path>`, period 5 minutes, alert after first failure.

### Vercel logs filter

After deploying Phase 4.1.B, add a structured log line in `handleSignedUrl()`:

```typescript
console.log(JSON.stringify({
  event: 'signed_url_result',
  ok: true,
  bucket,
  status: 200,
  token_present: tokenClientId !== null,
}))
```

And on error:

```typescript
console.error(JSON.stringify({
  event: 'signed_url_error',
  bucket,
  error: error?.message,
  status: 500,
}))
```

In Vercel dashboard → Logs, filter by `signed_url_error`. Set a log drain to Datadog/BetterStack if volume grows. Alert if more than 5 `signed_url_error` events appear in any 5-minute window.

### Customer-facing canary in og.tsx

In `api/og.tsx`, add a single log line at the end of a successful render:

```typescript
console.log(JSON.stringify({
  event: 'og_image_verified',
  gallery_id: gallery?.id ?? 'unknown',
  cover_resolved: Boolean(coverPath),
  ts: new Date().toISOString(),
}))
```

This gives a "last verified loadable" signal in Vercel logs. If `og_image_verified` events stop appearing while gallery traffic continues, it indicates the OG image path is broken even if the SPA itself still loads. Filter for absence of this event in the log drain alert.

---

## 7. Pre-Flip Go/No-Go Checklist

Every checkbox must be TRUE before Phase 4.5 (the actual `UPDATE storage.buckets SET public=false`) fires.

- [ ] All 30 Phase 4.1 acceptance tests (T1–T30) pass in staging.
- [ ] Rollback rehearsal (Section 5) completed at least once in staging; elapsed time < 90 seconds documented.
- [ ] Sentry `image_load_failed` alert configured and tested (trigger manually once, confirm Slack/PagerDuty fires).
- [ ] Synthetic heartbeat monitor running in GitHub Actions or Better Uptime; confirmed it alerts within 2 minutes of a test 401.
- [ ] No photographer events scheduled in the next 7 days (query: `SELECT event_date FROM galleries WHERE event_date BETWEEN now() AND now() + interval '7 days' AND status = 'live'`).
- [ ] Maintenance window (Tue or Wed 03:00–05:00 IDT) confirmed and communicated to all photographers via the Hebrew template.
- [ ] Hebrew customer communication templates (existing in `PHASE_4_RISK_AND_STAGING_PLAN.md §4.y`) pre-loaded in WhatsApp and ready to send within 60 seconds.
- [ ] On-call engineer with `psql` access to prod Supabase confirmed available for the duration of the flip plus 2 hours after.
- [ ] Each Phase 4.1.A–B PR merged and deployed to production; stable for > 48 hours with zero Sentry warnings.
- [ ] Vercel build green on the `staging` branch; no TypeScript errors; no Sentry errors in the last 48 hours.
- [ ] Vercel function count confirmed ≤ 12 (or Pro plan active). Current count: 12 Node + 1 edge = 13 total. **Action required**: either consolidate one Node function or upgrade to Pro before Phase 4.5.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` confirmed present in Vercel production scope (not just preview), confirmed NOT bundled into the SPA client bundle.
- [ ] grep for `/storage/v1/object/public/` in `gallery-web/src` returns only `supabase.ts:9` and `LandingPage.tsx:11`. Zero unauthorized drift.
- [ ] `supabase/functions/rekognition/index.ts:190-191` updated to use signed URL or service-role download (currently out of scope for 4.1 but MUST be done before 4.5 — catastrophic failure risk, see Risk H in `PHASE_4_RISK_AND_STAGING_PLAN.md`).

---

## 8. Open Questions

| Question | Blocking? | Owner |
|----------|-----------|-------|
| Is there a staging Supabase project? Current state: none exists (confirmed in `PHASE_4_RISK_AND_STAGING_PLAN.md §2`). Must create `pixflow-staging` before ANY test in Section 4 can run. | YES — blocks T1–T30 | Guy / DevOps |
| Is there a staging Vercel project? Needs a separate `staging` branch and env vars. | YES — blocks T1–T30 | Guy |
| Sentry plan tier? Free tier (5k events/month) may be exhausted quickly once `image_load_failed` instrumentation lands on a gallery with 150 images. Recommend Team plan ($26/mo) before Phase 4.5. | Yes for monitoring SLA | Guy |
| Synthetic monitoring tool choice? GitHub Actions cron (free, already in repo) vs Better Uptime ($7/mo, better alerting). Recommend GitHub Actions for Phase 4.1; upgrade to Better Uptime before Phase 4.5. | No for 4.1; Yes for 4.5 | Guy |
| Vercel function cap: currently 12 Node + 1 edge. Adding a dedicated `sign-image.ts` would exceed the cap. Resolution required before Phase 4.3: either (a) route `signed_url` through the existing `append-event-posts.ts` dispatcher (already done in 4.1.B — no new function needed), or (b) upgrade to Vercel Pro. Option (a) is already implemented. Verify that no additional function is planned. | No — already resolved by 4.1.B design | QA confirmed |
| `rekognition` edge function (`supabase/functions/rekognition/index.ts:190-191`) still uses a hardcoded public URL for face indexing. This is a catastrophic failure risk (Risk H) if the bucket flips before this is fixed. Phase 4.1.E plan must explicitly address this. | YES — must be resolved before 4.5 | 4.1.E agent |

---

*Word count: ~2,480. End of document.*
