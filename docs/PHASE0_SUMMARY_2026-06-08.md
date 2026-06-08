# Phase 0 — Tech Lead Summary (2026-06-08)

5 specialized agents investigated (read-only, lane-isolated, no code changed): Client Gallery Performance, Backend/API, Database, Security, QA/Tests. I (Tech Lead) verified the conflicting/open points myself with live anon probes + a local typecheck. Below is the merged result in the 5 sections you asked for, then the proposed Phase 1 scope. **No code touched. Awaiting your approval to start Phase 1.**

---

## 1. What is CONFIRMED

**Gallery first-load is a ~5.4s serial waterfall** (the real "slow vs Pixieset" complaint). Exact sequence mapped, each ~1.2s RTT to Sydney:
`get_business_by_slug` → `galleries.select('*')` → `gallery_get_meta` (redundant — step 2 already has the row) → `Promise.all(images, sections)` → optional dims query. (App.tsx:1127,1282,1316; galleryClient.ts:88,100,121)

**Plus one extra browser round-trip from the API shell.** For real browsers, `/api/gallery-page` returns a static HTML shell whose inline script does `fetch('/')`+regex to *discover* the JS bundle → 1 extra serial round-trip + the bundle is invisible to the preload scanner + `lang=en` (mild RTL/font flash). (api/gallery-page.ts:21-50; vercel.json)

**Cover screen can download full-resolution originals (H1 — confirmed).** The welcome mosaic's `welcomeUrlMap` resolves `storage_path` to the raw public original and overrides the bounded `renderUrl` fallback → up to ~30 originals (tens of MB) fetched behind the cover. (App.tsx:1623-1635,1834)

**Transient errors are swallowed (H2 — confirmed, 3 modes).** `galleryClient.ts:91,106` collapse every failure to `null`/`[]` with no retry: (a) meta fail → permanent "Gallery not found", no retry button; (b) first-page fail → empty gallery, no error; (c) background pagination fail → **silent cap at 300 of N photos**. (App.tsx:1398-1405)

**Sensitive/unnecessary fields reach anon clients — and one is leaking RIGHT NOW:**
- `gallery_get_meta` returns the **full `delivery_settings`** incl. plaintext `clientCode` and local file paths. **Probe: 1 live gallery currently has a `clientCode` set and anon-readable; 57 of 80 live galleries leak `/Users/guysidi/...` filesystem paths.** Password: 0 set (so the password leak is latent; the clientCode + path leak is live). (041:181)
- `gallery_get_images` returns **~10 internal columns** to anon that the viewer never needs: `face_index_error`, `original_failed_reason`, `upload_status`, `original_upload_method`, `*_size_bytes`, `face_index_attempts`. Payload bloat + minor info leak.
- `businesses` is anon-readable incl. `user_id` + `custom_domain_verification_token` (token null today). (006)

**Password gate is client-side only (C2 — confirmed).** 0/81 galleries have `signed_gate_enabled=true`; anon reads all live-gallery images + bytes (public bucket) with no token. Latent today (nobody uses passwords) — real the moment one is set.

**`generate-captions` is an open Claude proxy (H5 — confirmed).** No auth/origin/rate-limit; anyone can bill your Anthropic account. (api/generate-captions.ts:25) — **out of Phase 1 scope**, flagged for Phase 2.

**No CI / no typecheck gate (H9 — confirmed).** `build = vite build` skips `tsc`. **And `tsc` on `main` currently FAILS: 2 duplicate `previewShareEmail` declarations in Dashboard.tsx (1679, 1706)** — vite ignores it, tsc doesn't. This must be fixed before a typecheck gate can pass.

**There IS an existing Playwright e2e suite** (`gallery-web/tests/e2e`, 6 specs + auth/gallery fixtures + `npm run test:e2e`). Phase 1 builds on it, not from scratch.

---

## 2. What is NOT confirmed (needs production info)

- **Migration 069 applied?** Can't check column privileges anonymously. Evidence says NOT applied (you edit settings daily without failure; deploy handoff only records through 067). **One command from you settles it** (§4).
- **Edge-function deployed versions** vs repo HEAD — only visible in the Supabase dashboard.

---

## 3. What DIFFERS from the original audit (corrections)

1. **`gallery_get_images` already returns `width` & `height`** (probe-confirmed). The original audit's DB pass said it didn't. → The N+1 dims query (galleryClient.ts:121) is only a *fallback for rows whose stored dims are null* (web-uploaded images never captured dims), **not** because the RPC omits the column. **Impact: the bootstrap RPC doesn't need to add dims — cheaper than thought.**
2. **The browser `gallery-page` path makes NO Supabase calls** — it's a static shell. The cost is purely the `fetch('/')` bundle-discovery round-trip, fixable with a conditional `vercel.json` rewrite (browsers → `index.html`, bots → `gallery-page`). Cleaner than rewriting the function.
3. **The clientCode leak is LIVE, not latent** — 1 real gallery exposes a plaintext code to anon right now; 57/80 leak local paths. The audit treated this as mostly latent.

---

## 4. What requires a command from YOU

**One read-only SQL** (run in Supabase SQL editor — safe, read-only) to settle whether 069 is applied:
```sql
SELECT has_column_privilege('authenticated','galleries','delivery_settings','UPDATE');
```
- `true` → 069 NOT enforced (expected). Phase 1 proceeds normally.
- `false` → 069 IS applied → settings edits are already broken on web+desktop → that jumps the queue ahead of Phase 1.

Everything else I verified myself via anon probes — no other command needed to start Phase 1.

---

## 5. Is Phase 1 safe to start?

**Yes** — with two notes:
- The DB portion (new `gallery_bootstrap` RPC + a `CREATE OR REPLACE` of `gallery_get_meta` to whitelist fields + an optional `CREATE INDEX CONCURRENTLY`) is **non-destructive** (no DROP, no data change, additive/replace-in-place) but still needs your explicit approval and you apply it (manual migrations). I'll give you the exact SQL to review first.
- I recommend a 1-line pre-step: delete the duplicate `previewShareEmail` so `tsc` passes — otherwise we can't add the typecheck safety net later.

---

## Proposed Phase 1 scope (for your approval — NOT yet implemented)

Strictly the allowed list, nothing else. One PR.

**Current flow:** 5 serial DB round-trips + 1 browser shell round-trip + cover full-res download + no retry + over-sharing payload (~6s, leaks fields).

**Target flow:** 1 `gallery_bootstrap` RPC (business+gallery+meta+first images+sections, dims already included) + browsers skip the shell + cover uses bounded transforms + typed-result retry + whitelisted payload (~1.5s, no sensitive/internal fields).

**Exact files:**
| Change | File |
|---|---|
| New `gallery_bootstrap` RPC + whitelist `gallery_get_meta` + (optional) composite index | new `supabase/migrations/073_gallery_bootstrap.sql` (you apply) |
| Consume bootstrap; typed `{ok,data,error}` results + retry/backoff; fix pagination loop | `gallery-web/src/lib/galleryClient.ts` |
| Wire bootstrap into load; force `renderUrl` for mosaic (drop `welcomeUrlMap` override); retry UI | `gallery-web/src/App.tsx` |
| Conditional rewrite: browsers → index.html, bots → gallery-page | `gallery-web/vercel.json` |
| Pre-step: remove duplicate `previewShareEmail` (unblock tsc) | `gallery-web/src/pages/Dashboard.tsx` |

**Fields that must NOT be exposed in initial data:** `delivery_settings.password`, `delivery_settings.clientCode`, `delivery_settings.logoUrl` (local paths) / any `/Users/`,`/home/` path; from `gallery_get_images`: `face_index_error`, `original_failed_reason`, `upload_status`, `original_upload_method`, `*_size_bytes`, `face_index_attempts`. (Whitelist to UI-rendering keys only.)

**Test plan (added with the PR):** unit tests on `galleryClient` (retry, typed errors, parsing); a Playwright spec asserting the initial payload contains none of the forbidden fields; a spec asserting the cover doesn't fetch originals; a spec asserting a transient error retries instead of showing "not found"; reuse the existing `public-viewer` smoke. Plus a pre-deploy gate (typecheck → test → build) — though wiring CI itself is Phase 2.

**Risk analysis:** Medium-low. The bootstrap RPC must preserve the password-gate "no images before unlock" branch and the bot-OG unfurl path. The vercel.json conditional needs verification that Vercel honors UA-based `has` conditions. The `gallery_get_meta` whitelist could drop a key the viewer silently depends on — mitigated by enumerating every key the viewer reads first. All DB changes non-destructive and reversible.

**Explicitly OUT of Phase 1** (deferred): moving image bytes off the public bucket (Phase 3); enabling the password gate properly (Phase 3); `generate-captions` auth + other AI-route hardening (Phase 2); OG HTML-injection escaping (Phase 2, unless you want it folded in since we're already in that file); CI wiring (Phase 2); desktop token logic, billing, webhooks, face search (forbidden).
