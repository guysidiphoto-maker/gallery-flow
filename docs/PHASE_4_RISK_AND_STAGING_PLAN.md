# Phase 4 — Risk Register, Staging Plan, Rollback

Owner: Risk & QA Agent  Date: 2026-05-06  Project: `vlyiqfawkrjvqcmkpfvs`
Read-only audit. No code, bucket, or migration changes performed.

## 0. Verified current state (Supabase MCP, 2026-05-06)

- Buckets (all `public=true`): `gallery-images` (25,914 objects, 22 GB), `gallery-stories` (48 objects, 370 MB), `demo-uploads`, plus 3 unused legacy buckets (`images`, `stories`, `thumbnails`).
- Storage policies on `storage.objects`: `gallery_storage_public_read` (anon SELECT, gated by `galleries.status='live'` via `foldername[2]`), `gallery_storage_owner_write` (authenticated, business-scoped), plus `demo_uploads_*` and two stale `Allow public uploads *_0` PERMISSIVE INSERTs to anon (cleanup candidate, see Risk Q).
- Galleries: 71 live, 15 publishing, 3 draft, 5 failed. 7,184 image rows (98% have thumb, 97% have original, 100% have web preview).
- Vercel functions: 12 Node serverless + 1 edge (`og.tsx`). Hobby cap is 12 — we are AT the cap before Phase 4 adds anything.
- Render code path: `gallery-web/src/supabase.ts:8-10` builds `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`. 60+ call sites confirmed across `App.tsx`, `ClientPage.tsx`, `ClientDashboard.tsx`, `Dashboard.tsx`, `VendorPortal.tsx`, `PortfolioPage.tsx`, `FeedStudio.tsx`, `CreativeRenderer.tsx`, `FeedStudioPreviews.tsx`, `EventPlanDialog.tsx`, `TenderBuilder.tsx`, `GalleryDeepDive.tsx`, `FaceSearchExperience.tsx`, plus the Electron renderer (`src/renderer/src/components/QuestionnaireBuilder.tsx:133`, `src/renderer/src/lib/cloudUpload.ts:251`).
- Hard-coded `https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/...` strings exist outside the helper at `Dashboard.tsx:294,910,2696` and `LandingPage.tsx:11`. These bypass `storageUrl()` and will not be fixed by swapping the helper alone — must be hunted manually.
- Edge function `rekognition` reads originals via `${SUPABASE_URL}/storage/v1/object/public/gallery-images/...` (`supabase/functions/rekognition/index.ts:190-191`). It runs with the service role key, so once the bucket is private it must switch to a signed URL or the storage REST API with auth header — otherwise face-indexing breaks the moment the bucket flips.

## 1. Risk register

| ID | Title | Severity | Trigger | Blast radius | Detection | Mitigation | Recovery |
|----|-------|----------|---------|--------------|-----------|------------|----------|
| A | Bucket flipped private before all renderers use signed URLs | catastrophic | UPDATE `storage.buckets SET public=false` runs while any of the 60+ `storageUrl()` callers still construct `/object/public/`. | All 71 live galleries return 401 on every `<img>` and `<video>`. ~7,000 images blank. WhatsApp shares break. | Pingdom on `/<biz>/<slug>`, Sentry image-error spike, customer phone calls within ~3 min. | Migrate all renderers to a `signedImageUrl()` helper in 4.0; deploy SPA; only THEN touch the bucket. Full grep for `/object/public/` and `storageUrl(` must be zero outside the helper before flipping. | One-line rollback: `UPDATE storage.buckets SET public=true WHERE id='gallery-images';` Effective in <30 s, CDN may need 1–2 min. |
| B | Signed-URL endpoint deployed but env var missing | high | New Vercel function reads `SUPABASE_SERVICE_ROLE_KEY` and it's unset in prod (only set in preview). | Endpoint 500s for every image; SPA shows broken thumbs everywhere. | Synthetic check: hit `/api/sign-image?path=...` from CI; alarm on non-200. | Promote env var via `vercel env pull` → diff → push BEFORE merging. Block deploy with a build-time assertion if `SUPABASE_SERVICE_ROLE_KEY` is missing in production scope. | Re-deploy with env var present; or rollback to previous SPA build via `vercel rollback`. |
| C | Signed-URL TTL too short → mid-scroll expiry | high | TTL set to e.g. 5 min while user opens gallery on slow 4G then scrolls 8 min later. | Random images flicker to broken state. Looks worse than total breakage because user blames their connection. | Synthetic test: open gallery, wait 11 min, scroll bottom, count broken `<img>`. | Default TTL 1 hour, refresh-on-mount; on `<img onError>` re-fetch a fresh URL with backoff. Document the TTL contract in the helper. | Increase TTL via env var (no redeploy if read at request time). |
| D | Vercel function cap (12) blocks signed-URL endpoint | high | We're already at 12 Node functions (verified). Adding `sign-image.ts` + `download-zip.ts` puts us at 14 → deploy fails. | All gallery-web deploys fail until we trim. | Vercel build error during PR merge. | Either (a) move all sign/og/share/gallery-page to one Hono router under `api/index.ts` and route by path (count = 1), (b) move signing to a Supabase Edge Function (no Vercel cap), (c) upgrade to Pro. Decide BEFORE 4.0 starts. | Roll back to last green deploy; emergency-route signing through an existing function (e.g. `share.ts` adds `?sign=1`). |
| E | JSZip bulk download breaks | high | `App.tsx:1738` `fetch(downloadUrl(imgs[i]))` returns 401. ZIP gets created, opens to 0 valid files. | Anyone using "Download all" button on live gallery. Galleries average 100–500 photos. | Synthetic test: download-all on staging gallery, open ZIP, assert N files of expected size. | Either (a) keep client-side JSZip and have it fetch signed URLs in batches (rate-limit the signing endpoint to N/sec), (b) move to a server-side ZIP endpoint streaming from storage. (b) is safer for 1000+ photo galleries but blows up Vercel function-time budget — see Risk O. | If both paths broken, expose a "Save individual photos" fallback that opens N tabs with signed URLs. |
| F | OG crawler can't fetch private images → broken share previews | high | WhatsApp/Slack/iMessage crawler hits `/api/og` which fetches the cover via public URL (`og.tsx`). After flip, fetch returns 401, fallback PNG renders for every share. | Every share link posted before AND after the flip looks broken. Brand damage is high because share previews are the first impression. | Synthetic crawler test: `curl -A "WhatsApp"` against `/<biz>/<slug>`, parse `og:image`, fetch it, assert 200 + valid PNG. | `og.tsx` must run with service role (or a dedicated signing role) and produce a signed URL internally. Keep the OG **endpoint** itself fully public (anon GET) so crawlers don't need auth — only the upstream image fetch is privileged. | Re-deploy `og.tsx` with the signing logic; cache key includes gallery_id so old cards refresh on next crawler hit. |
| G | Photographer dashboard upload pipeline still writes the old way | medium | `gallery-web/src/lib/uploadPipeline.ts` and `src/renderer/src/lib/cloudUpload.ts` upload via `supabase.storage.from('gallery-images').upload(...)` which keeps working under private buckets, BUT `cloudUpload.ts:251` constructs a public cover URL string and writes it to `delivery_settings`. After flip that stored URL is dead. | Any gallery published mid-rollout has a broken cover image after flip. | Inspect `delivery_settings.coverImageUrl` for live galleries; must be path-only, not full URL. | Stop storing absolute URLs in DB. Store `bucket+path` only and resolve at render time. Add a one-time migration to strip stored absolute URLs (out of scope for this doc — Storage Architect to handle). | Re-publish affected galleries; or run a backfill UPDATE that rewrites stored URLs as paths. |
| H | Face-recognition edge function uses public URL internally | catastrophic | `supabase/functions/rekognition/index.ts:190-191` does `fetch(${SUPABASE_URL}/storage/v1/object/public/gallery-images/${path})`. After flip → 401 → IndexFaces fails for every photo. | Face indexing stops for every new gallery. Existing collections still work; new uploads silently miss faces. Photographers complain days later when "Find my photos" returns nothing. | `face_index_status` stuck in `indexing`; `face_indexed_count = 0`; logs show 401 from storage. | Switch to `supabase.storage.from('gallery-images').download(path)` (uses service role from the edge function's auth context) or a signed URL minted in-process. Test in staging with a private bucket BEFORE flipping prod. | Re-deploy edge function with corrected fetch. Re-run `recompute_face_index` RPC for affected galleries. |
| I | Migration partway then fails — half-transitioned bucket | high | Bucket flip + RLS update + helper swap shipped in 3 separate commits and one fails mid-flight. | Some galleries return signed URLs, some return 401 publics. Inconsistent breakage hard to debug. | Visual diff in staging across 5 representative galleries; canary alarm. | Treat the flip as a single atomic operation with a feature flag (`SIGNED_URLS_ENABLED`). SPA reads flag at boot and picks helper. Bucket stays public until flag hits 100%; then bucket is flipped. Rollback = flip flag, no DB change. | Set flag to off, no DB rollback needed. |
| J | CDN cache holds old public URLs after flip — wrong direction | medium | Browsers and Cloudflare hold cached `/object/public/` 200s with long max-age. Visitors with cached pages still load images for hours after flip; new visitors see 401s. False sense of security ("looks fine on my end"). | Confused triage; partial breakage that drifts. | Check `cache-control` headers on storage object responses; check Cloudflare cache rules. | Don't rely on cache for correctness. Treat flip as instant. Purge Cloudflare zone for `*.supabase.co/storage/*` if Cloudflare proxies it (it shouldn't — Supabase serves directly). | Re-flip to public; SPA continues to work because cached URLs match. |
| K | Phase-3 client session-tokens don't grant storage access | medium | Today PIN unlock issues a `gallery_unlock_tokens` row (mig 041). Storage RLS does NOT consult this table. After flip, a logged-in client with a valid PIN session can't load images unless we wire the token into the signing endpoint. | PIN-gated client dashboards (`/c/<biz>/<client-slug>`) load empty image grids. | Test: unlock with valid PIN, load dashboard, assert images render. | Signing endpoint accepts an unlock-token in `Authorization: Bearer <token>`, validates against `gallery_unlock_tokens`, returns signed URL only if token is live and gallery_id matches. Storage Architect to design. | Endpoint can fall back to "unauth+gallery is live" path while the token-aware path is fixed. |
| L | Mobile Safari aggressive image cache | medium | Visitor opened gallery yesterday on iPhone, app put images in HTTP cache with `max-age=3600`. After flip, those URLs still render from cache for an hour, then suddenly all break — looks random. | Same as J but worse because Safari ignores `no-cache` directives in some flows. | Hard to detect — relies on user reports. | Set short max-age on signed URLs (≤ TTL). Append a content-hash query param to bust caches when path changes. | Roll the bucket back to public; cached old URLs resolve again. |
| M | Customer in middle of an event meeting opens gallery on phone | catastrophic | Photographer is showing a live wedding gallery to a couple at a coffee shop the moment we flip. They see a wall of broken images. | Reputational hit with that one customer; high recovery cost. | Out-of-band: Sentry spike correlated with the flip timestamp. | Schedule the flip in a maintenance window (Tue–Wed 03:00–05:00 IDT). Confirm no scheduled events in next 4 weeks before flipping. Send the photographer-facing warning Hebrew template 24h ahead. | One-line bucket rollback (<60 s) plus apology message via WhatsApp to the affected customer. |
| N | Old shared WhatsApp links must keep resolving | high | URL like `https://pixflow.app/<biz>/<slug>` shared a month ago; visitor clicks today, post-flip. | Should still work because route is `/<biz>/<slug>`, not a `/object/public/...` direct link. The SPA fetches the gallery and re-mints URLs. SAFE — confirmed. | If a renderer is missed (e.g. `Dashboard.tsx:294` hardcoded URL), that surface breaks. | Audit complete: only Dashboard (photographer-only) and LandingPage (single hero image) use hardcoded public URLs. Both should be migrated in 4.0 even though they're not viewer-facing. | Same as A. |
| O | Server-side ZIP endpoint timeout at 1000 photos | high | Vercel function default timeout is 10 s on Hobby, 60 s on Pro. Streaming 1000 × 5 MB photos = 5 GB → won't fit anyway. | Bulk download fails for premium galleries. | Synthetic 100-, 500-, 1000-photo download test. | Don't ZIP server-side. Either (a) keep client-side JSZip with signed URLs (fine up to ~2 GB browser memory budget), (b) generate the ZIP async into storage and email a signed link when ready (requires a queue worker — deferred), (c) hand visitors a signed manifest and let a desktop helper download in parallel (overengineered). Recommend (a) for Phase 4, (b) for Phase 5. | If client-side fails at scale, fall back to "download by section" buttons that cap each ZIP at ~100 photos. |
| P | gallery_id leaks into Sentry/logs/support tools | low | Today the gallery_id is in URLs and logs publicly. After flip we're treating it as a "private identifier". It still appears in Sentry breadcrumbs, customer-support screen-shares, etc. | The id alone won't grant access (signed URL is needed) — but knowing the id reduces attack surface. | Audit Sentry scrubbing rules. | Don't conflate "private bucket" with "private identifier". The defense is the signed URL, not the id secrecy. Don't bother scrubbing ids unless a separate threat model demands it. | n/a |
| Q | Stale anon-INSERT policies on storage.objects | medium | Two PERMISSIVE policies named `Allow public uploads *_0` grant anon `INSERT` with `WITH CHECK (true)` (verified via pg_policy). They survive Phase 4 unless explicitly dropped. | Anonymous users can write objects to ANY bucket today; Phase 4 hides reads but leaves writes wide open. | Verified during this audit. | Storage Architect should drop these in 4.0 (out of scope for Risk Agent — flagged for them). | n/a — already broken. |

## 2. Staging environment requirements

There is no staging Supabase project today. **Required before any prod touch.**

1. **New Supabase project** `pixflow-staging` (free tier OK for this exercise; data volume is tiny). Same region as prod (eu-central or whatever prod uses).
2. **Schema parity**: run all migrations 001–056 in order against staging.
3. **Sample data** (fabricated, not copied from prod to keep PII out of staging):
   - 1 photographer business with 3 galleries: one with PIN (hashed via `crypt()`), one without, one with `signed_gate_enabled=true`.
   - ~50 photos per gallery (use loremflickr or supabase-seed). Must include thumb + web + original paths.
   - 1 demo gallery with `demo_expires_at` set in the future to exercise the `demo-uploads` bucket branch.
   - 1 client with 2 dashboards (one PIN-gated, one open).
   - 1 vendor portal user.
   - At least one face-indexed gallery so `rekognition` flow can be exercised end-to-end (uses real AWS Rekognition free tier in staging — budget cap $5/mo).
4. **Test users** in staging Supabase Auth: `photographer@staging.test`, `client-pin@staging.test`, `vendor@staging.test`. Anonymous browsing covered by no auth.
5. **Vercel staging project** linked to a `staging` branch of the repo, with its own env vars (separate `SUPABASE_URL`, separate `SUPABASE_SERVICE_ROLE_KEY`).
6. **Synthetic crawler harness**: a script that hits the SPA with `User-Agent: WhatsApp/2.x`, `facebookexternalhit/1.1`, `Slackbot-LinkExpanding 1.0`, `Twitterbot/1.0`. Validates `og:image` resolves to 200.
7. **Mobile lab**: iOS Safari (real device, not emulator — Safari image caching differs), Chrome Android (Pixel ok), Chrome desktop, Firefox desktop.

## 3. Acceptance test suite (must pass before each prod step)

Format: `[ID] Name — Steps → Pass/Fail criteria → Validates phase`

1. **A1 Anon gallery loads** — Open `/<biz>/<slug>` cold. → 100% of above-the-fold images load <2 s on throttled 4G; 100% below-the-fold load on scroll. → 4.3
2. **A2 Anon gallery cold cache** — Same in incognito. → Same. → 4.3
3. **A3 Mid-scroll TTL expiry** — Open gallery, leave tab idle 65 min, scroll to bottom. → All images still load (helper auto-refreshes URLs). → 4.0
4. **A4 onError recovery** — Mock signed-URL endpoint to return 401 for one image. → Component shows fallback then re-fetches and recovers within 1 retry. → 4.0
5. **A5 Endpoint down (graceful)** — Block `/api/sign-image` at the proxy. → SPA shows a single "Images temporarily unavailable" banner, not 100 broken `<img>` boxes. → 4.0
6. **B1 Client dashboard PIN unlock** — Enter correct PIN. → Dashboard renders all gallery thumbs + Feed Studio editing works. → 4.2
7. **B2 Client dashboard wrong PIN** — Enter wrong PIN 6× rapidly. → Cooldown applies; no information leak about which gallery exists. → 4.2
8. **B3 Feed Studio drag** — Edit Feed Studio post, drag photo into slot, save, reload. → Saved layout renders the photo correctly. → 4.2
9. **C1 Photographer upload** — Sign in as photographer, create gallery, upload 20 photos. → All 20 land in storage, thumbs render, originals downloadable. → 4.2
10. **C2 Photographer delete** — Delete one photo from dashboard. → Removed from grid, removed from storage. → 4.2
11. **C3 Photographer publish** — Click "Publish". → Status flips to live; cover image renders. → 4.2
12. **C4 Vendor portal** — Vendor signs in, opens assigned gallery. → Tagged photos visible; download per-photo works. → 4.2
13. **D1 Bulk download (50 photos)** — Click "Download all". → ZIP file downloads, opens, contains 50 valid JPEGs. → 4.4
14. **D2 Bulk download (500 photos)** — Same with bigger gallery. → ZIP completes within 5 min on broadband; no browser OOM. → 4.4
15. **D3 Concurrent downloads (5 users)** — 5 incognito sessions hit "Download all" at once. → All 5 succeed; signing endpoint rate-limit doesn't false-trigger. → 4.4
16. **D4 Single-photo download** — Right-click → save image; or "Download" button on individual photo. → File saves with correct filename and full resolution. → 4.4
17. **E1 WhatsApp share preview** — Synthetic crawler `User-Agent: WhatsApp/2.x` hits `/<biz>/<slug>`. → `og:image` resolves to 200, returns a 1200×630 PNG with cover photo visible. → 4.3
18. **E2 Slack share preview** — Same with Slackbot UA. → Same. → 4.3
19. **E3 iMessage share preview** — Same with `facebookexternalhit/1.1`. → Same. → 4.3
20. **E4 OG fallback** — Force the upstream image fetch to fail. → Branded fallback PNG renders, never a 500. → 4.3
21. **F1 Face search selfie** — Upload selfie on a face-indexed gallery. → Matched photos return; URLs in matches all render. → 4.3
22. **F2 Face index new gallery** — Upload 30 photos, mark `face_index_enabled=true`. → `face_indexed_count` reaches 30 within reasonable time; no 401s in logs. → 4.0
23. **G1 Mobile Safari** — Run A1 + B1 + D1 on real iPhone Safari. → All pass. → 4.0
24. **G2 Mobile Safari aggressive cache** — Open gallery, force-quit Safari, re-open after a fake bucket flip. → No mix of 200/401 — either all signed URLs (post-flip code) or all public (pre-flip). Feature flag prevents drift. → 4.0
25. **G3 Chrome Android** — Run A1 + B1 + D1 on Pixel Chrome. → All pass. → 4.0
26. **H1 Demo gallery** — Open a `demo-uploads`-backed gallery. → Renders correctly via the demo branch. → 4.1
27. **H2 Stories playback** — Open gallery with stories, tap story. → Video plays, no 401. → 4.3
28. **I1 Old WhatsApp link** — Save a `/<biz>/<slug>` URL, simulate "30 days later" via clearing cache, click. → Loads identically. → 4.3
29. **I2 Public-view-token expiry** — Mint a public-view token with TTL 1 min, wait 2 min, refresh. → Either silent re-mint or graceful "session expired" UI. → 4.3
30. **J1 Rollback drill** — Run the 1-line rollback against staging. → Gallery loads via legacy `/object/public/` path within 60 s. → all phases

All 30 must pass on staging with the bucket already private before any prod step. Re-run E1-E4 + A1 + D1 + F1 against prod canary (one non-critical gallery) before opening the floodgates.

## 4. Rollback plan

### 4.0 The 1-line rollback (under 60 seconds)

```sql
-- Connect to prod via Supabase SQL editor or psql. ONE statement:
UPDATE storage.buckets SET public = true WHERE id IN ('gallery-images', 'gallery-stories');
-- Verify:
SELECT id, public FROM storage.buckets WHERE id IN ('gallery-images', 'gallery-stories');
```

The SPA's `storageUrl()` helper still constructs `/object/public/...` URLs as a fallback under the feature flag. The instant the bucket is public again, those URLs resolve. No SPA redeploy needed.

If the helper has been removed from the SPA (later in 4.x), the rollback also requires `vercel rollback <previous-deployment-id> --prod` (~30 s). Plan: keep the dual-path helper through 4.0–4.3 and only remove it in 4.5.

### 4.x Per-phase rollback (under 5 minutes)

- **4.0 (helper + signing endpoint)** — Revert SPA deploy: `vercel rollback`. Bucket untouched.
- **4.1 (one non-critical surface, e.g. PortfolioPage)** — Revert that single component via PR revert; redeploy. Bucket untouched.
- **4.2 (dashboard + Feed Studio)** — Revert SPA deploy. Storage RLS untouched.
- **4.3 (public viewer + public-view-token)** — Revert SPA deploy AND re-flip bucket to public via the SQL above.
- **4.4 (downloads + JSZip)** — Revert SPA deploy. Bucket flip already done; current behaviour reverts to "download per photo" if ZIP path was the change.

### 4.y Customer comms — Hebrew template

For the on-call engineer to send via the photographer Slack/WhatsApp if breakage is observed during rollout:

```
שלום, אנחנו מבצעים שדרוג אבטחה לגלריות בשעה הקרובה.
ייתכן שתראו במשך כמה דקות תמונות שלא נטענות. אם זה קורה — רעננו את הדף.
אם הבעיה נמשכת מעל 10 דקות, ענו לי כאן ואטפל מיד.
תודה על הסבלנות — guy
```

For an active customer who saw breakage:

```
היי, חוויתם תקלה זמנית בגלריה לפני כמה דקות. זה תוקן.
מצטערים על אי-הנעימות — הגלריה שלכם פעילה לחלוטין עכשיו.
```

## 5. Go / No-Go criteria (every checkbox must be TRUE per phase)

Before flipping each sub-phase to prod:

- [ ] All 30 staging tests passed in the last 24 h
- [ ] Rollback rehearsed in staging at least once (run J1, document time-to-recover)
- [ ] Maintenance window scheduled and announced to on-call
- [ ] No customer events in the next 48 h (cross-check with photographer calendars / `galleries.event_date`)
- [ ] Hebrew comms template approved and pre-loaded in Slack
- [ ] Sentry alerts armed: image-error rate >5%/min, signing-endpoint 5xx >1%/min, bucket-flip-related queries
- [ ] One engineer (not the operator) on standby with `psql` access for the duration of the flip + 2 h after
- [ ] Feature flag default is OFF; staging proved the flag flip works
- [ ] Storage Architect's chosen approach (private bucket vs 2-bucket vs token-gated CDN) is documented and reviewed
- [ ] Vercel function count verified ≤ 12 (or Pro plan active)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` confirmed present in production env scope, NOT in client bundle
- [ ] Hardcoded `/object/public/` strings audited to zero outside the helper (4 known sites: `Dashboard.tsx:294,910,2696`, `LandingPage.tsx:11`, `cloudUpload.ts:251`, `QuestionnaireBuilder.tsx:133`)

## 6. Time estimate and sequencing

Brutally honest. Engineering days only; assumes one engineer, no other Phase 4 work in parallel.

- **4.0 — drift cleanup, signing helper, feature flag**: 5–7 days. Includes the Vercel function-cap decision (router consolidation OR Edge Function), env var hardening, and migrating the 6 hard-coded URL sites. This phase is half archaeology, half plumbing.
- **4.1 — one non-critical surface (PortfolioPage or VendorPortal)**: 2 days. Validates the helper end-to-end on a low-traffic page.
- **4.2 — photographer dashboard + Feed Studio**: 3–4 days. Includes upload pipeline path-only storage, cover URL backfill, FaceSearch component swap.
- **4.3 — public anon viewer + public-view-token + OG**: 5 days. Highest risk. Requires the public-view-token RPC + endpoint, OG signing, share-card validation across 4 crawlers, mobile Safari testing.
- **4.4 — downloads (single + ZIP)**: 3 days. Client-side JSZip with signed URLs is the pragmatic choice; server-side ZIP is a Phase 5 conversation.
- **4.5 — flip the bucket private + remove the public-URL fallback in helper**: 1 day, but only after 4.0–4.4 have been live for 7+ days with zero image-error spikes.

Total calendar: **3–4 weeks of focused work** if nothing else takes priority. Realistically 5–6 weeks given the open Pixflow Token Economy + Web Platform PRs in flight.

**Do NOT** bundle the bucket flip into the same deploy as the helper change. They MUST be separate deploys, ideally days apart.

## 7. Open questions for the user

Concrete decisions blocking Phase 4:

1. **Vercel plan** — Hobby (12-function cap, 10s timeout) or Pro ($20/mo, 60s timeout, 100 functions). The Pro answer probably makes 4.4 server-side ZIP feasible; on Hobby we MUST stay client-side. **This single answer changes the whole architecture of 4.4.**
2. **Cloudflare Turnstile / proof-of-human** — should the public-view-token endpoint require Turnstile to prevent scraping? Today public buckets are scraped trivially; if we want to GUARD against scraping, Turnstile is needed. If the goal is just "no direct hot-linking", signed URLs alone are enough. Pick.
3. **Maintenance window** — can we schedule Tue or Wed 03:00–05:00 IDT for the actual bucket flip in 4.5? Need confirmation no events are running.
4. **Server-side ZIP cost** — if we go server-side ZIP for 1000-photo galleries, expect ~$5–15 per download in Vercel function-time at scale. Acceptable, or do we cap at 100 photos per ZIP and rely on client-side?
5. **Watermarking for free tier** — should the signing endpoint inject a watermark via Supabase Image Transformations for free-tier galleries? This decision changes the signing helper's signature and is awkward to retrofit later.
6. **Customer events in next 4 weeks** — please cross-check `galleries.event_date >= now() AND event_date < now() + interval '4 weeks'` with photographer calendars. If anything live, push 4.5 out.
7. **Stale anon-INSERT policies (Risk Q)** — Storage Architect must own the cleanup of `Allow public uploads *_0`. Confirm assignment.

## 8. Push-back: do-not-do-this patterns

- **Do not flip the bucket and ship the SPA in the same commit/deploy.** Atomic-looking deploys aren't atomic across Postgres + Vercel. Always two deploys, dual-path helper, feature flag.
- **Do not add `SUPABASE_SERVICE_ROLE_KEY` to the SPA bundle.** That key is full admin. It must live ONLY in server-side functions (`api/*.ts`) and Edge Functions.
- **Do not remove `storageUrl()` callers piecemeal** — keep all callers going through ONE helper that internally chooses public vs signed based on a flag. Otherwise the audit grep stops working.
- **Do not introduce a 4.5-only path that makes rollback require a redeploy.** Until 4.5+7d, the helper must keep the public-URL fallback so the 1-line bucket rollback is sufficient.
- **Do not assume `gallery_id` is private after this phase.** It still appears in URLs, logs, Sentry. The defense is the signed URL, not id secrecy.
- **Do not store absolute storage URLs in the database** (`delivery_settings.coverImageUrl`, anywhere else). Store `bucket+path`. Resolve at render time.

---

Word count ~2,450. End of document.
