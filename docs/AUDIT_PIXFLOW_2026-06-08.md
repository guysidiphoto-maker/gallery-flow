# Pixflow — Deep Product Audit (2026-06-08)

6 parallel read-only audits (client viewer, upload+tokens, dashboard+state, API+deploy, database, auth). No code changed. Findings below are de-duplicated and severity-ranked. Each item: **what / where / root cause / why prior fixes missed it / correct fix / risk**. Items marked **✅ VERIFIED LIVE** were confirmed against production via anon probes; **⚠️ NEEDS VERIFY** depends on whether a migration was actually applied (migrations here are applied by hand, not on deploy).

---

## CRITICAL (P0)

### C1 — Desktop app bypasses the token economy entirely ✅ (code-confirmed) — **DECISION: intentional, not a bug**
- **Where:** `src/renderer/src/lib/cloudUpload.ts:574` (`publishGallery`), `:1263` (`updateGalleryImages`) — raw `supabase.from('images').insert(...)`. Grep: zero references to `record_image_upload` / `business_tokens` / `token_ledger` anywhere under `src/`.
- **Root cause:** the token model (migration 043) was built for the web SPA only. Desktop publish predates it.
- **Owner decision (2026-06-08):** desktop uploads are **intentionally free** (owner/internal tool). So this is NOT a billing bug — no token trigger.
- **Remaining action (low):** only close the *bookkeeping* gap — `image_count` can drift because desktop inserts/deletes don't always reconcile (see P2 `image_count` drift). No token work. Document the "desktop = free, web = billed" rule so it isn't "fixed" by accident later.

### C2 — Password gate & client-code gate are client-side only ✅ (data model confirmed; secrets latent)
- **Where:** RLS `images_public_live_select` (`006_rls_policies.sql:94`, `063:138`) — anon SELECT on **all** images of any `status='live'` gallery, no token check. `_gallery_authz` (`041:127`) returns `true` whenever `signed_gate_enabled=false` (the only value in code). Bucket `gallery-images` is `public:true`. Code gate is `clientCodeInput === clientCode` in the browser (`App.tsx:1943`).
- **Confirmed live by probe:** anon reads full image lists + fetches original bytes with no auth header (HTTP 200). `businesses` rows (incl. `user_id`, `custom_domain_verification_token`), `clients` rows (names, `business_id`, `access_code_hash`), and `galleries.delivery_settings` (incl. your local file paths, and `password`/`clientCode` keys) are all anon-readable **right now**.
- **Latent vs live:** 0 galleries currently have a password or `signed_gate_enabled=true`, so no *gallery secret* is leaking today — but the cross-tenant graph + local paths leak now, and any password you set later is bypassable + its hash harvestable.
- **Root cause:** migration 041 (signed gate) and 057 (client auth) added token-checked RPCs *in parallel* to the original anon table policies, but never removed them or enabled the gate. The secure path was built and never turned on.
- **Fix (staged):** (a) `REVOKE SELECT(password_hash)` + whitelist safe columns on `galleries`/`businesses`/`clients`; (b) strip `password`/`clientCode` plaintext from `delivery_settings` (hashes already exist in columns); (c) `gallery_get_meta` whitelist keys + drop `'draft'` from allowed statuses; (d) route the code gate through `verify_client_code`; (e) long-term: private galleries' bytes move to a non-public bucket + signed URLs minted only after token validation.
- **Risk:** (a)-(d) low-medium and high-value. (e) high — touches every viewer read + a storage migration; stage carefully so 81 existing public galleries keep rendering.

### C3 — First gallery visit is a ~6s serial round-trip waterfall to Sydney ✅ (the "slow vs Pixieset" complaint)
- **Where:** `App.tsx:1127→1134→1282→1316` + `galleryClient.ts:120` — five dependent `await`ed reads, each ~1.2s RTT to ap-southeast-2: `get_business_by_slug` → `galleries.select('*')` → `gallery_get_meta` (redundant — step 2 already has the row) → `Promise.all(images, sections)` → N+1 dims query.
- **Plus C4:** `/api/gallery-page` shell (`api/gallery-page.ts:42`) does runtime `fetch('/')`+regex to discover the JS bundle → 2 *more* serial round-trips + hides the bundle from the preload scanner + serves `lang=en` with no RTL/Hebrew fonts (flash of wrong-direction text).
- **Root cause:** resolution treats slug→business→gallery→meta→images as 4 dependent reads; the bot-OG shell sits on the critical path for real browsers too.
- **Fix:** one SECURITY DEFINER `gallery_bootstrap(biz_slug, gallery_slug)` RPC returning meta + first image page + sections + dims in a single round trip (~6s → ~1.5s). Stop routing real browsers through `gallery-page` (let the rewrite fall to `index.html`; serve OG only to bots). Add `width`/`height` to `gallery_get_images` to kill the N+1.
- **Risk:** medium — new RPC + must preserve the password-gate "no images pre-unlock" branch and bot-OG unfurls.

### C5 — `069` revoke would break ALL settings edits ⚠️ NEEDS VERIFY (evidence: probably NOT applied)
- **Where:** `069_update_gallery_settings_rpc.sql` REVOKEs UPDATE on `galleries.delivery_settings`; web (`Dashboard.tsx:278,1172,1219,4571`) + desktop (`cloudUpload.ts:300,1683`) still write it directly.
- **Status:** the deploy handoff documents migrations applied **up to 067** (2026-05-30); 069/070/071/072 are later files whose application isn't recorded. You edit settings daily without them "snapping back" — strong evidence the REVOKE block was **not** applied. **Action:** confirm with `SELECT has_column_privilege('authenticated','galleries','delivery_settings','UPDATE');` before touching anything. If it returns `false`, this is an active P0 and the client conversion to `update_gallery_settings` RPC (web branch exists; desktop has none) must ship immediately.

---

## HIGH (P1)

### H1 — Welcome mosaic re-downloads up to 30 full-resolution originals (150MB+) behind the cover screen
`App.tsx:1623,1834` — `welcomeUrlMap` overrides the bounded `renderUrl` with the raw public original URL once it resolves. Fix: force `renderUrl(...640,55)` for the backdrop, never consult `welcomeUrlMap` for `storage_path`. Risk: low. **This actively defeats the "cover as loading buffer" trick.**

### H2 — Transient errors become permanent "Gallery not found" or a silent partial gallery
`galleryClient.ts:91,106` collapse every failure to `null`/`[]`. A network blip → "this gallery was removed" panel with no retry. Background pagination (`App.tsx:1398`) breaks the loop on a transient empty page → client sees 300 of 900 photos, no error. Fix: typed `{notFound}|{error}|{data}` results + retry/backoff (mirror what `SignedImg` already does). Risk: low.

### H3 — Web raw-filename / hash divergence → cross-platform photo deletion
`uploadPipeline.ts:164` uses raw `file.name` (Hebrew/spaces as storage keys) and hashes different inputs than desktop. A web-uploaded gallery later edited from desktop `updateGalleryImages` → every web row fails stem-match → falls into `removedRows` → **deleted from storage+DB and re-uploaded**. Fix: web must call the exported-but-unused `sanitizeFilename`; decide cross-platform hash policy. Risk: medium.

### H4 — Unbounded concurrency in the desktop removal path
`cloudUpload.ts:1189` — `Promise.all(removedRows.map(...))` fires face-delete+storage-remove+DB-delete per row simultaneously; removing 2000 photos overruns the connection pool, failures only logged, function still returns success. This is the exact bug the reorder/section code was patched against — the removal block a few lines up was never given the bounded-worker treatment. Fix: mirror the existing cursor+6-worker+retry pattern. Risk: low.

### H5 — `generate-captions.ts` is a fully open Claude proxy
`api/generate-captions.ts:25` — no auth, no origin gate, no rate limit. Anyone on the internet can POST and bill your Anthropic account. Fix: origin gate + session/JWT check + rate limit. Risk: low.

### H6 — AI endpoints authenticate on Origin/Referer only (bypassable)
`generate-feed.ts:286`, `generate-campaign.ts:263`, `plan-event.ts:176`, `score-images.ts:217` — a request with no Origin/Referer skips the whole gate; "ownership" is just a guessable `clientId`. Fix: absent-Origin = deny; require the `verify_client_token` session token. Risk: medium (confirm dashboard sends the header first).

### H7 — OG HTML injection in the primary gallery path
`api/gallery-page.ts:135` interpolates photographer-controlled `title`/`studioName`/`coverImageUrl` and `req.url` raw into bot HTML. `share.ts` was hardened with `escapeHtml`; `gallery-page.ts` wasn't. Fix: port `escapeHtml` + field whitelist. Risk: low.

### H8 — Stories render deadlock
`stories/render.ts:266` — a `maxDuration=300` timeout kills the function mid-render; the row stays `status='rendering'` forever, so that gallery+style can **never** render again. No staleness reaper. Fix: treat `rendering` rows older than ~6min as dead (mirror rekognition's lock-staleness pattern). Risk: low-medium.

### H9 — No CI, no test gate, no typecheck on deploy
No `.github/`. `build = vite build` skips `tsc`; `api/*.ts` are esbuild-transpiled with no typecheck. A type/contract break ships green. A Playwright suite exists but nothing runs it pre-deploy. Fix: GitHub Action running `tsc --noEmit` + Playwright smoke as a required check on `main`. Risk: low; high leverage.

### H10 — Desktop image delete doesn't prune sections
`store/gallery.ts:432` removes the id from `images` but never from `useSections` → dangling ids, inflated sidebar counts, wrong dirty-diff. Fix: `deleteImage` strips the id from every section. Risk: low.

### H11 — Reorder still fans out N parallel UPDATEs; RPC 070 unused
`Dashboard.tsx:1976,2006` — one PATCH per row; migration 070 (`reorder_images`) was built to replace this and is never called. Partial failure → UI/DB diverge with only a no-op toast. Fix: adopt the RPC (need a sections-reorder RPC too — only the images one exists). Risk: low-medium.

---

## MEDIUM (P2) — condensed

- **`record_image_upload` not idempotent** — lost-ACK retry double-charges + duplicate row. Needs unique index on `(gallery_id, original_path)` + `ON CONFLICT DO NOTHING`. (`uploadPipeline.ts:175`)
- **No token refund on delete** — web "delete + re-upload" double-charges; `'refund'` reason exists but is never called. Product decision. (`Dashboard.tsx:859`)
- **Web has no resumable (TUS) upload** — originals >~50MB silently fail; desktop handles them. (`uploadPipeline.ts:130`)
- **`image_count` drift** — desktop overstates on partial-fail; web computes from stale React state. Fix: DB row-count trigger. (`cloudUpload.ts:247`, `Dashboard.tsx:1853`)
- **065 `ON DELETE RESTRICT` breaks gallery deletion** ⚠️ — cascade into sections hits the RESTRICT FK on images; gallery delete aborts if it has photos. Fix: change FK to CASCADE (a section owns its photos) or NO ACTION. Confirm it actually fires before treating as urgent. (`065:78`)
- **Missing composite index** `images(gallery_id, section_id, sort_order)` — the hottest viewer query sorts in memory. (`005:66`)
- **Cron auth trusts spoofable `x-vercel-cron` header** — make `Authorization: Bearer ${CRON_SECRET}` the sole gate. (`retry-failed-sends.ts:57`)
- **SSRF in `watermark.ts:193`** — server-fetches photographer-controlled `logoUrl`, no host guard, follows redirects. Reuse `og.tsx`'s `probeLogo` allowlist. 
- **`append-event-posts` write auth advisory** unless `REQUIRE_CLIENT_SESSION_TOKEN=1` is set in env.
- **`stories/render` `process.chdir('/tmp')`** is process-global → concurrency race under Fluid Compute.
- **`client_page_settings` anon-write** (`018:36`) — any anon can deface a client's page (headline/logo) if the client has a live gallery.
- **`gallery_favorites` anon-DELETE** (`063:197`) — anon can wipe a client's photo selections.
- **`public_gallery_session` 500s (PR #156)** — unvalidated `x-forwarded-for` cast to `INET NOT NULL` throws on proxy values with port/list/zone. Normalize IP, default `0.0.0.0`.
- **Dashboard is one 6,920-line component, ~120 useState, 2 memo calls** — every keystroke/drag-over re-renders the whole editor + photo grid.
- **Async delete buttons lack in-flight guards** (`bulkDeleteSelected` etc.) — double-fire possible.
- **legacy-claim comparator mismatch** between `updateGalleryImages` (`.sort()`) and `updateGallerySectionsInCloud` (`.localeCompare`) — wrong-section assignment for legacy duplicate filenames.

---

## LOW (P2/P3) — noted, not urgent

Stories HEAD-checks serial (~6s); Viewer loads 2048px on mobile w/o `sizes`; deep-link to empty section renders blank; SectionNav counts use `images` not `visibleImages`; desktop ZIP path bypasses HEAD-checked URLs (`App.tsx:2267`); web images never capture width/height (CLS); single-image delete ignores DB-delete error; no zero-byte/HEIC validation (burns a token on a 0-byte file); `delivery_settings` leaks local filesystem paths; `duplicate_gallery` carries stale secrets + locks out password galleries; anon can inflate download/favorite counters; client-dashboard PIN is a sessionStorage flag; **067 missing from repo** (clean rebuild produces a broken DB — 068/069/071 depend on it); duplicate `062` migration number; 83 standing tsc errors in `src/renderer` (of which ~5 are real latent runtime crashes: preload-bridge methods `selectFile`/`getSystemUsername`/`choosePublishDir`/`publishSections` don't exist on the bridge; `QuestionnaireBuilder.tsx:244` undefined `id`).

---

## What checked out (verified sound — do NOT touch)
Web token deduction is race-safe (atomic `UPDATE…WHERE balance>0 RETURNING`); `add_tokens` service-role-only; today's section-reconcile fix is structurally correct; `deleteGalleryFromCloud` partial-failure handling is good; rekognition face-search auth + rate-limit + gate-check are solid; share-gallery is owner-only + rate-limited; webhook signature verify is timing-safe; SECURITY DEFINER RPCs pin `search_path` + check ownership; virtualization, hook-ordering discipline, iOS `100dvh`, and SignedImg retry are all correct.

---

## Needs YOUR verification (can't confirm from code)
1. `has_column_privilege('authenticated','galleries','delivery_settings','UPDATE')` → is 069 applied? (decides whether C5 is live)
2. Vercel env: `CRON_SECRET`, `REQUIRE_CLIENT_SESSION_TOKEN`, `STORIES_BUNDLE_URL`, `ANTHROPIC_API_KEY`.
3. Supabase function env: `LEMONSQUEEZY_WEBHOOK_SECRET`, `AWS_*`, `RESEND_API_KEY`, `IP_HASH_SALT`.
4. Whether desktop uploads *should* be billed (decides C1 fix shape).
5. Deployed edge-function versions vs repo HEAD.
