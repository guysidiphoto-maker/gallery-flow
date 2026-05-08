# Phase 4 — Storage Privacy Plan

**Status:** DRAFT — read-only investigation. No storage policies, bucket flags, or migrations have been changed.
**Date:** 2026-05-06
**Author:** Storage Architect agent
**Scope:** Architectural plan to move `gallery-images` from `public:true` to private without breaking 71 live galleries, the SPA viewer, the public client dashboard, OG crawlers, JSZip downloads, or the photographer dashboard.

---

## 1. Current state map (verified live)

### 1.1 Buckets (Supabase project `vlyiqfawkrjvqcmkpfvs`)

| Bucket | `public` | Objects | Size | Notes |
|---|---|---|---|---|
| `gallery-images` | **true** | **25,914** | **24.0 GB** | Originals 7,859 / 20.8 GB · Web 8,918 / 1.99 GB · Thumbs 9,026 / 550 MB |
| `gallery-stories` | true | 48 | 388 MB | Reels-style MP4s |
| `demo-uploads` | true | 0 | 0 | Phase-2 demo flow |
| `images`, `stories`, `thumbnails` | true | 0 | 0 | Legacy / unused; safe to ignore |

71 of 94 galleries are `status='live'`. Originals are 87 % of total egress weight — that is the lever.

### 1.2 Storage RLS policies (live, on `storage.objects`)

| Policy | Cmd | Roles | Predicate |
|---|---|---|---|
| `gallery_storage_public_read` | SELECT | `anon` | bucket in (`gallery-images`,`gallery-stories`) AND gallery `(foldername(name))[2] = id` AND `status='live'` |
| `gallery_storage_owner_write` | ALL | `authenticated` | same path match AND `business_id = current_business_id()` |
| `demo_uploads_select` | SELECT | `anon` | `bucket_id = 'demo-uploads'` |
| `demo_uploads_insert` | INSERT | `anon` | `bucket_id = 'demo-uploads'` |
| `Allow public uploads 1ndp9hv_0` / `28s1y0_0` | INSERT | `anon` | unconditional `true` (legacy — bucket_id missing) |

The two `Allow public uploads *` policies are sloppy legacy — they let anon write to ANY bucket. Out of Phase-4 scope but flagged.

### 1.3 Path scheme — audit was WRONG

Phase 1 audit claimed `<gallery_id>/originals/<filename>`. **Live data shows two schemes:**

1. **Current scheme (97 % of objects):** `<business_slug>/<gallery_id>/<thumbs|web|originals>/<filename>`
   Example: `eclipse-media/95ac0e8c-5ff5-4a97-8b36-e45a5d8b8dee/originals/IMG_1234.jpg`
2. **Legacy scheme (~3 %):** `<gallery_id>/<thumbs|web|originals>/<filename>`
   Example: `645bbac9-1899.../originals/foo.jpg`

The RLS policy uses `(storage.foldername(name))[2]` which is the **2nd folder segment** (PG arrays are 1-indexed). For scheme 1 that is the `gallery_id`. For scheme 2 it is `originals|web|thumbs` — meaning **legacy objects are not protected by the SELECT policy** even after we drop `public:true`. Any plan must handle both shapes or migrate legacy paths first.

### 1.4 Public-URL contract

`/Users/guysidi/gallery-flow/gallery-web/src/supabase.ts` defines:

```ts
export function storageUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}
```

70 call sites across SPA + API. Used by `App.tsx`, `ClientDashboard.tsx`, `Dashboard.tsx`, `GalleryDeepDive.tsx`, `FeedStudio.tsx`, `CreativeRenderer.tsx`, `FaceSearchExperience.tsx`, `LandingPage.tsx`, `PortfolioPage.tsx`, `VendorPortal.tsx`, `ClientPage.tsx`, `TenderBuilder.tsx`, `EventPlanDialog.tsx`, `SocialManager.tsx`, `FeedStudioPreviews.tsx`, plus `api/og.tsx` and `api/score-images.ts`. **Every one of these breaks the moment we flip `public:false` without a replacement.**

---

## 2. Threat model

**Today, with knowledge of a `gallery_id`** (UUIDs sometimes leak via screenshots, gallery URLs, or API responses):
- Attacker enumerates the `images` table via the anon key (`storage_path` is returned) and downloads every original full-resolution photo — 20 GB per the bucket. RLS on `images` does limit this to live galleries, but those are exactly the photos the customer paid for.
- The Phase 1.B Origin guard does not apply: storage requests go to `*.supabase.co`, not the photographer's domain, so the SPA Origin check is irrelevant.

**With knowledge of a `business_slug`** (always public on the photographer's portfolio page):
- Slug alone is not enough — they still need a `gallery_id` for the current scheme. But path enumeration via `storage.objects` listing requires service-role, which anon does not have. So slug-alone is low-risk; the main exposure is **once the gallery_id leaks once, all photos are downloadable forever.**

**Risk of leaving the bucket public after Phase 3:**
- Phase 3 protected the *client dashboard view layer* with session tokens, but the underlying photo URLs are still globally readable. Anyone who saw a gallery once (or guessed a UUID, or scraped a chat link) can still grab originals years later. This was the audit's headline finding and is the entire reason Phase 4 exists.

---

## 3. Three architectural options

### Option A — Single bucket, switch to private, signed URLs everywhere
- Flip `gallery-images.public = false`. Keep one bucket. Replace 70 `storageUrl()` call sites with `signedStorageUrl()`.
- **Complexity:** HIGH. 70 call sites, anon viewer puzzle, OG crawler puzzle, ZIP puzzle.
- **Latency:** +50–150 ms first paint per gallery (one signed-URL batch round-trip). Subsequent renders cached.
- **Cost:** Signing is free locally (HMAC). Egress unchanged. New API call adds Vercel function-invocations: ~71 live × ~5 visits/day × 1 batch = ~350/day. Trivial.
- **Breakage surface:** Every SPA image. Catastrophic if rolled out atomically; manageable in phases.
- **TTL choice:** 1 h for viewer, 24 h for dashboards behind session token. Refresh in-place before expiry.
- **Cache strategy:** Browser cache works (URL includes token, becomes its own cache key). CDN cache is per-token, so cache hit-rate plummets — signed URLs effectively bypass Supabase's CDN unless we use the `?token=` form which Supabase explicitly caches.

### Option B — Two-bucket split: public thumbs, private originals + web
- New `gallery-images-public-thumbs` bucket (768 px lossy WebP). Existing `gallery-images` becomes private and houses `web/` + `originals/`. One-time copy job for thumbs.
- **Complexity:** HIGHEST. Schema migration of `thumbnail_path` to point at new bucket, dual-write during cut-over, ~9,000 thumb copies. Path rewriting in 70 places anyway.
- **Latency:** Better than A — thumbnail grid (the dominant render) is public + CDN-cached. Only deep-zoom and downloads go through signed URLs.
- **Cost:** +500 MB duplicate storage (thumbs) ≈ negligible. CDN hits stay strong.
- **Breakage surface:** Two coordinated changes (thumb path + signed URLs). Migration must run before policy flip.
- **TTL:** Same as A.
- **Cache:** Excellent. Thumbs hit CDN like today; only originals trigger token round-trip.

### Option C — Token-gated CDN proxy in front of public bucket (no bucket change)
- Vercel edge function `/api/img?path=...&token=...` validates token then 302-redirects (or proxies) to a Supabase signed URL or, if we keep `public:true`, just to the public URL after token check. Bucket flag stays `public:true` so existing OG / share works.
- **Complexity:** MEDIUM. Single new endpoint (`/api/img`) is the choke-point.
- **Latency:** Worst — every image is a Vercel proxy hop (~100 ms cold, ~30 ms warm) before bytes flow.
- **Cost:** WORST. Every photo render becomes a function-invocation. 70 call sites × N images per gallery × visits = potentially 100k+/day. Function-time blows up.
- **Breakage surface:** Smallest day-1, but it doesn't actually *secure* the bucket — a determined attacker who learns the underlying public URL bypasses the proxy. This is security theater unless we also flip `public:false`.
- **TTL:** Token is the proxy's, not Supabase's; we own expiry. But same expiry problems as A.
- **Cache:** Mediocre. Vercel CDN can cache the proxy response, but cache keys still embed the token.

### Recommendation: **Option B (two-bucket split)**

Justification:
1. **Originals are the threat.** The audit named original-resolution photos as the breach. Originals are 87 % of bytes and 30 % of objects. A sharp split — public thumbs + private originals/web — addresses the actual risk.
2. **Performance survives.** The dominant render path (gallery grid) keeps CDN caching. Only "click to zoom" or "download" triggers a signed-URL round-trip. The anon-viewer puzzle (Section 5) becomes massively simpler because thumbs need no token.
3. **Reversibility.** Each phase touches a clearly-bounded surface (thumbnail bucket name change, then private-bucket signing). A failed cut-over rolls back by pointing thumbnail_path back to `gallery-images`.
4. **OG crawlers stay happy.** They render from the public-thumbs bucket — no JWT, no JS — fixing Section 6 for free.
5. **Cost stays flat.** No proxy hops, no per-render function calls. Sign-url batches happen once per page-load.

Option A is the close runner-up if duplicating thumbs is rejected; the core difference is whether thumbnail rendering survives an outage of our signing endpoint.

---

## 4. Rollout phases (Option B)

Each phase is independently reversible. Photographer events run almost every weekend — schedule cut-overs Mon–Wed only.

### Phase 4.1 — Introduce signed-URL helper alongside `storageUrl()`. *No behavior change.*
- **Code touched:** `gallery-web/src/supabase.ts` adds `signedStorageUrl(bucket, path, ttl)`. New file `gallery-web/src/lib/signedUrlBatch.ts` for batched calls. New file `gallery-web/src/lib/storageRouter.ts` that decides public-vs-signed based on path prefix (`thumbs/` → public, `web/` or `originals/` → signed). No existing call site changes.
- **RLS / bucket changes:** **None.**
- **Manual test:** New helper returns valid URLs in dev console; existing app behaves identically.
- **Rollback:** Revert one commit. Helper is dead code with no callers.
- **Estimate:** 0.5 day.

### Phase 4.2 — Provision public-thumbs bucket + one-time thumb copy.
- **Code touched:** None in app; SQL migration recommended **but not executed in this phase** — issue a one-shot copy job (Supabase Edge Function or local script with service-role key) that walks `images.thumbnail_path` and uploads each file to a new bucket `gallery-images-thumbs-public` (`public:true`, RLS: anon SELECT for live galleries only, mirroring existing policy).
- **RLS / bucket changes:** Create new bucket `gallery-images-thumbs-public`. Add SELECT policy mirroring `gallery_storage_public_read`. **Do NOT change `gallery-images` flag yet.**
- **Manual test:** Hit a known thumbnail URL on the new bucket — returns the image. Hit the same path on `gallery-images` — also returns (dual-resident).
- **Rollback:** Drop the new bucket. App still pointing at `gallery-images` for thumbs.
- **Estimate:** 1 day (mostly waiting on the copy job for ~9,000 thumbs).

### Phase 4.3 — Switch ONE non-critical surface to signed URLs (canary).
- **Code touched:** `gallery-web/src/components/GalleryDeepDive.tsx` only. Uses signed URLs for `web/` + `originals/`. Thumbs stay on the public bucket. Add Sentry breadcrumb on signed-URL failure.
- **RLS / bucket changes:** None.
- **Manual test:** Open `/dashboard` → Gallery Deep Dive on staging + on prod (one specific gallery). Verify renders. Watch Sentry 24 h.
- **Rollback:** Revert the one component (it still has `storageUrl` import; just swap back).
- **Estimate:** 0.5 day code + 1 day soak.

### Phase 4.4 — Switch dashboard / FeedStudio / CreativeRenderer to signed URLs.
- **Code touched:** `Dashboard.tsx`, `FeedStudio.tsx`, `FeedStudioPreviews.tsx`, `CreativeRenderer.tsx`, `ClientDashboard.tsx`, `TenderBuilder.tsx`, `EventPlanDialog.tsx`, `SocialManager.tsx`, `FaceSearchExperience.tsx`, `VendorPortal.tsx`, `PortfolioPage.tsx`, `ClientPage.tsx`. ~50 of the 70 call sites. All paths starting with `web/` or `originals/` route through `signedStorageUrl`. Thumbnails stay public via the new bucket.
- **RLS / bucket changes:** None yet.
- **Manual test:** Phase 1 + 2 + 3 regression checklist (72 tests) on staging, then a 6-h prod soak monitoring 4xx rates on `*.supabase.co`.
- **Rollback:** Per-file revert; signed helper is the new path, but `storageUrl` import is still in every file as a one-liner-away fallback.
- **Estimate:** 2 days code + 1 day soak.

### Phase 4.5 — Switch the public anon viewer (`App.tsx`) — **biggest risk surface**.
- **Code touched:** `App.tsx` (the gallery viewer route). Wires up the public-view-token flow (Section 5). All 28 `storageUrl(imgBucket, ...)` calls in `App.tsx` route through `signedStorageUrl` *if* the bucket is private AND the path is `web/` or `originals/`. Thumbs continue to load from the public-thumbs bucket. JSZip download path moves to the server-side ZIP endpoint (Section 7).
- **RLS / bucket changes:** **Now flip `gallery-images.public = false`.** Add a SELECT policy for the service-role only (already implicit). Keep `gallery_storage_public_read` for the new public-thumbs bucket only.
- **Manual test:** Full regression. Specifically: open a live gallery on a clean device, load 100+ photos, zoom to original, download one, bulk-zip, share to WhatsApp (OG crawler), reload after 1 h (token refresh), reload after 25 h (token expired path).
- **Rollback (1-command):** Set `UPDATE storage.buckets SET public=true WHERE id='gallery-images';` — revives the previous behavior in <60 s. The signed-URL endpoints still work (they tolerate either flag), so the SPA does not need a redeploy. Acceptance criterion §8.4.
- **Estimate:** 3 days code + 2 days soak in staging + 1 day prod canary.

**Total Phase 4 elapsed time: ~12 working days end-to-end** (excluding events black-out windows).

---

## 5. The anon public-viewer puzzle

**Problem.** The URL `/<biz>/<gallery-slug>` is opened on the client's phone with no PIN, no login, no session token. We still want to deny strangers who guessed the URL.

**Proposal — public-view token (PVT):**

1. On `App.tsx` mount, call `POST /api/public-gallery-session` with `{ galleryId }`. The endpoint:
   - Validates `galleries.status='live'` AND not deleted.
   - Validates a Cloudflare Turnstile token from the form (silent challenge — no user interaction in the happy path).
   - Issues a 1-hour HMAC-signed JWT scoped to that gallery's path prefix (`<biz>/<gallery_id>/`). Signing key: a new server-only env var.
2. The SPA holds the JWT in memory only. All `<img>` srcs and download fetches go through `/api/img-sign?path=<p>&pvt=<jwt>` which:
   - Verifies the JWT.
   - Confirms `path` begins with the gallery prefix in the JWT claim.
   - Issues a 5-min Supabase signed URL.
   - 302s to the signed URL.
3. After 55 minutes, the SPA silently re-issues the JWT.

**Latency hit:** +1 round-trip on gallery open (JWT issue) plus +1 round-trip on first image (signing endpoint). Subsequent images batch-sign (one call for up to 100 paths). Net: ~150 ms added to first paint, zero on warm reload within the hour.

**Cache:** The 5-minute Supabase signed URL is cacheable in the browser. Mid-scroll pre-fetching keeps the grid smooth. The Vercel `/api/img-sign` endpoint sets `Cache-Control: private, max-age=290` so the browser memoizes the redirect.

**JWT expires mid-scroll:** SPA-level fetch interceptor detects 401 from `/api/img-sign`, transparently refreshes the JWT, retries the request. User sees a one-tile flicker.

**Bot harvesting:** Cloudflare Turnstile silent mode + a per-IP rate limit on `/api/public-gallery-session` (10 sessions / IP / hour). A scraper now has to solve Turnstile and is throttled to one gallery per 6 minutes per IP — fatal to bulk harvesting.

**Honest caveats:** Turnstile costs $0 up to 1M challenges/mo (well within budget); above that it's $0.10/1k. It does break in tightly-firewalled corporate networks (~1 % of users). Cloudflare degraded mode falls through to a non-blocking proof-of-work via `cf-challenge-platform`. Worst case we degrade to "session token only when Turnstile fails" — one IP can grab one gallery, not 71.

---

## 6. OG / share crawler problem

WhatsApp, Slack, Twitter, etc. fetch `/api/og?gallery=<id>` and `/api/share?id=<id>`. They do not run JS, cannot carry a JWT, and need a public image URL in the response.

**Solution (falls naturally out of Option B):** the new `gallery-images-thumbs-public` bucket is exactly what they want. On gallery publish, generate a 768×768 lossy WebP cover (~80 KB) and upload to the public bucket. `/api/og.tsx` line 108 changes from:
```
${SUPABASE_URL}/storage/v1/object/public/gallery-images/${web_preview_path}
```
to:
```
${SUPABASE_URL}/storage/v1/object/public/gallery-images-thumbs-public/${og_path}
```

No originals exposed. No web/full-res previews exposed. Only a downsized cover thumbnail. Crawlers stay happy. Same change in `api/share.ts` (which currently links into the public URL via `gallery-page.ts`'s OG meta tags).

**Phase placement:** Phase 4.2 generates these covers as part of the same one-time copy job (or, for new galleries, hooked into the publish path).

---

## 7. JSZip download problem (Phase 4.6)

Today (`App.tsx` lines 1730–1764) the SPA fetches each photo via public URL and zips client-side. With private originals, the SPA would need 100+ fresh signed URLs per ZIP — expensive and easy to abuse.

**Recommendation:** new endpoint `/api/gallery-zip?gallery=<id>&pvt=<jwt>`. Vercel function streams a ZIP using the **service-role** key:
- Validates the PVT (or Phase-3 session token for client-dashboard zips).
- Streams `archiver` over the response body, fetching each original from the private bucket via service-role.
- Sets `Content-Disposition: attachment`.

**Pros:** Single token check. Service-role stays server-side. Photos never leak via guessable URLs even mid-download. Built-in rate-limiting per JWT.

**Cons:** Vercel function timeout — Hobby 10 s, Pro 60 s, Enterprise 900 s. A 200-photo / 10 GB gallery cannot finish in 60 s on Pro. Mitigations:
- Fluid Compute streaming response keeps the connection open while we stream from Supabase.
- For galleries >2 GB, fall back to the current client-side flow but issue a one-time "bulk" PVT scoped to that gallery for 5 min (lets the SPA fan out 100 sign requests against one server-side rate-limited endpoint).
- Or: pre-generate ZIPs server-side on publish and stash them in `gallery-images` private bucket. Sign on demand. Costs storage but eliminates timeout entirely.

**Phase placement:** Phase 4.6 — **AFTER 4.5 ships and is stable**. Until then keep client-side ZIP working against signed URLs (slower but functional).

---

## 8. Acceptance criteria

A staging environment must pass ALL of the following before Phase 4.5 (the production cut-over) executes:

1. All 24 Phase 1 + 24 Phase 2 + 24 Phase 3 regression tests still pass (72 total).
2. Anon public viewer puzzle works end-to-end: cold gallery open → photos render → 1-hour silent token refresh → 25-hour reload-from-zero → bulk download.
3. A clean staging Supabase project, populated from a snapshot of prod, has been driven through the full Phase 4.1–4.5 sequence and survives.
4. **One-command rollback verified:** `UPDATE storage.buckets SET public=true WHERE id='gallery-images';` restores prior behavior in under 60 s with no SPA redeploy required (helpers must tolerate either flag).
5. Zero customer-facing breakage during a 7-day prod canary on a single gallery (Phase 4.3).
6. Sentry 4xx rate on storage URLs stays within 0.5 % of baseline.
7. P95 first-paint latency on `/<biz>/<gallery-slug>` increases by no more than 250 ms.

---

## 9. Estimate

- **Engineering effort:** 12 working days (Phase 4.1–4.5). Phase 4.6 (server-side ZIP) is +2 days.
- **Migration windows:** Mon–Wed, avoiding Thu/Fri/Sat which are wedding-event days. Phase 4.5 cut-over executes Tuesday 03:00 IDT (lowest gallery-open volume per Phase 1 data).
- **Cost delta:**
  - Signed URL generation: free (HMAC, in-process).
  - New buckets: +500 MB ≈ $0.01/mo.
  - New endpoints: ~10k function-invocations/mo for `/api/public-gallery-session` and `/api/img-sign` ≈ within free tier.
  - Egress: unchanged. Bytes still come from Supabase.
  - Turnstile: $0 within 1M/mo; we'll do <50k/mo.
  - **Net cost increase: under $5/mo.**
- **Endpoint count:** currently 12 in `gallery-web/api/`. Phase 4 adds 3: `public-gallery-session.ts`, `img-sign.ts`, `gallery-zip.ts` (Phase 4.6). User said new endpoints require consolidation. **Proposal:** merge `share.ts` + `gallery-page.ts` (both serve crawler HTML) before Phase 4 starts, and consider folding `img-sign` into `public-gallery-session` as a sub-route. That keeps net delta at +1 endpoint instead of +3.

---

## 10. Open questions for the user

1. **Cloudflare Turnstile budget?** Free tier covers our scale 100×, but adoption requires DNS / domain ownership — confirm `pixflow.io` is on Cloudflare (or which provider).
2. **Server-side ZIP acceptable?** The Vercel function-time bill is small at our scale, but 10 GB galleries WILL time out on the Pro plan. Acceptable to fall back to client-side ZIP for super-large galleries, or fund Enterprise tier?
3. **Priority — locking ORIGINALS only (high audit urgency, low disruption) vs. locking ALL non-thumb assets (full fix, more disruption)?** Option B does both at once. If the answer is "originals only," we can stop after Phase 4.4 and leave `web/` public — cuts one week off but leaves 1.99 GB of intermediates exposed.
4. **Imminent customer events?** Per the conversation memory there are paying clients on live galleries. Which weekends are off-limits? Current plan reserves Thu–Sat.
5. **Path migration for legacy objects (~3 % of bucket)?** The legacy `<gallery_id>/<sub>/<file>` paths break the new RLS policy assumptions. Three options: (a) leave them in the public-thumbs bucket forever as read-only legacy, (b) one-shot rename to the new scheme during Phase 4.2, (c) accept they stay public. Recommend (b).
6. **"No new public endpoints" rule.** Confirm: does the consolidation of `share.ts` + `gallery-page.ts` count as zero-net-new, or do we need a separate negotiation?

---

## File reference (absolute paths)

- `/Users/guysidi/gallery-flow/gallery-web/src/supabase.ts` — `storageUrl()` definition. Needs sibling `signedStorageUrl()`.
- `/Users/guysidi/gallery-flow/gallery-web/src/App.tsx` — anon viewer; 28 `storageUrl` call sites; JSZip download (lines 1730–1770).
- `/Users/guysidi/gallery-flow/gallery-web/src/pages/ClientDashboard.tsx` — Phase 3 session-token-protected dashboard.
- `/Users/guysidi/gallery-flow/gallery-web/src/pages/Dashboard.tsx` — photographer dashboard; largest single file (4,799 lines).
- `/Users/guysidi/gallery-flow/gallery-web/api/og.tsx` — OG image; line 108 hard-codes the public bucket URL.
- `/Users/guysidi/gallery-flow/gallery-web/api/share.ts` — crawler share route; consolidation candidate.
- `/Users/guysidi/gallery-flow/gallery-web/src/components/GalleryDeepDive.tsx` — Phase 4.3 canary surface.
- `/Users/guysidi/gallery-flow/gallery-web/src/components/{FeedStudio,FeedStudioPreviews,CreativeRenderer,FaceSearchExperience,SocialManager,TenderBuilder,EventPlanDialog}.tsx` — Phase 4.4 surfaces.
- `/Users/guysidi/gallery-flow/gallery-web/src/pages/{LandingPage,PortfolioPage,VendorPortal,ClientPage}.tsx` — Phase 4.4 surfaces.

---

*Word count: ~2,950. End of plan.*
