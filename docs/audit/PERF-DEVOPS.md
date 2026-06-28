# Pixflow — Performance / DevOps Launch-Readiness Audit

**Surface:** Web app (`gallery-web/`) on Vercel + Supabase PROD
**Date:** 2026-06-29 (overnight launch sprint)
**Role:** Performance / DevOps Engineer — **READ-ONLY audit, no changes made**
**Prod URL:** https://pixflow-ai.com
**Vercel project:** `gallery-web` (`prj_ZItyMnCwuMVQgPYEX7qcKSY4XwMH`, team `team_av9N4sqbNO4TSocERkTvYnbU`)
**Supabase PROD:** `vlyiqfawkrjvqcmkpfvs` · **STAGING:** `bkccdomovxtuqdxrahnc`

---

## Executive Summary

**Health verdict: 🟢 GREEN (operationally) — no live production-down risks from a perf/devops standpoint.**

The production deployment is healthy. The current promoted deployment (`dpl_AdMhZR9x6h6qpT6F1wSF9KWkDPRY`, commit `5d071b1`, PR #181) is `READY`. **No real 500s, no `FUNCTION_INVOCATION_FAILED`, and no function timeouts** were found in the runtime logs for the live deployment. Every Vercel log entry tagged `error` is a **false positive**: the function returned HTTP **200** and was flagged only because Node writes a harmless `DEP0169` `url.parse()` deprecation warning to stderr.

Caveat downgrading this from "all-clear": there is **no application error monitoring you can trust at a glance** (the `error`-level filter is 100% noise today, so a real 500 would be hard to spot), and there are several **P2 hardening/perf items** — most notably static assets are **not** cache-optimized and a Node runtime-version mismatch in config.

The DB-security posture (RLS, SECURITY DEFINER exposure, public buckets) is being handled by the Security agent — flagged here only where it overlaps devops. **Zero ERROR-level advisors** exist; everything is WARN/INFO.

| Area | Verdict |
|---|---|
| Vercel deployments / current prod | 🟢 Healthy, READY, rollback candidates available |
| Real 500s / timeouts in runtime logs | 🟢 None (all "errors" are 200s + a deprecation warning) |
| Supabase logs (api/postgres/edge) | 🟢 No systemic app errors; DB ERRORs are MCP/manual SQL probing |
| Supabase advisors (security + perf) | 🟡 0 ERROR; many WARN (RLS init-plan, FK indexes, SECURITY DEFINER) |
| Function config / count / Pro limits | 🟢 17 functions, on Pro; not near a limit |
| Required env vars | 🟡 Owner must verify ~15 runtime vars (checklist below) |
| Caching / asset perf | 🟡 Hashed assets served `max-age=0` — real perf miss |
| Build health | 🟢 Vite build is the deploy path; deploys are READY |
| Monitoring | 🟡 Error signal is pure noise; gaps listed below |

---

## P0 — Launch blockers (perf/devops)

**None.** No production-down or imminent-failure perf/devops issue was found.

---

## P1 — Should fix before/around launch

### P1-1 — Error monitoring is effectively blind (DEP0169 noise floods the error channel)
**Evidence:** Every entry returned by Vercel runtime logs at `level=error` for the live deployment is an HTTP **200** whose only "error" output is:
```
(node:4) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized ...
```
Sampled requests: `GET /` (cache MISS/STALE), `GET /gallery/sample-001`, `GET /gallery/nonexistent-xyz` — **all 200**.
**Impact:** The `error` log filter is 100% false positives, so a genuine 500 would be buried in noise and likely missed in an on-call scan. This is a *monitoring* risk, not an outage.
**Fix direction:** Replace `url.parse()` with the WHATWG `URL` API in the SSR functions (`api/page.ts`, `api/gallery-page.ts`, `api/share.ts`, `api/sitemap.xml.ts` — whichever import the legacy parser) to silence the warning, OR wire Sentry server-side so real errors surface independently of stderr noise. (`VITE_SENTRY_DSN` exists for the client; confirm a server DSN path exists too.)

### P1-2 — Runtime-version mismatch between config and what's actually deployed
**Evidence:** `.vercel/project.json` sets `nodeVersion: "24.x"`, but every deployment's `lambdaRuntimeStats` reports `nodejs:18` (one older deploy even shows `17`). `gallery-web/package.json` has **no `engines.node`** pin.
**Impact:** The functions are running on Node 18, not the 24.x the project believes it's on. Node 18 is past its maintenance window. A future forced bump by Vercel could change behavior unexpectedly at the worst time.
**Fix direction:** Pin `engines.node` in `gallery-web/package.json` and reconcile with the project setting so deploys are deterministic. Verify on a preview before promoting.

---

## P2 — Hardening / perf improvements (post-launch acceptable)

### P2-1 — Content-hashed static assets are NOT cache-optimized (real perf miss)
**Evidence (curl -I on prod):**
```
/                       cache-control: public                 (SSR HTML — OK)
/app.html               cache-control: public, max-age=0, must-revalidate   (OK for shell)
/assets/index-DMgMWFCB.js   cache-control: public, max-age=0, must-revalidate   ← immutable hashed asset
/sitemap.xml            cache-control: public                 (OK)
```
The JS/CSS bundles carry a content hash in the filename (`index-DMgMWFCB.js`) yet are served `max-age=0, must-revalidate`. Returning visitors re-validate every hashed asset on every page load instead of serving from cache. `vercel.json` has **no `headers` block**.
**Impact:** Slower repeat loads and extra origin revalidation traffic; hurts Core Web Vitals on return visits. Not correctness-affecting.
**Fix direction:** Add a `headers` rule in `vercel.json` for `/assets/(.*)` → `Cache-Control: public, max-age=31536000, immutable`. Safe because filenames are hash-busted.

### P2-2 — Long-running functions: time-out exposure on the heavy endpoints
**Evidence (grep `maxDuration`):**
| Function | maxDuration |
|---|---|
| `api/stories/render.ts` (via vercel.json) | **300s** |
| `api/gallery-zip.ts` | **300s** (5-min, "Vercel Pro" comment) |
| `api/score-images.ts`, `plan-event.ts`, `generate-campaign.ts`, `generate-feed.ts`, `append-event-posts.ts` | 60s |
| `api/watermark.ts` | 30s |
**Assessment:** These caps confirm a **Pro plan** (Hobby caps at 60s). The 300s endpoints (story render, gallery ZIP) are the realistic timeout candidates under heavy galleries — they did **not** error in the current logs, but they are the ones to watch. No memory overrides are set (default memory). No live timeout was observed.
**Fix direction:** Add explicit timeout/size guards + user-facing failure messaging on `gallery-zip` and `stories/render`; consider chunked/streamed ZIP for very large galleries. Monitor p95 duration post-launch.

### P2-3 — DB performance advisors (0 ERROR, all WARN/INFO)
From `get_advisors(performance)` on PROD:
- **Unindexed foreign keys (INFO ×7):** `events.gallery_id`, `gallery_download_log.image_id`, `gallery_favorites.image_id`, `gallery_hidden_images.image_id`, `story_renders.requested_by`, `subscriptions.business_id`, `subscriptions.plan_id`. Add covering indexes if these tables grow.
- **`auth_rls_initplan` (WARN ×many):** RLS policies call `auth.<fn>()`/`current_setting()` per-row instead of `(select auth.<fn>())`. Suboptimal at scale across `businesses`, `events`, `feed_plans`, `story_renders`, `token_ledger`, `gallery_*`, etc. Cheap, high-value fix.
- **Multiple permissive policies (WARN):** `events`, `questionnaires`, `gallery_hidden_images` evaluate 2 policies per SELECT.
- **Duplicate index (WARN):** `businesses` has identical `businesses_slug_idx` + `businesses_slug_key` — drop one.
- **Unused indexes (INFO ×11):** candidates for removal (e.g. `gallery_unlock_tokens_expires_idx`, `idx_events_business_id`, `story_renders_status_idx`).
- **Auth connection strategy is absolute (INFO):** Auth capped at 10 connections; switch to percentage-based before scaling instance size.

**No slow-RPC or missing-index that blocks launch** — all are scale-time optimizations.

### P2-4 — Stale `chore/free-up-vercel-functions` branch is a no-op now
**Evidence:** The branch's only commit (`5f53c0b`) deletes `api/analyze-tender.ts` and `api/generate-pitch.ts` — **but neither file exists on `main`** anymore. The cleanup already landed. The branch is stale and can be deleted; **function count is not a deploy risk** (see below).

---

## P3 — Notes / informational

- **DB ERRORs in postgres logs are NOT application errors.** The ERRORs seen (`invalid input value for enum gallery_status: "published"`, `column g.is_published does not exist`, `missing FROM-clause entry for table "n"`, `aggregate function calls cannot contain set-returning function calls`, `permission denied for function add_tokens`) all originate from **MCP / manual SQL probing sessions** (the `add_tokens` one is timestamped to a 2026-06-28 `POST /mcp` REVOKE session). They are audit/remediation artifacts, not runtime app failures.
- **Application-level DB ERRORs worth a glance:** `business_tokens_business_id_fkey` FK violation (×2) and `gallery_not_found` — low frequency, likely edge-case inputs; not systemic.
- **Edge Function logs:** the only active edge function (`backfill-derivatives`) ran a large successful backfill — dozens of `200`s at 20–34s each, one `401` (expected auth gate). Healthy.
- **Build health:** Deploy path is `vite build` (+ `prebuild` bundle-stories, `postbuild` rename-shell that hard-fails if the SPA shell is missing — good guard). Deploys are landing `READY`. No `typecheck`/`tsc` script exists in `package.json` (typecheck happens only implicitly via Vite). A standalone `tsc --noEmit` was **not** run (timeboxed; would not catch the ESM-extension class of runtime bug that already bit PR #176 anyway).
- **Cron:** one cron `/api/retry-failed-sends` daily at `00:00`; gated by `x-vercel-cron` header + optional `CRON_SECRET`. Sane.

---

## Vercel function count & plan-limit risk

- **17 serverless functions** deploy from `gallery-web/api/` (16 `.ts` + `og.tsx`; `README.md` is not a function): `append-event-posts, capture-lead, gallery-page, gallery-zip, generate-campaign, generate-captions, generate-feed, og, page, plan-event, retry-failed-sends, score-images, share, sitemap.xml, stories/render, stories/status, submit-questionnaire, watermark`.
- **Plan:** The presence of `maxDuration: 300` (and 60s caps) proves **Pro**. Pro does not have the Hobby 12-function cap.
- **Verdict:** **Function count is NOT a deploy risk.** The `chore/free-up-vercel-functions` branch is obsolete (its deletions already merged).

---

## REQUIRED prod env vars to verify (owner action — values not readable from here)

Grepped from `process.env.*` / `import.meta.env.*` across `api/`, `seo/`, `scripts/`, `src/`. **If missing in prod, these silently break the named feature.**

**Server (Vercel function) env — REQUIRED:**
- [ ] `SUPABASE_URL` — DB access for all SSR/api functions
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — privileged DB ops (uploads, token grants, paid-gallery)
- [ ] `SUPABASE_ANON_KEY` — anon-scoped server calls
- [ ] `ANTHROPIC_API_KEY` — **AI endpoints null-guard and no-op/500 if missing.** `score-images, plan-event, generate-campaign, generate-feed, generate-captions` all do `process.env.ANTHROPIC_API_KEY || ''` then bail with `anthropic_not_configured`. **Silent feature break if unset.**
- [ ] `RESEND_API_KEY` — gallery/notification email delivery
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — lead-capture / SMS (`retry-failed-sends`, `capture-lead`)
- [ ] `CRON_SECRET` — manual-trigger auth for the daily cron (optional but recommended)
- [ ] `CF_TURNSTILE_SECRET` — server-side Turnstile (anti-bot) validation
- [ ] `SITE_ORIGIN` / `NEXT_PUBLIC_SITE_URL` / `VERCEL_URL` — canonical URL building in SSR/sitemap
- [ ] `STORIES_BUNDLE_URL` — stories render bundle source

**Feature-flag / behavior env (default-off; verify intended state):**
- [ ] `SIGNED_URL_ENFORCE_ORIGINALS` — gates the PR #181 signed-download enforcement (coordinate with Security)
- [ ] `REQUIRE_CLIENT_SESSION_TOKEN` — client session gating

**Client (VITE_*, baked at build — must be set at BUILD time in prod):**
- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — client DB access (has prod fallback in code, but set explicitly)
- [ ] `VITE_CF_TURNSTILE_SITE_KEY` — Turnstile widget
- [ ] `VITE_PUBLIC_VIEWER_SIGNED_URLS` — signed-URL viewer path (pairs with `SIGNED_URL_ENFORCE_ORIGINALS`)
- [ ] `VITE_SENTRY_DSN` — **client error monitoring; if unset, Sentry is silently off** (see monitoring gaps)
- [ ] `VITE_GA4_MEASUREMENT_ID` — analytics (no-op if unset, by design)
- [ ] `VITE_FEATURE_GALLERY_BILLING`, `VITE_FEATURE_NEW_IA`, `VITE_USE_PUBLISHED_SNAPSHOT` — feature flags; confirm intended prod values

---

## Monitoring gaps

1. **The `error` log channel is 100% false positives** (DEP0169 on 200 responses). A real 500 today would be indistinguishable from noise in a quick scan. **Highest-leverage gap.** (P1-1)
2. **No confirmed server-side error capture.** `VITE_SENTRY_DSN` exists for the *client* SPA; if it's unset in prod, client errors are unmonitored, and there's no evidence of a *server* (function) Sentry DSN. Verify both.
3. **No synthetic uptime / health check** observed for `/` SSR, gallery render, or the AI endpoints. Recommend a simple external uptime ping on `/`, a known gallery, and `/sitemap.xml`.
4. **No p95 duration alerting** on the 300s functions (`gallery-zip`, `stories/render`) — the two most likely to eventually time out under load.
5. **GA4 + analytics are no-op until env IDs are set** — acceptable, but means zero product analytics until the owner sets `VITE_GA4_MEASUREMENT_ID`.

---

## What was checked (read-only, no mutations)

- Vercel: `list_deployments` (current prod identified, rollback candidates present), `get_runtime_logs` (per-deployment, `level=error`/`fatal`, 3-day window).
- Supabase PROD: `get_logs` for `postgres` and `edge-function`; `get_advisors` for `security` (90 lints) and `performance`.
- Repo: `vercel.json`, `.vercel/project.json`, `api/*` (`maxDuration`, AI null-guards, cron auth), `package.json` scripts, env-var grep, `chore/free-up-vercel-functions` diff.
- Live headers: `curl -I` on `/`, `/app.html`, a hashed `/assets/*.js`, `/sitemap.xml`.

**No deploys, env changes, rollbacks, commits, storage changes, or non-SELECT SQL were performed.**
