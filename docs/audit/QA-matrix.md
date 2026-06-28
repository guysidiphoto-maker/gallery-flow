# Pixflow — Launch-Readiness QA Matrix

Date: 2026-06-29
Tester: QA Engineer (automated HTTP probing, READ-ONLY)
Target: https://pixflow-ai.com (Supabase prod `vlyiqfawkrjvqcmkpfvs`)
Method: GET/HEAD only against prod; no POST that triggers AI/cost/SMS/email; DB read-only.

---

## Executive Summary

**Verdict: YELLOW (conditional GO).**

The public surface is healthy: every marketing route, SEO landing page, blog post,
sitemap, robots.txt, and gallery viewer returns **200**. SSR meta (title/canonical/
hreflang) is correct on `/` and `/en`. Gallery social-share OG tags render correctly
for bots (real title + bounded cover-image transform) and 404 correctly for unknown
galleries. The signed-URL gate (P2.2) is enforced: an unauthenticated `/object/sign/...`
is **denied (400)**. No `500` / `FUNCTION_INVOCATION_FAILED` on any user-facing page.

Two issues hold it back from GREEN:

1. **P1 — `/api/gallery-zip` crashes (FUNCTION_INVOCATION_FAILED) before its own auth/method guard.**
   This is the anonymous-viewer "Download All" endpoint. A GET returns `500` with
   `x-vercel-error: FUNCTION_INVOCATION_FAILED` instead of the expected `405`. The crash
   is at module-init level (before line 73's method check) — most likely a missing prod env
   var (`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL`) or an unbundled `archiver` dependency.
   Effect: bulk gallery download may be broken in prod. **Owner must POST-test in a browser** to confirm.

2. **P2 — `gallery-images` storage bucket is PUBLIC.** A direct
   `/storage/v1/object/public/gallery-images/<path>` returns `200` + the original JPEG to
   anyone holding the object path. This is a known launch-readiness blocker (per memory:
   "public image bucket"). It is what makes the OG cover-image transform work, but it also
   means originals are reachable without the signed-URL gate. Decision needed: this is by
   design for now or a blocker. Not a new regression.

Everything else: **PASS**.

---

## A. Public Marketing Site

| Route | Status | Time | Notes |
|---|---|---|---|
| `/` | 200 | 0.23s | SSR he, `lang=he dir=rtl`, title + canonical + hreflang OK |
| `/en` | 200 | 0.45s | SSR en, `lang=en dir=ltr`, canonical + hreflang OK |
| `/pricing` | 200 | 0.25s | PASS |
| `/terms` | 200 | 0.41s | PASS |
| `/privacy` | 200 | 0.36s | PASS |
| `/blog` | 200 | 0.41s | PASS |
| `/blog/how-to-deliver-event-photos-faster` | 200 | 0.50s | SSR title + canonical OK |
| `/blog/a-face-recognition-workflow-...` | 200 | 0.35s | PASS |
| `/demo` | 200 | 0.34s | SSR Hebrew title OK |
| `/how-it-works` | 200 | 0.36s | PASS |
| `/wedding-photo-gallery` | 200 | 0.44s | SEO landing PASS |
| `/face-recognition-photo-gallery` | 200 | 0.50s | SEO landing PASS |
| `/sitemap.xml` | 200 | 0.22–1.57s | `application/xml`, 18 valid `<loc>` entries |
| `/robots.txt` | 200 | 0.22s | Correct: app surfaces disallowed, AI crawlers allowed, sitemap declared |

No `500` / empty / FUNCTION_INVOCATION_FAILED on any marketing route. No unexpected redirects.

## B. Public Gallery Viewer

Real `live` galleries used (from DB): `/eclipse-media/tat3-1`, `/eclipse-media/sigal`,
`/eclipse-media/rapyd-saint-lucia`.

| Check | Status | Result |
|---|---|---|
| `/eclipse-media/tat3-1` (browser UA) | 200 | Serves SPA shell (generic title) — gallery renders client-side. **By design** (see `api/gallery-page.ts`). |
| `/eclipse-media/sigal` | 200 | PASS |
| `/eclipse-media/rapyd-saint-lucia` (926 imgs) | 200 | PASS, 0.38s |
| Gallery OG/meta (bot UA `WhatsApp`) | 200 | PASS — real title `טסט 3 — eclipse media`, og:title, og:image = bounded 1200×630 cover transform |
| Unknown gallery (bot UA) | **404** | PASS — `/eclipse-media/this-does-not-exist` → 404 "Gallery not found" |
| Unknown gallery (browser UA) | 200 | Serves SPA shell; client renders its own not-found. MANUAL: confirm in-app empty state. |
| OG cover image render endpoint | 200 | `image/jpeg`, 98KB — but **3.27s cold** (see Perf) |
| **P2.2: unauth `/object/sign/...`** | **400** | **PASS — signing denied without auth** |
| Direct `/object/public/gallery-images/...` | 200 | **P2 finding — bucket is public; originals reachable by path** |
| `/render/image/public/...` transform | 200 | Works (powers OG); also public |
| `/api/gallery-zip` (GET) | **500** | **P1 — FUNCTION_INVOCATION_FAILED, crashes before 405 guard** |

## C. Dashboard

| Check | Status | Result |
|---|---|---|
| `/dashboard` | 200 | SPA shell serves, `<div id="root">` present, Vite bundle referenced. Login is client-side Google OAuth — guard is in-app. |

**MANUAL — needs browser/login:** confirm the dashboard redirects/blocks an unauthenticated
user and does not flash protected data before the OAuth check.

## D. Broken-Link / Asset Sanity

| Asset | Status | Size | Notes |
|---|---|---|---|
| `/assets/index-C4KL7DZr.css` | 200 | 21.9KB | valid CSS |
| `/assets/index-DMgMWFCB.js` | 200 | 456KB | valid Vite bundle (`__vite__mapDeps...`) |
| `/favicon-32.png` | 200 | 1.5KB | PASS |
| `/favicon.svg` | 200 | 816B | PASS |
| `/pixflow-icon-192.png` | 200 | 23.7KB | PASS |
| `/og-default.png` | 200 | 108KB | PASS |
| `/app.html` (SPA shell) | 200 | 1.4KB | PASS |

All 7 spot-checked assets resolve. No broken links found in homepage HTML.

## E. SEO / Meta Sanity

| Check | Result |
|---|---|
| `/` title | PASS — `Pixflow — גלריות אירועים חכמות עם זיהוי פנים` |
| `/` canonical | PASS — `https://pixflow-ai.com/` |
| `/` hreflang | PASS — he / en / x-default all present |
| `/` og:title + og:image | PASS — og:image `/og-default.png` (200) |
| `/en` title | PASS — `Pixflow — AI Face Recognition Photo Galleries for Events` |
| `/en` canonical + hreflang | PASS — distinct canonical, reciprocal hreflang |
| Blog post canonical | PASS |
| Gallery OG (bots only) | PASS — per-gallery title/image; browsers get generic shell (no per-gallery `<title>` for non-bot — acceptable but a soft SEO gap for galleries) |

No broken/duplicate meta on tested routes.

## F. Console-Error / JS-Bundle Sanity (static)

| Check | Result |
|---|---|
| Main JS bundle | PASS — 456KB, valid Vite output, no error placeholder |
| Main CSS | PASS — valid |
| SPA shell mount | PASS — `<div id="root">` present |

Cannot run a browser → runtime console errors are **MANUAL**.

## G. Performance (cold GET)

| Route | Time | Flag |
|---|---|---|
| Most marketing routes | 0.2–0.5s | OK |
| `/sitemap.xml` (cold) | 1.57s | borderline (0.22s warm) — acceptable |
| OG cover image transform (cold) | **3.27s** | **>2s** — slow first render of Supabase image transform. Affects WhatsApp/FB link-preview generation latency on first share. P3. |

---

## Failure Classification

| ID | Sev | Item | Evidence |
|---|---|---|---|
| QA-1 | **P1** | `/api/gallery-zip` crashes (FUNCTION_INVOCATION_FAILED) before method/auth guard — anonymous "Download All" likely broken in prod | GET → 500, `x-vercel-error: FUNCTION_INVOCATION_FAILED`; source expects POST + service-role env |
| QA-2 | **P2** | `gallery-images` bucket is PUBLIC — originals reachable by object path without signed gate | `/object/public/gallery-images/...` → 200 image/jpeg (known launch blocker) |
| QA-3 | P3 | Cold Supabase image-transform render ~3.3s — slow first social-share preview | OG image GET 3.27s cold |
| QA-4 | P3 | Browser-facing gallery pages serve a generic `<title>` (per-gallery title only for bots) — minor SEO/UX gap | gallery HTML title = "Pixflow — Smart Event Galleries" |

No P0 found via HTTP.

---

## MANUAL QA the owner MUST do in a browser (cannot be HTTP-tested)

- [ ] **Login** — Google OAuth completes; unauthenticated `/dashboard` blocks/redirects (no protected-data flash).
- [ ] **Gallery download** — confirm "Download All" / ZIP actually works end-to-end (QA-1: gallery-zip currently 500s on probe). Test single + multi-select download.
- [ ] **Create gallery** — full upload → publish flow; preview vs originals.
- [ ] **Upload** — drag/drop, large batch, resume after interruption.
- [ ] **Delete** — gallery + image deletion, confirm removal from storage.
- [ ] **Password-gated gallery** — code/password gate accepts correct, rejects wrong; unlock token issued (P2.2 path).
- [ ] **Lightbox** — open/navigate/close, favorites, hidden images.
- [ ] **Section pages** — one section per page with own URL (per invariant; PR #134 regressed this before).
- [ ] **Mobile** — responsive gallery + dashboard on real phone; RTL layout.
- [ ] **Face recognition** — selfie search returns matches (do NOT mass-trigger; one manual run).
- [ ] **Social/AI feed** — generate-feed / campaign flows (cost — owner only, not QA).
- [ ] **Runtime console** — open DevTools on `/`, `/dashboard`, a gallery; check for JS errors.
- [ ] **Real social-share preview** — paste a gallery URL into WhatsApp/FB/Slack; confirm card + cover render (note QA-3 cold latency).
