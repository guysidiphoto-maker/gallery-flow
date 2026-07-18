# Track A Reconciliation Report — public-form + upload hardening + server Sentry

**Date:** 2026-07-16
**Branch:** `security/track-a-hardening-reconciled` (off `main` @ `4149c28`; rebased, up to date)
**Status:** built + type-checked + unit-checked; **not merged, not deployed.**

---

## 1. Branches reviewed

| Branch | On origin | Role in reconciliation |
|---|---|---|
| `security/lock-public-form-endpoints` (mine) | yes | End-to-end Turnstile (client widget + server), per-event rate cap, data-preserving SMS gate |
| `fix/public-endpoints-rate-limit` | yes | Kill switch, input validators, PII masking, persistent dual rate limits, verify-if-present Turnstile |
| `fix/upload-validation` | yes | Dashboard-level type/size/HEIC/batch validation (25MB, JPEG/PNG/WebP) |
| `fix/upload-input-validation` | no (local) | Earlier upload validation (superseded by the above) |
| `fix/upload-validation-sentry` (mine) | yes | Pipeline-level upload gate + partition helper + client-Sentry capture |
| `fix/server-side-sentry` | yes | Dependency-free server Sentry across 12 endpoints (`server/sentryServer.ts`) — **adopted via cherry-pick** |

---

## 2. Features retained (from which branch)

**Public endpoints** (`server/publicEndpointGuards.ts` — new single source of truth):
- **Emergency kill switch** `PUBLIC_FORMS_ENABLED` — from `fix/public-endpoints-rate-limit`.
- **Input validators** (`isUuid`, `isValidEmail`, `cleanText`) — from `fix/public-endpoints-rate-limit`.
- **PII-safe log masking** (`maskPhone`, `maskEmail`) — from `fix/public-endpoints-rate-limit`.
- **Persistent DB-row-count rate limiting** (`countSince`) — from `fix/public-endpoints-rate-limit`.
- **End-to-end Turnstile**: client `TurnstileWidget` sends a token (from mine) + server verification. The verifier was **upgraded to tri-state** (`ok | invalid | unavailable | absent`) so it satisfies both "enforce Turnstile" and "never block a legit user when Cloudflare/network fails."
- **Data preservation**: lead/response always stored; only the cost-bearing SMS/email is withheld when rate-limited (gallery link still returned) — merges mine (preserve+gate) with theirs (rate limits).

**Uploads** (`src/lib/uploadPipeline.ts` — single source of truth):
- **Both-layer validation**: pipeline defensive gate in `uploadMany` (mine) + Dashboard pre-filter with clear per-reason messages (theirs).
- **Explicit HEIC handling**: reject with a dedicated reason + guidance (theirs — domain-correct: the transform pipeline can't decode HEIC, so *allowing* it produced broken images).
- **Batch cap** (theirs) + **partition helper & client-Sentry capture** (mine).

**Server observability**: `server/sentryServer.ts` + `withSentry` wrapping across 12 endpoints — adopted wholesale from `fix/server-side-sentry`, and extended to wrap the two reconciled public endpoints.

## 3. Features rejected (and why)

- **Turnstile "verify-if-present, boolean" (theirs)** → replaced by tri-state. A boolean verifier returns `false` on a network error, which would *block* a legitimate user during a Cloudflare hiccup. Tri-state distinguishes `invalid` (block) from `unavailable` (fall through to rate limits).
- **Hard-require Turnstile / hard-block on rate limit (mine, strict reading)** → softened. We never hard-block a real guest on absent/unavailable tokens or on a burst; we preserve data and withhold only the paid action.
- **Allowing HEIC (mine)** → rejected; adopted theirs' HEIC rejection (see above).
- **25MB size cap (theirs)** → raised to 40MB (see §5).
- **Forms OFF by default (theirs)** → changed to ON-by-default-with-kill-switch (see §5), because the endpoints are now fully protected and lead capture is a real flow.
- **`fix/upload-input-validation`** (local, older) → superseded.
- **Duplicated `api/_security.ts` (mine)** → dropped in favor of the richer `server/publicEndpointGuards.ts` (no duplicate shared module).

## 4. Exact files changed (20)

- **New:** `server/publicEndpointGuards.ts`, `server/sentryServer.ts`
- **Reconciled endpoints:** `api/capture-lead.ts`, `api/submit-questionnaire.ts`
- **Server-Sentry wrapped (cherry-pick):** `api/append-event-posts.ts`, `api/gallery-page.ts`, `api/gallery-zip.ts`, `api/generate-campaign.ts`, `api/generate-captions.ts`, `api/generate-feed.ts`, `api/plan-event.ts`, `api/score-images.ts`, `api/share.ts`, `api/stories/render.ts`, `api/stories/status.ts`, `api/watermark.ts`
- **Upload SoT + UI:** `src/lib/uploadPipeline.ts`, `src/pages/Dashboard.tsx`
- **Client Turnstile wiring:** `src/pages/EventCapturePage.tsx`, `src/pages/QuestionnairePage.tsx`

## 5. Final limits (single source of truth) + decision rationale

| Limit | Value | Where | Why this value |
|---|---|---|---|
| Max upload size | **40 MB** | `uploadPipeline.MAX_UPLOAD_BYTES` | Covers any real high-res JPEG/PNG deliverable; blocks RAW/video/abuse. Safer than 75MB (mine), more headroom than 25MB (theirs) so legit large exports aren't wrongly rejected. |
| Max files per batch | **1000** | `uploadPipeline.MAX_UPLOAD_BATCH` | Guards accidental mega-drops; larger galleries upload across batches. Uploads are auth+token-gated, so this is a UX guardrail, not an abuse cap. Overflow is queued as "first N uploaded". |
| Supported formats | **JPEG / PNG / WebP** | `uploadPipeline` | The formats the on-the-fly transform can decode. |
| HEIC / HEIF | **rejected (clear message)** | `uploadPipeline` | Transform can't decode HEIC; accepting it broke gallery images. User told to export JPEG. |
| Lead: per-event / min | **60** | `capture-lead` | Accommodates simultaneous QR scans at a large event; above it SMS is withheld but lead saved + link returned. |
| Lead: per-phone / hour | **5** | `capture-lead` | Same phone across events — abuse/dup guard; generous for a real person. |
| Questionnaire: per-form / min | **60** | `submit-questionnaire` | Same rationale as lead. |
| Questionnaire: per-contact / hour | **5** | `submit-questionnaire` | Same rationale. |
| Answers payload | **≤ 20 000 bytes** | `submit-questionnaire` | Rejects pathological payloads. |
| Name field | **≤ 80 chars** | both | Truncated before entering the SMS body. |
| Public forms enabled | **ON unless `PUBLIC_FORMS_ENABLED=false`** | `publicEndpointGuards` | Forms are real product flows and now fully protected; kill switch remains for emergencies. ⚠️ Confirm this default (see §7). |

## 6. Environment variables required

| Var | Scope | Effect if unset |
|---|---|---|
| `CF_TURNSTILE_SECRET` | Supabase/Vercel server | Turnstile can't verify → verifier returns `unavailable` → falls back to rate limits (still safe, no CAPTCHA). |
| `VITE_CF_TURNSTILE_SITE_KEY` | Vercel build (client) | Widget not rendered → no token sent → server falls back to rate limits. |
| `PUBLIC_FORMS_ENABLED` | server | Unset = **forms enabled**. Set to `false` to disable both public endpoints (404). |
| `SENTRY_DSN` or `VITE_SENTRY_DSN` | server | Server Sentry is a no-op (console-only). |
| `TWILIO_ACCOUNT_SID` / `_AUTH_TOKEN` / `_PHONE_NUMBER` | server | SMS "not configured" (unchanged). |
| `RESEND_API_KEY` | server | Email skipped (unchanged). |
| `SUPABASE_SERVICE_ROLE_KEY` | server | 500 (unchanged). |

No new **required** vars; Turnstile + Sentry degrade safely if absent.

## 7. Tests performed

- **Client TypeScript** (`tsc -p tsconfig.json`): ✅ clean (post-rebase).
- **API + server TypeScript** (`tsc` nodenext, resolves `.js`→`.ts`): ✅ clean for guards, sentryServer, both endpoints.
- **Client build** (`vite build`): ✅ clean.
- **Runtime unit-check of `publicEndpointGuards`** (esbuild+node, 13 assertions): ✅ 13/13 — validators, PII masking, tri-state Turnstile (`absent`; `unavailable` on missing secret, i.e. fail-open not block), kill-switch on/off.
- **PII log audit**: ✅ every phone/email in a log line is wrapped in `maskPhone`/`maskEmail`; Sentry context carries only UUIDs/counts/reason strings, scrubbed by `sentryServer.scrub()`.
- **Not run (needs a live preview deploy + backend + auth):** end-to-end lead capture, questionnaire, SMS, email resend, upload, HEIC rejection, large-batch, gallery access, face search, download. **No ESLint is configured/installed** in the repo (TypeScript strict is the effective lint gate). Recommend running the flow matrix against a Vercel preview before merge.

## 8. Remaining risks

1. **HEIC now rejected.** Photographers who upload straight-from-iPhone HEIC will be told to export JPEG. This is *correct* (HEIC was silently breaking before) but is a behavior change — worth a heads-up in release notes.
2. **`PUBLIC_FORMS_ENABLED` defaults ON.** If the launch intends these forms to stay off, set `PUBLIC_FORMS_ENABLED=false`. Confirm the desired default.
3. **Turnstile is only as strong as its env.** With the secret/site-key unset, protection degrades to rate-limits-only. Confirm both are set in prod.
4. **Rate-limit tuning.** A mega-event exceeding 60 signups/min withholds SMS for the overflow (link still shown on-screen). Tunable if real events exceed this.
5. **Live flows unverified.** All the §7 "not run" flows need a preview deploy to confirm end-to-end (especially the client Turnstile token actually reaching the server, and SMS/email delivery).

## 9. Rollback plan

- **Nothing is merged or deployed** — the safest state.
- **Instant, no-deploy kill:** set `PUBLIC_FORMS_ENABLED=false` to disable both public endpoints immediately.
- **After merge, to revert code:** `git revert` the reconcile commit (`907ba08`) restores prior endpoint/upload behavior; revert the Sentry commit (`fd326e9`) to remove server Sentry. Both are additive and independently revertible.
- **Server Sentry** is a no-op without a DSN, so it carries no runtime risk even if left in.
- **Upload validation** is client-side + a pipeline guard; reverting the reconcile commit fully restores the old permissive behavior.
