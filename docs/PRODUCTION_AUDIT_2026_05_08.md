# piXflow Production Audit — 2026-05-08

> **Status**: investigation complete · **No code changes made** · Awaiting prioritization decision before any fixes ship.
>
> **Method**: 5 specialized auditors (architecture, security, code/stability, performance/scale, database/storage/integrations) ran in parallel against `/Users/guysidi/gallery-flow`. Findings cross-validated; only items confirmed by ≥1 auditor with concrete file/line evidence are listed below.

---

## Top-line verdict

piXflow is **not production-ready for paying clients beyond the founder team**. The architecture, schema, and AI design are sound. The operational hardening — auth, RLS coverage, storage permissions, function timeouts, rate limits, observability — is missing or broken.

Two bombs sit live in production right now:

1. **Anyone with a browser can DELETE every photo in every gallery** via an unprotected storage policy.
2. **A single `curl` loop against any AI endpoint drains the Anthropic budget** with no rate limit, no auth, no per-business cap.

Beyond those: the public client dashboard's "PIN" gate is purely cosmetic, the AI endpoints are timing out in production unless the project is on Vercel Pro, every "save" the client makes from the public dashboard silently fails, and freshly-generated plans become invisible on refresh.

**Total findings**: 26 distinct issues across 9 buckets. **5 are production-blocking critical**, **8 are high-severity security/data**, **13 are stability / performance / UX / debt**.

**Estimated effort to reach "safe to charge clients"**: 2-3 weeks of focused security + ops work, blocking on no new features.

---

## Severity legend

| Symbol | Meaning |
|---|---|
| 🔴 **CRITICAL** | Active production risk. Could cause data loss, financial damage, or visible breakage today. Fix this week. |
| 🟠 **HIGH** | Will cause damage at scale or under specific user actions. Fix this month. |
| 🟡 **MEDIUM** | Real bug or risk; degrades the experience but isn't catastrophic. |
| ⚪ **LOW** | Worth knowing, not worth a sprint. |

---

## A. Critical production risks — ship blockers

### A1. 🔴 Anyone can DELETE every photo in production right now

**Source**: DB audit · **Effort**: 5 minutes (single SQL statement)

**Where**: Storage policy `anon_all_gallery_images` grants `ALL` (including `DELETE`) to `anon` role on bucket `gallery-images`. The newer `gallery_storage_owner_write` policy is **shadowed** because Postgres OR-merges policies — once an `ALL` policy exists for a role, narrower policies don't constrain it.

**Exploit** (3 lines, any browser console, public anon key from `gallery-web/src/supabase.ts:4`):
```js
fetch('https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/gallery-images/<any-path>',
  { method: 'DELETE', headers: { apikey: '<anon-key>' } })
```
Same applies to `anon_all_gallery_stories` for the stories bucket.

**Risk**: total data loss for every paying client.

**Fix**: drop both `anon_all_*` policies. The existing `_owner_write` and `_public_read` policies remain and are sufficient. SQL-only, no code change, no UI impact.

---

### A2. 🔴 AI endpoints timing out in production (or about to)

**Source**: Performance audit · **Effort**: 5 lines per endpoint

**Where**: Vercel Hobby tier defaults function `maxDuration` to **10 seconds**. None of the AI functions (`generate-feed.ts`, `score-images.ts`, `plan-event.ts`, `generate-campaign.ts`, `append-event-posts.ts`) have an explicit `export const maxDuration`. Their actual runtimes: 25-90 seconds.

**Risk**: every AI generation 504s for a fresh user (cold start) on Hobby tier. If we're on Pro this is fine — verify the plan tier. If not, the entire creative engine is broken in production and we just haven't hit it because we're warming the functions during testing.

**Fix**: add `export const maxDuration = 60` (or 90) to all 5 AI files.

---

### A3. 🔴 AI endpoints fully unauthenticated — anyone can drain Anthropic

**Source**: Architect + Security audits · **Effort**: 1 day for proper fix; 30 minutes for stopgap

**Where**: `/api/score-images`, `/api/generate-feed`, `/api/plan-event`, `/api/append-event-posts`, `/api/generate-campaign`. All accept any `clientId` from a POST body, validate "does the client exist", proceed with service-role. There is no signed token, no `Origin` check, no `Referer` check, no rate limit, no per-business spend cap.

**Exploit** (cost amplification):
```bash
for i in $(seq 1 1000); do
  curl -d '{"clientId":"<any>"}' /api/score-images &
done
```
Burns ~$300-500/hour of Anthropic credits.

**Worse exploit** (content injection): `/api/append-event-posts` lets a stranger inject defamatory captions into any client's `feed_plans`. If the photographer publishes "as-is" to Instagram, the attacker has just defamed the client through your platform.

**Risk**: financial drain (Anthropic bill), reputation, content injection through the photographer's IG.

**Fix**:
- **Stopgap (today, 30 min)**: add `Origin` allowlist (`pixflow-ai.com` + Vercel preview pattern) as a 5-line guard at the top of each handler.
- **Proper (this week)**: signed `clientId` token issued by a tiny `/api/client-session` endpoint when the access code matches; verify in handlers. Add per-IP and per-business spend caps.

---

### A4. 🔴 Every save in the public client dashboard silently fails

**Source**: Architect + Code + DB audits (3 independent confirmations) · **Effort**: 1 day

**Where**: `gallery-web/src/components/FeedStudio.tsx:377-410` calls `supabase.from('feed_plans').update(...)` directly with anon key. The `feed_plans_owner_update` policy is `FOR UPDATE TO authenticated` only.

**Why it's silent**: Supabase returns `{ data: null, error: null }` for RLS-blocked updates (no rows match the policy = no rows updated, but no error). The optimistic UI shows success → reload = data gone.

**Affects**: choosing a variant, editing a caption, replacing a photo, scheduling, marking "published" — every action a paying client takes inside Feed Studio when accessed via `/<biz>/c/<slug>`.

**Risk**: the customer who's trying out the AI Visual OS — exactly the moment that defines retention — sees their work evaporate.

**Fix**:
- **Stopgap (1 hour)**: append `.select('id').single()` after each update so RLS-block becomes a visible 0-rows result the code can detect.
- **Proper**: route all `feed_plans` writes through service-role API endpoints (mirroring the existing `/api/append-event-posts` pattern).

---

### A5. 🔴 Generated plans (`status='draft'`) invisible to anon — they vanish on refresh

**Source**: Code audit · **Effort**: schema decision + small code change

**Where**: `gallery-web/api/generate-feed.ts:563` writes new plans with `status: 'draft'`. The anon SELECT policy on `feed_plans` is `status IN ('accepted','published')`. After generation, FeedStudio re-fetches via the load effect → returns nothing. The plan exists in DB but is invisible to the same client that just created it.

**Repro**: Generate → land on workspace → refresh page → empty state again. The plan exists in the DB, the user can't see it.

**Risk**: photographer demonstrates the AI Visual OS at a meeting, looks great, refreshes → "where did my plan go?". Confidence-killer.

**Fix**: change the anon SELECT policy to also include `'draft'` rows where the caller can prove ownership via session token (depends on A3 fix). Quick fix until then: keep the plan in `sessionStorage` as a fallback.

---

## B. Security risks (high — fix before scale)

### B1. 🟠 `clientCode` "auth" is theater — anon-readable plaintext PIN

**Where**: `gallery.delivery_settings.clientCode` (a JSONB field) read via `pages/ClientDashboard.tsx:217`.

**Why broken**: galleries allow `anon SELECT` for `status='live'`. The PIN is in the same network response that powers the gate UI. Three lines of JS in devtools:
```js
fetch('https://vlyiqfawkrjvqcmkpfvs.supabase.co/rest/v1/galleries?client_id=eq.<id>&status=eq.live&select=delivery_settings',
  { headers: { apikey: ANON } }).then(r => r.json()).then(d => console.log(d[0].delivery_settings.clientCode))
```
Then `sessionStorage.setItem('client-dash-<id>', 'true')` bypasses the gate.

**Fix**: mirror migration 041's gallery-password pattern — move PIN to hashed column on `clients`, expose a `verify_client_code(client_id, code)` SECURITY DEFINER RPC with attempt counter + cooldown, gate the dashboard's data SELECTs on a session token.

---

### B2. 🟠 `gallery-images` bucket is fully public — including original-resolution photos

**Where**: bucket configured `public: true` (`setup-storage.sql`), policy `gallery_storage_public_read` permits anon SELECT for any object whose first path segment is a `live` gallery id.

**Why dangerous**: path conventions follow `<gallery_id>/originals/<filename>`, `<gallery_id>/web/<filename>`. Original filenames are preserved → enumerable. Anyone who learns a gallery_id (and `share.ts`/`og.tsx` both reveal it for OG) can directly fetch full-resolution originals **without** going through any password gate, signed-token gate, or client PIN gate.

The image-table-level signed-gate from migration 041 protects `images` rows but **does not** protect the underlying storage objects.

**Fix**: switch `gallery-images` to private. Serve thumbnails via short-lived signed URLs through a server endpoint that checks the gate. Originals must require the gate token. Touches all 47 `<img src={storageUrl(...)}>` sites.

---

### B3. 🟠 Cross-client data leakage within same business

**Where**: RLS on `galleries`/`images` is `WHERE status='live'`. There is **no** scoping by `client_id`.

**Risk**: any anon caller knowing a gallery slug or UUID can fetch images for any other client of the same (or any) business. "Client isolation" relies entirely on URL obscurity + the bypassable PIN (B1). Once Client B obtains Client A's URL or slug, they can navigate and act as them.

**Fix**: tie public reads to a session token issued by `verify_client_code(client_id, code)`; gate all anon SELECTs on that token.

---

### B4. 🟠 `capture-lead.ts` allows arbitrary Twilio SMS through your account

**Where**: `gallery-web/api/capture-lead.ts`.

**Why dangerous**: accepts any `event_id` + arbitrary phone numbers, dispatches Twilio SMS. No captcha, no per-IP rate limit, no proof the requester is at the event. The unique `(event_id, phone)` constraint only stops repeat-spam from the same victim from the same event.

**Risk**: an attacker can use your account to send spam SMS to any Israeli mobile, putting your sender ID on carrier spam lists + draining the Twilio budget.

**Fix**: add Cloudflare Turnstile / hCaptcha on `EventCapturePage`, plus per-IP rate limit (5/minute), plus per-event total cap (e.g. 500 leads/day).

---

### B5. 🟠 Photographer JWT in `localStorage` — XSS = full account takeover

**Where**: default Supabase JS setup (`gallery-web/src/supabase.ts:6`).

**Why dangerous**: any XSS on `pixflow-ai.com` (or on a custom domain a photographer adds via migration 049) leaks the full session JWT + refresh token. Attacker gets full read/write to the photographer's businesses, galleries, images, and tokens. No httpOnly cookie session, no IP/UA pinning, no CSP. Sentry is loaded — third-party JS is in scope of any session-stealing bug.

**Fix**: configure `@supabase/ssr` with httpOnly cookies, tighten CSP, add session-rotation hooks that invalidate refresh tokens on logout from all devices.

---

### B6. 🟡 Several anon-writable surfaces beyond `feed_plans`

| Table | Issue |
|---|---|
| `client_page_settings` | Anon can UPDATE the client's portfolio page (logo, color, headline). |
| `vendors` | Anon SELECT returns plain-text `access_code` for every vendor in every business. |
| `gallery_hidden_images` | Anon can INSERT/DELETE on any live gallery — vandalism vector. |
| `gallery_favorites` | Same vandalism vector. |
| `image_ai_scores` | Anon SELECT is `USING (true)` — leaks AI rationales for private galleries' photos. |

---

### B7. 🟡 `share.ts` leaks `delivery_settings` JSONB to social-card crawlers

**Where**: `gallery-web/api/share.ts:67-83`.

Anything in `delivery_settings` (including studio's internal phone, notes, **clientCode**) can leak via OG meta tags to Slack/WhatsApp/Twitter previews. The endpoint doesn't whitelist fields.

**Fix**: emit only `studioName`, `galleryTitle`, `galleryDescription` to OG. Drop everything else.

---

## C. Stability risks

### C1. 🟡 Upload failures leave orphan storage objects

**Source**: DB audit
**Numbers**: 4,655 orphan files = 2.5GB / 18% of bucket today. No reaper job.

Storage objects are uploaded BEFORE the DB row is created in `record_image_upload`. If the RPC fails, files stay forever. Will reach ~25GB of pure waste at 10× scale.

**Fix**: weekly orphan sweeper, OR switch to RPC-first (allocate row + reserve token, then upload to returned paths).

---

### C2. 🟡 Mid-upload JWT expiry surfaces as "file failed"

**Where**: `gallery-web/src/pages/Dashboard.tsx:533-577`.

After 1 hour idle, photographer's JWT expires. `uploadOne` catches the 401 as a generic per-file error → user sees "50 photos failed" with no auth hint, retries indefinitely.

**Fix**: detect 401/JWT-expired in `uploadOne` and trigger a re-auth flow (or refresh the session) before continuing the batch.

---

### C3. ⚪ Concurrent `score-images` calls double-bill Anthropic

Two parallel calls for same client both pass the "skip cached" check, both run scoring, both upsert. Idempotency ignores duplicates but the LLM tokens are already burned.

**Fix**: Postgres advisory lock keyed on `client_id`, or `scoring_in_progress_at` column with TTL.

---

### C4. 🟡 Wizard double-submission inserts duplicate plans

Two clicks on "תכנן" within 10 seconds → two `feed_plans` rows inserted. Latest wins, the other orphans (~$0.20 each in wasted Anthropic).

**Fix**: row-level lock keyed by `client_id` while a draft is in flight.

---

### C5. 🟡 `image_count` cache is wildly stale

9+ galleries report `image_count` of 92-1,065 while having **0 actual images**. Trigger fires on download, not on delete.

**Fix**: rebuild via `recompute_image_count()`, or replace with a view.

---

### C6. 🟡 No concurrent-edit lock anywhere

Two photographers editing the same gallery's `delivery_settings` = last-write-wins, no warning, no version conflict UI.

---

### C7. ⚪ Story upload race on sub-millisecond double-click

`Date.now().toString(36)` is deterministic on collision → second upload overwrites first storage object but inserts new row → 2 rows pointing to 1 file.

**Fix**: append `crypto.randomUUID().slice(0,6)` to the style tag.

---

### C8. 🟡 Anthropic calls have no retry/backoff/idempotency

Single 5xx from Anthropic = visible 502 to user. No exponential backoff, no rate-limit handling, no idempotency key.

---

## D. Performance & scale risks

### D1. 🟠 Main bundle: 885KB, all routes eager-imported

`main.tsx` statically imports all 12 pages. Even the public landing ships the entire 4799-line photographer Dashboard.

**FCP on 4G mobile**: 2.5-3.5 seconds.

**Fix**: lazy-load each route in `main.tsx` (1-day refactor). Expected FCP drop to <1.2s, main chunk to ~150KB gzipped.

---

### D2. 🟠 ClientDashboard fetches every photo of every gallery on load

**Where**: `pages/ClientDashboard.tsx:232-233` does `supabase.from('images').select(...).in('gallery_id', ids)` with **no LIMIT**.

**At scale**: 50 galleries × 1000 photos = 50k rows downloaded on every dashboard load, ~10MB JSON / 10MB Supabase egress per page view.

**Fix**: only fetch `allImages` lazily when the user opens a specific gallery's deep-dive; on load, keep only `topPicks` + `covers` + `stories`.

---

### D3. 🟠 `feed_plans.posts` JSONB rewrite scaling timebomb

JSONB column rewrites the whole row on every edit; once size > ~2KB Postgres TOAST-stores the blob.

**At scale**: rolling mode over 6 months × 4 events/month × ~5 posts/event = ~120 posts ≈ 500KB row. TOAST bloat, 200ms+ writes, autovacuum can't reclaim TOAST efficiently.

**Fix**: split `posts` into a separate `feed_plan_posts` table with one row per post (the `id` field already exists per post). Atomic per-post updates instead of whole-blob rewrites.

---

### D4. 🟡 `score-images` caps at 40 photos silently

`MAX_BATCHES = 5`. Silent ceiling — endpoint returns `truncated_at_5_batches:N_skipped` but the FeedStudio UI never displays it.

**At scale**: client with 600 top picks → 560 never get scored. Photographer thinks "scoring covered everything" but only first 40 by `sort_order` made it.

**Fix**: queue-based scoring (Vercel Cron + Upstash Queue) processing 40 at a time across multiple invocations.

---

### D5. 🟡 EventPlan triggers full client-wide rescoring per event

Each "Plan event" click runs scoring against every top pick in every live gallery for that client. Idempotent — but 32 round-trips × ~2s of cache check each, just to confirm "all cached".

**Fix**: track scoring state on `clients.last_scored_at` or pass `galleryId` to scope the operation to the just-uploaded gallery.

---

### D6. 🟡 64 simultaneous photo compositions in CreativeEngineDialog → mobile OOM

`CreativeEngineDialog` shows 4 directions × ~16 compositions = 64 photo+overlay combos. At 1024px web previews × 64 ≈ 50-80MB JPEG decode buffer. iPhone 12 has ~1.4GB JS heap budget, ~250MB safe for images. Mid-range Android (3GB RAM) can OOM-crash the page.

**Fix**: paginate or virtualize the direction grid (show 1 direction at a time, lazy-mount the others); add `loading="lazy"` to all CreativeRenderer + GalleryDeepDive `<img>` tags.

---

### D7. 🟡 Render-blocking Google Fonts `@import` inside React component

`CreativeEngineDialog.tsx:207` injects `@import url('https://fonts.googleapis.com/...')` at runtime → 4 round-trips on every dialog open, blocks text render.

**Fix**: move to `<link rel="preconnect">` + `<link rel="stylesheet">` in `index.html`, or self-host.

---

### D8. ⚪ Public gallery N+1 on stories HEAD checks

`App.tsx:1140-1180` does sequential HEAD fetch per story (8 stories = 1.2s sequential). ClientDashboard has the `Promise.all` fix; App.tsx does not.

---

### D9. ⚪ `feed_plans` system-prompt cache_control marker is dead weight

Each brief is unique → cache hit rate ~0%. Comment claims 22% saving but that applies to `score-images` (where SYSTEM is identical), not `generate-feed`.

---

### D10. ⚪ Storage egress is the cost wall, not AI

At 1000 clients projected: ~$8,650/month total, of which **$4,500 is Supabase egress**.

**Fix path**: Bunny.net or Cloudflare R2 proxy in front of `gallery-images`, or Vercel Image Optimization rewrite.

**Cost projections (current Anthropic + storage prices)**:

| Tier | Clients | AI/month | Storage | Egress | Vercel | Total |
|---|---|---|---|---|---|---|
| Today | 12 | $20 | $25 | $30 | $0 (Hobby) | ~$75 |
| 50 clients × 4 events/mo | 50 | $80 | $100 | $150 | $20 (Pro) | ~$350 |
| 200 clients | 200 | $320 | $500 | $750 | $20 | ~$1,600 |
| 1000 clients | 1000 | $1,600 | $2,500 | $4,500 | $50 | ~$8,650 |

At 5,000₪/mo per client × 200 = 1M₪ MRR vs $1.6k operational spend → margins are healthy. The cost wall is egress, not AI.

---

## E. UX-breaking bugs (visible to users today)

### E1. 🟠 Mobile users can't favorite or download from the gallery grid

Per-tile heart and download buttons are CSS `:hover`-only (`opacity:0` until hover). Phones have no hover. The whole "quick tap to favorite" UX is broken on the device clients actually use.

**Fix**: show buttons always on touch devices (`@media (hover: none)`).

---

### E2. 🟠 Stories are recorded as WebM — don't play on iOS

`StoryGenerator.tsx:74,146` records `video/webm`. Safari iOS doesn't play WebM/VP9 reliably. Photographer generates story in Chrome, client opens on iPhone → black tile or "format not supported" dialog.

**Fix**: server-side transcode to MP4/H.264 before serving; or record MP4 directly via `MediaRecorder` if browser supports it.

---

### E3. 🟠 iPhone HEIC uploads fail silently mid-batch — tokens still debited

`createImageBitmap(file)` rejects HEIC on iOS Safari. File picker accepts `image/*` so iOS users dump 200 HEIC files → ~150 fail with cryptic canvas errors → token balance drops → alert just says "150 תמונות נכשלו". To the customer this looks like fraud.

**Fix**: detect HEIC client-side, refund token on failure, surface a clear "iPhone photos must be HEIC-converted" message.

---

### E4. 🟠 OG images can't render Hebrew → WhatsApp previews show boxes

`api/og.tsx` font stack has no Hebrew font that Vercel Edge can load via `@vercel/og`/Satori. WhatsApp link previews are the #1 way galleries get distributed at events. Hebrew titles render as box-glyphs.

**Fix**: bundle a Hebrew font (Heebo) into the OG endpoint via `@vercel/og`'s `fonts` option.

---

### E5. 🟡 ClientDashboard treats "no galleries yet" as English error

`pages/ClientDashboard.tsx:213` returns `setError('No galleries found')`. First-time client sees a hard-coded English error inside an RTL Hebrew shell.

---

### E6. 🟡 ~15 `alert('שגיאה: ' + error.message)` calls show raw English DB errors

PostgREST/Supabase errors come back in English ("new row violates row-level security policy"). Hebrew-speaking photographer sees raw English DB error inside a Hebrew alert.

**Fix**: error mapper that translates common Supabase errors to Hebrew; toast component that doesn't expose raw error text.

---

### E7. 🟡 Lightbox swipe collides with pinch-to-zoom

`Viewer.tsx:79-92` adds window-level `touchstart`/`touchend` listeners. A two-finger pinch ends with fingers far apart on x → triggers phantom prev/next. No `touch-action`, no regional cancellation.

---

### E8. 🟡 PortfolioPage mosaic dedup is `mosaicPool[length % length]` (always 0)

`pages/PortfolioPage.tsx:148,166`. `x % x === 0` → always returns index 0 → produces 28+ duplicates of the first photo when padding to 30.

---

### E9. 🟡 Top-pick toggle in client dashboard never persists

`togglePick` only mutates local `selectedPicks: Set<string>` state. Refresh = all selections vanish.

**Fix**: either rebrand the action ("selection for download" — no DB write) or write through to a `client_selected_images` table.

---

### E10. 🟡 Refresh mid-upload = silent abort, no warning

Tokens debited stay debited, partial upload dies, no `beforeunload` handler.

---

## F. AI system weaknesses

### F1. 🟡 `slide_meta` index validation missing in generate-feed

LLM-hallucinated index → `image_id = ''` → `/storage/.../` returns 404 → broken image in UI. Carousel slide-captions throw on bad index; story `slide_meta` does not.

---

### F2. 🟡 "Wrong variant count" guard rejects perfectly usable plans

If the LLM returns 4 variants instead of 3 (or names a fourth as a riff), the entire generation is failed with status 502. We lose 12 seconds of Anthropic time.

**Fix**: `variantsRaw.slice(0, 3)` with a soft warning, not a hard 502.

---

### F3. 🟡 `slide_caption.image_index` can reference photo NOT in the variant

Validator only checks the index resolves to *some* image. LLM can attach a slide caption to a different photo than what's in the slide → visual drift, no error.

---

### F4. 🟡 `plan-event` uses `variants[0]` when `chosen_variant_id` is unset

Could feed Claude "rolling rhythm" context from the wrong variant the photographer rejected.

---

### F5. 🟡 JSON validation gaps return raw LLM output as `tail` in error response

Leaks partial prompt contexts to attackers probing for prompt-injection vectors. Also: HTML/control chars in captions get stored verbatim — stored-XSS sink potential if anything renders captions with `dangerouslySetInnerHTML` downstream.

---

### F6. ⚪ No idempotency keys on Anthropic calls

Network retry mid-call = double charge on Anthropic.

---

## G. Technical debt (not user-visible but dangerous)

| ID | Item | Why it bites |
|---|---|---|
| G1 | No global ErrorBoundary | Stale CDN chunk after deploy = white-screen during meeting |
| G2 | Dashboard.tsx (4799 lines) and ClientDashboard.tsx (1157) duplicate gallery rendering | Schema changes touch both files |
| G3 | URL parsing duplicated 5× across pages | Every new URL pattern requires 5 edits |
| G4 | `TopPick` interface drift across 5 files | Refactors silently lose fields |
| G5 | ClientDashboard slug-resolution effect won't re-run on intra-SPA nav | Dormant bug, explodes when router lands |
| G6 | `authenticated` reads sessionStorage with stale clientId on first render | Slug-URL users always face the gate |
| G7 | No `pg_stat_statements` enabled | No query performance baseline |
| G8 | Dead schema: `client_page_settings`, `vendors`, `gallery_email_log`, `gallery_password_attempts`, `gallery_unlock_tokens` (all 0 rows) | Schema bloat costs review/audit time |
| G9 | `galleries.client_id` is nullable, no FK; 31/94 galleries are orphans | This is why we have 2 "Promarket" clients |
| G10 | No Sentry on API routes — server-side LLM failures invisible except in Vercel logs | Silent production fires |
| G11 | No JSONB schema versioning on `feed_plans.posts` | Contract evolution breaks old rows |
| G12 | 12-function Vercel Hobby cap permanently maxed | Any new endpoint requires consolidation refactor or Pro upgrade |

---

## H. Safe quick fixes (each <1 day, low risk)

1. **Drop `anon_all_gallery_images` and `anon_all_gallery_stories` storage policies** (A1) — single SQL statement, fixes the data-loss bomb. Verify no legacy tooling depends on them first.
2. **Add `export const maxDuration = 60` to all 5 AI endpoints** (A2) — 5 lines per file.
3. **Add `Origin` allowlist guard to all AI endpoints** (A3 stopgap) — 5-line guard per handler.
4. **Append `.select('id').single()` to all FeedStudio updates** (A4 stopgap) — turns silent RLS-block into visible error so we at least know it's failing.
5. **Add `loading="lazy"` to CreativeRenderer + GalleryDeepDive `<img>` tags** (D6) — single attribute change, prevents mobile OOM.
6. **Move Google Fonts import from CreativeEngineDialog to index.html** (D7) — removes render-blocking external dep on hot path.
7. **Promise.all the stories HEAD checks in App.tsx** (D8) — 1-line refactor.
8. **Add global `<ErrorBoundary>` in main.tsx** (G1) — 30 lines, prevents white-screen on chunk-load failure.
9. **Whitelist fields in share.ts before emitting OG meta tags** (B7) — drops `clientCode` leak via OG.
10. **Drop `tail: ...` from LLM error responses in production** (F5).
11. **Replace `mosaicPool[length % length]` with proper modulo** (E8) — typo fix.
12. **Add `URL.revokeObjectURL` after blob downloads** (mobile memory leak).
13. **Reset `documentElement.dir = 'rtl'` in error states** (RTL leak in error pages).
14. **Add `loading="lazy"` to all gallery `<img>` tags** that don't have it (16 of 47).

---

## I. Dangerous fixes — require staging + thorough testing

| Item | Why dangerous |
|---|---|
| Full `feed_plans` write-path migration to service-role API endpoints (A4 real fix) | Affects every save in the public client dashboard. Must test all states (variant pick, edit, replace, schedule, status). |
| `clientCode` hash migration + signed-token gate (B1) | Affects all live client dashboards. |
| Switch `gallery-images` to private bucket + signed URLs (B2, A5) | Touches 47 image render sites + viewer + downloads. |
| Split `feed_plans.posts` JSONB into table (D3) | Schema migration on production data; renderer must handle both shapes during rollout. |
| Surface Rekognition errors instead of `void supabase.functions.invoke().catch(console.warn)` | Photographer will start seeing errors they previously didn't — could appear as a regression. |
| Drop dead `anon_all_*` policies (A1) | Mostly safe, but verify no legacy tooling depends on them. |

---

## Recommended fix order

### Day 0 (today, 1-2 hours)
1. **A1** — drop the storage anon-ALL policies (DB).
2. **A2** — add `maxDuration` to AI endpoints.
3. **A3 stopgap** — Origin allowlist on all AI endpoints.

### Days 1-2
4. **A4 stopgap** — `.select` after updates so silent failures become visible.
5. **A4 real fix** — route Feed Studio writes through service-role endpoints.

### Week 1
6. **B1** — `clientCode` hash + verify RPC + session token (depends on A3 proper fix).
7. **B2/A5** — private bucket + signed URLs.
8. **G1** — ErrorBoundary.

### Week 2
9. **A5** — draft visibility for owning client.
10. **C1** — orphan-storage reaper.
11. **D1** — lazy-load routes in main.tsx.
12. **D6** — `loading="lazy"` on all `<img>` tags.

---

## What we should NOT do until the above ships

- Open the platform to new paying clients beyond the founder team.
- Share client dashboard URLs over WhatsApp/SMS publicly.
- Market the AI Visual OS to production-company prospects.
- Add a 13th Vercel function (will silently kill an existing one).
- Trust any "save" action that the customer takes from the public client dashboard.

---

## Surprising things (worth knowing)

- **Face recognition implementation is exemplary.** `supabase/functions/rekognition/index.ts` (625 lines). Privacy isolation per-gallery, attempt limits, stale-lock window. Use this as a template for hardening other endpoints.
- **`og.tsx` error handling is exemplary** — always falls back to a branded image, never 500s. Use as template for `share.ts` and `gallery-page.ts`.
- **The schema is structurally sound** — RLS enabled everywhere, FK cascades mostly correct, indexes cover the obvious paths, migration history is healthy. The bugs are in the operational layer, not the data model.
- **The `feed_plans` JSONB approach was right for v0** but won't survive the rolling-mode growth. The split-into-rows refactor is the most important schema change to plan.

---

## File references (absolute paths, for any future fix work)

```
/Users/guysidi/gallery-flow/gallery-web/src/main.tsx
/Users/guysidi/gallery-flow/gallery-web/src/App.tsx
/Users/guysidi/gallery-flow/gallery-web/src/supabase.ts
/Users/guysidi/gallery-flow/gallery-web/src/sentry.ts
/Users/guysidi/gallery-flow/gallery-web/src/pages/ClientDashboard.tsx
/Users/guysidi/gallery-flow/gallery-web/src/pages/Dashboard.tsx
/Users/guysidi/gallery-flow/gallery-web/src/components/FeedStudio.tsx
/Users/guysidi/gallery-flow/gallery-web/src/components/CreativeRenderer.tsx
/Users/guysidi/gallery-flow/gallery-web/src/components/CreativeEngineDialog.tsx
/Users/guysidi/gallery-flow/gallery-web/src/components/GalleryDeepDive.tsx
/Users/guysidi/gallery-flow/gallery-web/src/components/EventPlanDialog.tsx
/Users/guysidi/gallery-flow/gallery-web/src/components/StoryGenerator.tsx
/Users/guysidi/gallery-flow/gallery-web/src/components/StoryPlayer.tsx
/Users/guysidi/gallery-flow/gallery-web/src/lib/uploadPipeline.ts
/Users/guysidi/gallery-flow/gallery-web/api/score-images.ts
/Users/guysidi/gallery-flow/gallery-web/api/generate-feed.ts
/Users/guysidi/gallery-flow/gallery-web/api/plan-event.ts
/Users/guysidi/gallery-flow/gallery-web/api/append-event-posts.ts
/Users/guysidi/gallery-flow/gallery-web/api/generate-campaign.ts
/Users/guysidi/gallery-flow/gallery-web/api/capture-lead.ts
/Users/guysidi/gallery-flow/gallery-web/api/share.ts
/Users/guysidi/gallery-flow/gallery-web/api/og.tsx
/Users/guysidi/gallery-flow/supabase/migrations/006_rls_policies.sql
/Users/guysidi/gallery-flow/supabase/migrations/007_storage_policies.sql
/Users/guysidi/gallery-flow/supabase/migrations/041_signed_gate_tokens.sql
/Users/guysidi/gallery-flow/supabase/migrations/051_feed_plans.sql
/Users/guysidi/gallery-flow/supabase/migrations/052_image_ai_scores.sql
```
