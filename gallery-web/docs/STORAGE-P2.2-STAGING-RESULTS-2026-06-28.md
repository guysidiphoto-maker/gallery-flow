# Blocker 2 — P2.2 Signed-URL Download Enforcement — STAGING RESULTS

**Date:** 2026-06-28 · **Scope:** staging only · No production touch · No bucket privacy / read-policy / originals changes.

## Files changed (6)
1. `src/lib/signedStorage.ts` — `signedStorageUrl` accepts `unlockToken` (sent in signed_url body); `signedWatermarkedUrl` accepts + appends `unlock`.
2. `api/append-event-posts.ts` — `signed_url` action: behind `SIGNED_URL_ENFORCE_ORIGINALS`, an `/originals/` path now requires a valid gallery-scoped PVT **and** `gallery_token_is_valid` (unlock for password galleries). New body field `unlockToken`.
3. `api/gallery-zip.ts` — after the existing PVT check, also requires `gallery_token_is_valid` (unlock for password galleries). New body field `unlockToken`.
4. `api/watermark.ts` — after the existing PVT check, also requires `gallery_token_is_valid` (unlock for password galleries). New query param `unlock`.
5. `src/App.tsx` — `resolveDownloadUrl`: flag-on path requests an authorized **signed** original (no public HEAD; downgrade to signed web only on real failure); passes pvt + unlock. Bulk-zip request + JSZip fallback pass unlock / use signed URLs. Imports `getStoredToken`.
6. `src/lib/galleryExport.ts` — owner export uses authenticated `supabase.storage.download()` instead of public URLs.

## Flags
- `VITE_PUBLIC_VIEWER_SIGNED_URLS=1` (client, build-time) — turns on the signed download path. Default off → byte-identical to pre-P2.2.
- `SIGNED_URL_ENFORCE_ORIGINALS=1` (server) — flips `signed_url` originals to enforcing. Default off → legacy advisory.
- `gallery-zip` + `watermark` unlock checks are always-on (no-op for non-password galleries; PVT was already mandatory there).

## Build
- `tsc --noEmit` (app) = 0 errors. `npm run build` = success. Changed `api/*` regions typecheck clean (3 pre-existing unrelated `FeedPlanPosts` errors only, surfaced solely by ad-hoc strict flags; Vercel transpile unaffected).

## Authorization proof — staging Supabase `bkccdomovxtuqdxrahnc` (prod-safe)
Restored prod-parity RPC layer on staging (PVT table + `issue/verify_public_gallery_session` from mig 061, `gallery_token_is_valid` from mig 041; staging `_gallery_authz` already 081-hardened). Seeded `teststudio` business + `NoPw` (live, no password) and `Pw` (live, bcrypt password) galleries with images + valid/expired unlock tokens. Replicated the exact endpoint decision via the same RPCs:

| # | scenario | PVT ok | authz ok | result | expected | |
|---|---|---|---|---|---|---|
|1|signed_url NoPw original, NO pvt|false|—|401 pvt_required|401 pvt_required|PASS|
|2|signed_url NoPw original, valid pvt|true|true|200 signed|200 signed|PASS|
|3|signed_url NoPw original, CROSS pvt (scoped to Pw)|false|—|401 pvt_required|401 pvt_required|PASS|
|4|signed_url Pw original, valid pvt, NO unlock|true|false|401 unlock_required|401 unlock_required|PASS|
|5|signed_url Pw original, valid pvt, VALID unlock|true|true|200 signed|200 signed|PASS|
|6|signed_url Pw original, valid pvt, WRONG unlock|true|false|401 unlock_required|401 unlock_required|PASS|
|7|signed_url Pw original, valid pvt, EXPIRED unlock|true|false|401 unlock_required|401 unlock_required|PASS|
|8|gallery-zip Pw, CROSS pvt (scoped to NoPw)|false|—|401 pvt_required|401 pvt_required|PASS|

Display / leak invariants:
- `gallery_get_meta(Pw).has_password` = true, leaks `password_hash` = **false** (stripped). PASS
- non-password display: 1 image visible. PASS
- password display gated (no token): 0 rows. PASS
- password display after unlock: 1 row. PASS

## What is proven vs. pending
- **Proven:** unauthorized cannot get a signed original (no pvt / wrong pvt / cross-gallery → 401); password originals require unlock (no/wrong/expired → 401); authorized non-password + unlocked-password → 200; gallery-zip + watermark gated; password_hash never exposed; display unaffected; app code no longer emits any public `/originals/` URL on the download path (flag on) and owner export uses authenticated download.
- **Pending (needs a deployment-target decision):** a clickable flag-ON staging **Preview URL** for in-browser E2E. The client hardcodes the **prod** Supabase URL and there is one Vercel project, so a normal preview's browser session would hit prod; a true staging preview needs staging env wired in Vercel incl. the staging `service_role` key (a secret the user sets, never the assistant).

## Rollback
Unset `VITE_PUBLIC_VIEWER_SIGNED_URLS` / `SIGNED_URL_ENFORCE_ORIGINALS` → behavior reverts to pre-P2.2. gallery-zip/watermark unlock checks are no-ops for non-password galleries (all 81 live). No migration shipped; originals remain public throughout.

## LIVE PREVIEW RESULTS (deployed, flag-on, staging Supabase)
Preview: `https://gallery-j5a0p0stw-guysidiphoto-makers-projects.vercel.app` (Vercel target=preview; prod alias untouched). Preview env (Preview scope only): VITE_SUPABASE_URL/ANON + SUPABASE_URL → staging, SUPABASE_SERVICE_ROLE_KEY → staging (user-set), VITE_PUBLIC_VIEWER_SIGNED_URLS=1, SIGNED_URL_ENFORCE_ORIGINALS=1. Tested via `x-vercel-protection-bypass`.

**signed_url (single HD) — 6/6 PASS live:**
| scenario | result | expected |
|---|---|---|
| nopw original, NO pvt | 401 pvt_required | ✓ |
| nopw original, valid pvt | 200 + signed (`/object/sign/`) | ✓ |
| nopw original, CROSS pvt (scoped to pw) | 401 pvt_required | ✓ |
| pw original, pvt, NO unlock | 401 unlock_required | ✓ |
| pw original, pvt, VALID unlock | 200 + signed | ✓ |
| pw original, pvt, WRONG unlock | 401 unlock_required | ✓ |

- Signed original actually downloads the real bytes: GET signed URL → **200 image/jpeg**.
- Display intact: `/render/image/public/.../web/...` → **200 image/jpeg**; `/teststudio/nopw` page → 200.
- Smoke: root 200, gallery 200.

**Pre-existing bugs found (NOT caused by P2.2; confirmed on prod):**
- `/api/gallery-zip` → **500 FUNCTION_INVOCATION_FAILED** on prod too (crashes at cold start). Effect: the client already falls back to client-side JSZip; my P2.2 fix routes that fallback through authorized **signed URLs**, so bulk-download-with-originals still works and is now gated. Server-zip optimization should be fixed separately.
- `/api/watermark` `resolveImageContext` and `/api/gallery-zip` select reference a **non-existent `images.storage_path` column** (prod schema has only `original_path`/`web_preview_path`/`thumbnail_path`) → watermark 404s for any image. Fully **latent** (watermark disabled on all 81 live galleries, 0 password galleries). My added unlock gate is correct but sits behind this; should be fixed (use `web_preview_path`) before watermark is ever enabled. Unlock-gate logic itself is proven by the DB matrix + identical signed_url path.

**Owner export:** code-verified (authenticated `supabase.storage.download()`); full owner-session browser test pending (needs a logged-in dashboard session).

## Production safety
The code is safe to ship: flag-gated, additive, reversible; no prod data/policy/bucket touched. Recommend production rollout only after a flag-on browser E2E (deployment-target decision above) — separate approval.
