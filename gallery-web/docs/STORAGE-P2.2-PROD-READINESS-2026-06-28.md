# P2.2 — Production Readiness Package (Signed-URL Download Enforcement)

**Date:** 2026-06-28 · **Status:** staging-verified, awaiting production approval.
**Constraints honored:** production untouched · no P2.4 · originals still public · no bucket-privacy flip · no storage read-policy change · no originals deleted.

---

## 1. Exact files changed (7)
| File | Change |
|---|---|
| `api/append-event-posts.ts` | `signed_url` action: behind `SIGNED_URL_ENFORCE_ORIGINALS`, an `/originals/` path requires a valid gallery-scoped PVT **and** `gallery_token_is_valid` (unlock for password galleries). New body field `unlockToken`. |
| `api/gallery-zip.ts` | After existing PVT check, also requires `gallery_token_is_valid`. New body field `unlockToken`. (Note: function is pre-broken — see §13.) |
| `api/watermark.ts` | After existing PVT check, also requires `gallery_token_is_valid`. New query param `unlock`. (Note: pre-existing column bug — see §13.) |
| `src/App.tsx` | `resolveDownloadUrl`: flag-on path requests an authorized **signed** original (no public HEAD-check; downgrade to signed web only on real failure); passes pvt + unlock. Bulk-zip request + JSZip fallback send unlock / use signed URLs. Imports `getStoredToken`. |
| `src/lib/signedStorage.ts` | `signedStorageUrl` + `signedWatermarkedUrl` carry the `unlockToken`. |
| `src/lib/galleryExport.ts` | Owner export uses authenticated `supabase.storage.download()` (no public URL). |
| `src/supabase.ts` | Client Supabase URL/anon made env-driven with **fallback to the exact prod values** (unset env ⇒ byte-identical to today). Enables a staging-pointed preview. |

No DB migration required: P2.2 reuses existing prod RPCs `gallery_token_is_valid` (mig 041), `verify_public_gallery_session` / `issue_public_gallery_session` (mig 061), and the 081-hardened `_gallery_authz` — all already live in production.

## 2. Exact flags
| Flag | Where | Default | Effect when `1` |
|---|---|---|---|
| `VITE_PUBLIC_VIEWER_SIGNED_URLS` | client (build-time) | off | viewer routes downloads through signed URLs; mints a public-viewer session (PVT) on gallery load |
| `SIGNED_URL_ENFORCE_ORIGINALS` | server (function runtime) | off | `signed_url` requires PVT (+unlock for password galleries) before signing an `/originals/` path |

`gallery-zip` / `watermark` unlock checks are always-on but **no-op for non-password galleries** (and PVT was already mandatory there).

## 3. Staging Preview URL
`https://gallery-j5a0p0stw-guysidiphoto-makers-projects.vercel.app` — Vercel target=preview (production alias untouched). Client+functions point at staging Supabase `bkccdomovxtuqdxrahnc`; both flags on. (Preview-scope env vars + a Protection Bypass secret are in place; retained until you approve cleanup.)

## 4. Flag-OFF behavior (current production)
Byte-identical to today: downloads use public `/originals/` URLs; `signed_url` is advisory; no PVT minting; display via public `/web/`+`/thumbs/` render URLs. Verified: the prod build (no VITE_ env) compiles to the exact prior behavior; the prod bundle's signed-URL feature folds to `false`.

## 5. Flag-ON behavior
- Single HD download → authorized **signed** original URL (or `/api/watermark` when watermark on). On unauthorized/sign-failure → graceful downgrade to a signed web copy.
- Bulk download → tries `/api/gallery-zip` (service-role); on its failure → client JSZip using **signed** URLs.
- Owner export → authenticated `supabase.storage.download()`.
- Display unchanged (still `/web/`+`/thumbs/` render URLs; signing skipped for the transformable bucket).
- Password galleries: original download requires a valid unlock token.

## 6. Proof — unauthorized original downloads are BLOCKED
Live on preview + DB matrix on staging:
- `signed_url` originals, **no PVT → 401** `pvt_required`.
- **wrong/expired/absent unlock on a password gallery → 401** `unlock_required`.
- DB matrix 8/8 PASS (same decision points).

## 7. Proof — authorized original downloads WORK
- `signed_url` nopw + valid PVT → **200** with `/object/sign/...` URL; GET that URL → **200 image/jpeg** (real original bytes).
- password + valid PVT + valid unlock → **200 signed**.

## 8. Proof — password-gallery downloads require unlock
- pw original, valid PVT, **no unlock → 401**; **wrong unlock → 401**; **valid unlock → 200**. (`gallery_token_is_valid` returns false for password galleries without a live unlock token; true for non-password.)

## 9. Proof — cross-gallery token denied
- PVT minted for gallery A used to sign gallery B's original → **401** `pvt_required` (PVT is gallery-scoped via `verify_public_gallery_session`). Verified live + DB.

## 10. Proof — public gallery display still works
- `/render/image/public/.../web/...` → **200 image/jpeg**; gallery page `/teststudio/nopw` → **200**; non-password `gallery_get_images` returns rows; password rows gated until unlock, visible after. `password_hash` never exposed by `gallery_get_meta`.

## 11. Proof — dashboard / no public `/originals/` in app download paths
- Owner export switched to authenticated `supabase.storage.download()` (code-verified); no public URL constructed.
- Download path emits `/object/sign/...`, never `/object/public/.../originals/...` (verified live).
- Build green (`tsc` 0 errors, `npm run build` success). Dashboard/display code untouched by P2.2.
- (Owner full-session browser export test pending — needs a logged-in dashboard session; logic is code-verified.)

## 12. Production risk assessment
- **Low.** Flag-gated, additive, reversible. No migration, no policy/bucket/data change. Originals remain public (safety net) during P2.2.
- Behavior change when flags on: downloads take a signed-URL roundtrip (cached 55 min) and gallery load mints a PVT. Reversible instantly by flag-off.
- Graceful fallbacks (downgrade to signed web) prevent hard download failures.
- Pre-existing bugs (§13) are not regressions and are covered/latent.

## 13. Pre-existing bugs (documented separately — NOT P2.2, NOT required for safe P2.2 rollout)
**Bug A — `/api/gallery-zip` returns 500 in production** (`FUNCTION_INVOCATION_FAILED` at cold start). Confirmed on prod via a no-auth probe. Independent of P2.2. **Impact contained:** the client already falls back to client-side JSZip; P2.2 routes that fallback through authorized signed URLs, so bulk-download-with-originals still works and is now gated. Survives P2.4 too (signed URLs work on a private bucket). *Fix separately (own ticket); not a rollout blocker.*

**Bug B — `/api/watermark` (and the `gallery-zip` row select) reference a non-existent `images.storage_path` column.** Prod `images` has only `original_path`/`web_preview_path`/`thumbnail_path`. `resolveImageContext` therefore 404s for any image. **Fully latent:** watermark is disabled on all 81 live galleries and there are 0 password galleries, so this path is never hit. My added unlock gate is correct but sits behind it. **DEFERRED — out of launch scope; do NOT fix in this rollout (per owner).** Watermark is a disabled/deferred feature; fix `/api/watermark` only under a future explicitly-approved task before watermark is ever enabled.

### §13.1 Watermark deferral verification (prod, read-only — 2026-06-28)
- `watermarkEnabled=true` live galleries: **0** (any status: **0**). Live password galleries: **0**.
- `/api/watermark` is called **only** when `delivery_settings.watermarkEnabled === true` (guards: App.tsx:2000 `downloadUrl`, App.tsx:2045 `resolveDownloadUrl`). With it off everywhere the endpoint is never invoked.
- Non-interference confirmed: **display** uses `/render/.../web` (never `/api/watermark`); **downloads** with watermark off resolve via `signed_url` (proven 6/6 live); **dashboard** never calls it; **signed-URL enforcement** is a separate endpoint (`signed_url`) with zero coupling. The text overlay at App.tsx:2759/2813 is a client-side CSS overlay (also gated off), not the broken endpoint.
- **Verdict: watermark does not block P2.2.** Keep disabled/deferred.

## 14. Rollback plan
- Set `VITE_PUBLIC_VIEWER_SIGNED_URLS` and `SIGNED_URL_ENFORCE_ORIGINALS` back to `0` and redeploy → behavior reverts to pre-P2.2 exactly.
- No DB changes to undo. Originals remain public throughout, so nothing is ever inaccessible during rollback.

## 15. Recommended production rollout steps
1. Merge the P2.2 branch to the repo (push currently blocked — do when unblocked).
2. In Vercel **Production** env set: `VITE_PUBLIC_VIEWER_SIGNED_URLS=1`, `SIGNED_URL_ENFORCE_ORIGINALS=1`. (Production `SUPABASE_URL`/`SERVICE_ROLE_KEY` already exist.)
3. Deploy the P2.2 build to production (promote). **Originals stay PUBLIC** — the public bucket is the safety net while we confirm the signed path in prod.
4. Run §17 verification on production.
5. Only after §17 is green and stable: schedule P2.4 (originals → private) as a separate approved step.

## 16. Order/safety notes
- Enabling the server flag alone (client off) is a no-op (old client never calls `signed_url` for downloads). Enabling both together is the intended state. Both are reversible.
- No password galleries live today, so the unlock path is latent-but-correct in prod.

## 17. Production verification to run AFTER deploy (flags on, originals still public)
- Load 3+ live galleries: grid + lightbox + cover render; **no broken images, no 500s**; network shows `/web/`+`/thumbs/` for display.
- Single HD download on a `downloadQuality=original` gallery → downloads the **original**; network shows a **signed** URL (`/object/sign/`), not `/object/public/.../originals/`.
- Bulk multi-select download → succeeds (server zip or JSZip-signed fallback).
- `/api/append-event-posts` (`public_gallery_session`, `signed_url`) return 200 — **no `FUNCTION_INVOCATION_FAILED`**.
- Dashboard loads; owner gallery export downloads originals.
- `/pricing`, `/dashboard`, `/sitemap.xml`, `/robots.txt` → 200.
- Spot-check: an anonymous, non-viewer `signed_url` request for an original → 401.
- **Watermark stays off:** confirm 0 live galleries with `watermarkEnabled=true` and that no download/display request hits `/api/watermark` (it must remain uninvoked). Watermark is deferred/out-of-scope; do not enable or fix it.

---

## ANSWERS
- **Is P2.2 safe to ship to production behind flags?** **Yes.** Flag-off is byte-identical to today; flag-on is the proven enforced-signed-download path; no migration/policy/bucket/data change; fully reversible. The two pre-existing bugs are not regressions and don't block rollout.
- **Which flags must be added in production?** `VITE_PUBLIC_VIEWER_SIGNED_URLS=1` (client/build) and `SIGNED_URL_ENFORCE_ORIGINALS=1` (server). No new secret (prod service_role already set).
- **Exact production verification after deploy?** §17 above.
- **What must remain OFF until P2.4?** The originals-private cutover itself — **originals stay PUBLIC**: do not flip the bucket private, do not change storage read policies, do not move/delete originals. P2.2 with public originals = signed downloads with the public bucket as safety net; P2.4 (private) is a later, separately-approved step.
