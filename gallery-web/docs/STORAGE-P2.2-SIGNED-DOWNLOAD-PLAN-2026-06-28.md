# Blocker 2 — P2.2: Signed-URL Download Enforcement (PLAN ONLY)

**Date:** 2026-06-28
**Status:** PLAN — not implemented, not applied, no production touch.
**Goal:** Every original-quality download must stop depending on a public `/originals/` URL and instead go through an *authorized* server/signed path, so that P2.4 (originals → private) can be done with **zero** loss of download capability and **no** unauthorized access.

> This plan does **not** change bucket privacy, storage read policies, paths, or delete originals. It only prepares and hardens the download paths so the P2.4 cutover is safe.

---

## 0. Key discovery — the infra already exists (Phase 4 prep)

A previous "Phase 4" effort already built most of the signed-URL plumbing, but left it **disabled or advisory**. P2.2 is mostly *turning it on and closing the gaps*, not building from scratch.

| Component | File | State today |
|---|---|---|
| `signedStorageUrl()` client helper | `src/lib/signedStorage.ts` | Built. **Disabled** behind `VITE_PUBLIC_VIEWER_SIGNED_URLS !== '1'` → short-circuits to public URL. |
| `useSignedSrc()` display hook | `src/lib/useSignedSrc.ts` | Built; skips signing for transformable buckets (display uses `/render/` anyway). Not relevant to downloads. |
| `signed_url` server action | `api/append-event-posts.ts:736` | Built. **Advisory** — issues a 60-min signed URL for *any* valid path; PVT is only *logged*, never required (`pvtValidated` is echoed, not enforced). |
| `/api/gallery-zip` (bulk ZIP) | `api/gallery-zip.ts` | **Already enforcing** ✅ — requires valid PVT scoped to gallery, validates every image belongs to gallery, fetches via service-role. |
| `/api/watermark` (HD single, watermark on) | `api/watermark.ts` | Requires PVT scoped to gallery, fetches via service-role. Mostly enforcing. |
| `resolveDownloadUrl()` single HD | `src/App.tsx:2024` | Already *calls* `signedStorageUrl`, but **HEAD-checks the public original first** — under a private bucket that HEAD returns 403 and it would wrongly downgrade HD→web. |
| client JSZip ZIP fallback | `src/App.tsx:2240` | Uses `downloadUrl()` → **public** URLs. Only runs if `/api/gallery-zip` fails. |
| owner HD ZIP export | `src/lib/galleryExport.ts` | Uses raw **public** `storageUrl()` — never routed through signing or owner-auth download. |

**Implication:** the bulk-ZIP path is already safe. The work is: (1) flip `signed_url` to enforcing, (2) fix the single-HD HEAD logic, (3) fix the two fallbacks (client JSZip + owner export), (4) make sure password galleries can't get a download URL without a valid unlock.

---

## 1. Scope — the 11 paths the user named

| # | Path / symbol | File | Uses public `/originals/` today? | P2.2 action |
|---|---|---|---|---|
| 1 | Single HD download (public viewer) | `App.tsx` `resolveDownloadUrl`/`handleImageDownload` | YES (HEAD public, then sign) | Fix HEAD logic; request signed original; downgrade only on real 404/sign-fail |
| 2 | Owner HD ZIP export | `galleryExport.ts` `exportGalleryAsZip` | YES (public `storageUrl`) | Route through authenticated owner download (or server export) |
| 3 | Client JSZip ZIP fallback | `App.tsx` (~2240) | YES (`downloadUrl`) | Use `signedStorageUrl` when flag on; keep `/api/gallery-zip` as primary |
| 4 | `/api/gallery-zip` | `api/gallery-zip.ts` | NO (service-role, PVT-gated) | ✅ Already correct. Only: bucket-name parameterization for P2.4 |
| 5 | `/api/watermark` | `api/watermark.ts` | NO (service-role, PVT-gated) | ✅ Already correct. Confirm strict PVT + bucket param |
| 6 | `resolveDownloadUrl` | `App.tsx:2024` | YES | See #1 |
| 7 | `downloadUrl` | `App.tsx:1990` | YES (public `originalUrl`/`webUrl`) | When flag on, must not hand back public original; used only by #3 fallback now |
| 8 | `originalUrl` | `App.tsx:1971` | YES (public `storageUrl(original_path)`) | Keep for flag-off legacy; ensure not called on the enforced path |
| 9 | `original_path` (data exposure) | bootstrap payload / `images` | Carried as data | Leave value; ensure no code turns it into a *public* fetch when flag on |
| 10 | `downloadQuality=original` | gallery `delivery_settings` | Drives HD selection | No change to data; behavior preserved via signed original |
| 11 | `signed_url` action | `append-event-posts.ts:736` | Issues for any path (advisory) | **Flip to enforcing** behind a flag (see §3.A) |

---

## 2. Current vs. target behavior

**Display (grid / lightbox / cover / thumbnails / OG):** uses `/web/` + `/thumbs/` via `/render/` transform URLs on the public `gallery-images` bucket. **No change in P2.2 or P2.4** — these derivatives stay public. (Confirmed in P2.3 audit.)

**Original-quality download — today:** client builds a **public** `…/originals/…` URL (or HEAD-checks it) and the browser fetches the raw original directly from the public bucket. After P2.4 that URL would 403.

**Original-quality download — target:** client never builds a public original URL. Instead:
- **Single HD (no watermark):** request a **short-lived signed URL** for the original via `signed_url` (PVT-gated), download that.
- **Single HD (watermark on):** `/api/watermark` (service-role, PVT-gated) — already the case.
- **Bulk ZIP:** `/api/gallery-zip` (service-role, PVT-gated) — already the case; client JSZip fallback uses signed URLs.
- **Owner export:** authenticated owner download (owner's Supabase auth session reads under owner RLS even on a private bucket) or a server export endpoint.

**Authorization invariants after P2.2:**
- No anonymous caller gets a public original URL.
- A signed original URL is issued **only** with a valid PVT scoped to that gallery.
- For **password** galleries, a download URL is issued **only** when the caller also holds a valid password-unlock token (defense-in-depth — see §3.D). Today image *rows* are already password-gated (Blocker 3), so original_path isn't even visible without unlock; §3.D closes the path-guessing gap.

---

## 3. Proposed changes (exact)

### A. `signed_url` → enforcing (the keystone) — `api/append-event-posts.ts:736`
- Add a server enforcement flag, e.g. `SIGNED_URL_ENFORCE_ORIGINALS` (env, default off until cutover) **or** key off the requested bucket/path.
- When the requested path is an **original** (path segment `originals/`, or bucket is the private originals bucket):
  - Require a **valid PVT scoped to the gallery_id** parsed from the path. If missing/invalid → `401`. (Today this is logged only.)
  - For **password** galleries, additionally require a valid unlock token (§3.D).
- For non-original paths (`web/`, `thumbs/`) keep current behavior (display already uses `/render/`, so this endpoint is rarely hit for those).
- Keep the 60-min TTL and path-traversal guards as-is.

### B. Single HD download — `App.tsx` `resolveDownloadUrl` (~2024)
- **Remove the public-URL HEAD pre-check** (lines ~2046-2056) when `VITE_PUBLIC_VIEWER_SIGNED_URLS` is on. A private bucket makes that HEAD a guaranteed 403 → false downgrade.
- New flow when flag on + HD requested:
  1. watermark on → `signedWatermarkedUrl` (unchanged).
  2. else → `signedStorageUrl(originalsBucket, original_path, { fallbackToPublic: false, pvt })`.
  3. on sign failure / `404` (original genuinely absent) → downgrade to a **signed** `/web/` URL and show the existing HD-notice.
- Keep flag-off behavior identical to today (public URLs) for safe rollout.

### C. Client JSZip ZIP fallback — `App.tsx` (~2240)
- Primary path is already `/api/gallery-zip` (enforcing). Fallback must, when flag on, fetch via `signedStorageUrl(...)` per image instead of `downloadUrl()` (public). Simplest: have `downloadUrl()` delegate to the signed path when the flag is on, or replace the fallback's `fetch(downloadUrl(...))` with `fetch(await signedStorageUrl(...))`.

### D. Password galleries cannot download originals without unlock
- **Problem:** `issue_public_gallery_session` mints a PVT for *any live* gallery (only blocks `gallery_not_live`); it does **not** check the password. A PVT alone is therefore not proof of unlock.
- **Fix (one of):**
  - **D1 (preferred):** in `signed_url` (and `/api/gallery-zip`, `/api/watermark`) when the target gallery has `password_hash IS NOT NULL`, additionally require a valid **gallery unlock token** (the Blocker-3 token) and verify it via the existing authz RPC before issuing.
  - **D2:** gate `issue_public_gallery_session` so a PVT for a password gallery is only minted after unlock.
- D1 is more surgical and keeps the two token systems independent. Recommend **D1**.
- **Note:** 0 password galleries are live today, so this is latent-but-correct hardening; it must be in place before any password gallery goes live with private originals.

### E. Owner HD ZIP export — `galleryExport.ts`
- Owner is authenticated (Supabase auth session). Replace public `storageUrl()` + `fetch()` with **`supabase.storage.from(bucket).download(path)`** using the owner's session — this reads under owner RLS and works on a private bucket. (Or add a small server export endpoint mirroring `/api/gallery-zip` but owner-authed.)
- Recommend the client-side `supabase.storage…download()` swap: minimal, no new endpoint, works once bucket is private.

### F. Bucket parameterization for P2.4 (prep, no behavior change)
- `signed_url` `ALLOWED_BUCKETS`, `gallery-zip` `PRIVATE_BUCKET`, `watermark` `PRIVATE_BUCKET` all hardcode `gallery-images`. If P2.4 moves originals to a new private `gallery-originals` bucket, these need that bucket added/selected. In P2.2, introduce a single `ORIGINALS_BUCKET` constant (= `gallery-images` today) so P2.4 is a one-line flip. No runtime change in P2.2.

---

## 4. Required env vars / secrets

| Var | Where | Purpose | Set when |
|---|---|---|---|
| `VITE_PUBLIC_VIEWER_SIGNED_URLS=1` | Vercel (build) | Turns on client signed-download path | Staging now; prod at P2.2 rollout |
| `SIGNED_URL_ENFORCE_ORIGINALS=1` (or equivalent) | Vercel (server) | Flips `signed_url` to enforcing for originals | Staging now; prod at P2.2 rollout |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server) | Already used by gallery-zip/watermark/signed_url | Already set — **never** printed/committed |
| (existing) `CF_TURNSTILE_SECRET` | Vercel (server) | PVT anti-abuse soft limit | Optional; unrelated to P2.2 |

No new secret needs to be handled by me; service-role key stays in the Vercel function env only.

---

## 5. Staging test plan (must all pass before prod)

Run on `pixflow-staging` with both flags ON and a private-originals canary (a single test gallery whose originals are made private, **staging only**), since P2.2's whole point is "works when private."

1. **Display unaffected:** load 3 galleries — grid, lightbox, cover, thumbnails all render via `/web/`+`/thumbs/`; network shows no `/originals/` requests; no 403/404.
2. **Single HD (no watermark):** click download on an `downloadQuality=original` gallery → receives the **original** (verify bytes/dimensions = original, not web); network shows a **signed** URL, not a public one.
3. **Single HD when original genuinely missing:** simulate absent original → graceful downgrade to signed `/web/` + HD-notice (no broken download).
4. **Watermark on:** a watermark gallery → `/api/watermark` returns marked original; no public original fetched.
5. **Bulk ZIP (primary):** `/api/gallery-zip` returns originals; valid PVT required (drop PVT → 401).
6. **Bulk ZIP (fallback):** force `/api/gallery-zip` failure → client JSZip fallback uses **signed** URLs, archive still contains originals.
7. **Owner export:** dashboard → export gallery ZIP → contains originals via owner-auth download; works with bucket private.
8. **Unauthorized cannot download:**
   - No PVT → `signed_url` for an original → `401`.
   - PVT for gallery A used to sign an original of gallery B → `401`.
   - Direct GET of a private original public URL → `403`.
9. **Password gallery (seed one on staging):**
   - With PVT but **no** unlock token → `signed_url`/zip/watermark for its originals → `401`.
   - After correct password → unlock token → download succeeds.
   - Wrong/no password → image rows still hidden (Blocker 3) AND no download URL issued.
10. **Non-password public gallery:** everything in 1-7 still works (no regression).
11. **Coverage gate still 0:** `images_needing_derivative` gate = 0 (web/thumb present for all live images) — prerequisite for P2.4 unchanged.
12. **Flag-off safety:** with `VITE_PUBLIC_VIEWER_SIGNED_URLS` unset, behavior is byte-identical to today (public URLs) — proves a safe rollback.

Evidence to capture for each: request URL shape (signed vs public), HTTP status, downloaded file size/dimensions, and a screenshot/headers dump for the unauthorized-denial cases.

---

## 6. Production risk

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Signed-URL roundtrip adds latency on download click | Low | Minor (~100-300ms) | Cache (55-min) already in `signedStorageUrl`; only on the explicit click, not on browse |
| `signed_url` enforcement accidentally blocks a legit download | Low | HD download fails | Flag-gated; staged rollout; flag-off = instant revert; downgrade-to-web fallback keeps *something* downloadable |
| Owner export breaks for very large galleries | Low | Owner export slow/fails | Existing 2GB client cap; server export is the documented Phase-2 escalation if needed |
| Bucket-name coupling if P2.4 moves originals | Medium | Downloads 404 after move | `ORIGINALS_BUCKET` single constant (§3.F); covered in P2.4, not P2.2 |
| Password-gallery latent gap | None today (0 live) | Would expose originals via path guess | §3.D closes it before any private-original password gallery |

**Display, cover, OG, dashboard view, upload, delete: no risk** — P2.2 does not touch them.

## 7. Rollback plan
- **Client:** set `VITE_PUBLIC_VIEWER_SIGNED_URLS` back to unset/`0` and redeploy → all download paths revert to public-URL behavior (identical to today).
- **Server:** set `SIGNED_URL_ENFORCE_ORIGINALS=0` → `signed_url` reverts to advisory (issues without PVT requirement).
- No DB migration is required for P2.2 (unless §3.D needs a small RPC for unlock-token verification in the download endpoints — if so it's an additive function, droppable). Originals remain public throughout P2.2, so nothing is ever inaccessible during rollback.

## 8. GO / NO-GO recommendation
**GO to implement P2.2 on staging** once you approve this plan. Rationale: the infra largely exists; the changes are flag-gated, additive, and reversible; the bulk-ZIP path is already correct; and P2.2 is the exact prerequisite that turned P2.3 into a NO-GO for P2.4. **No production touch in this step** — staging build + canary proof first, then a separate approval for any prod flag flip.

---

## 9. Cutover readiness gate — P2.4 may be considered ONLY when ALL are true
1. No public-viewer download path depends on a public `/originals/` URL (single HD, client ZIP fallback all routed through signed/server). ✔ via §3.B/C.
2. Owner HD export works through authenticated/server access on a private bucket. ✔ via §3.E.
3. Bulk-ZIP original quality works when authorized (PVT-gated). ✔ already (§ #4).
4. Password galleries cannot obtain an original download URL without a valid unlock token. ✔ via §3.D.
5. Public non-password galleries still download originals normally. ✔ staging test 2/5/6/7.
6. Coverage gate `images_needing_derivative` = 0. ✔ (already met; re-confirm).
7. Gallery display uses only `/web/` + `/thumbs/`. ✔ (P2.3 confirmed; re-confirm in staging test 1).
8. All of the above proven on staging (incl. a private-originals canary) **before** any production change.

When 1-8 are green on staging, P2.4 = (a) move/relocate originals to private, (b) flip privacy, (c) flip `ORIGINALS_BUCKET` if relocating, (d) run the §5 tests against prod canary first.

---

## 10. What this plan explicitly does NOT do
- Does not flip any bucket to private. Does not change storage read policies. Does not move/copy/delete originals. Does not run P2.4. Does not touch SEO, analytics, signup, payments, UI, SSR, blog, Hebrew pages, or any unrelated surface. Implementation is **not** started — awaiting approval.
