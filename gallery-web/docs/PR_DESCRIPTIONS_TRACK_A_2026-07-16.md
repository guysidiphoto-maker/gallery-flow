# Track A — PR descriptions (ready to paste into GitHub)

`gh` is not installed locally, so open PRs from the GitHub UI and paste the body below.

---

## PRIMARY PR — merge this one

**Branch:** `security/track-a-hardening-reconciled` → `main`
**Title:** `security: harden public form endpoints + upload validation + server-side Sentry`

### Problem
Two public, unauthenticated endpoints (`api/capture-lead`, `api/submit-questionnaire`) sent Twilio SMS / Resend email with no auth, CAPTCHA, or rate limit — an open wallet-drain / SMS-bombing vector (P0). Separately, photo uploads streamed originals to storage with no type/size check (P1) — PDFs/videos/100MB files and HEIC (which the transform can't decode) could be uploaded, each consuming a token. And API/serverless failures were invisible (no server-side error tracking).

### Root cause
The endpoints trusted the request body directly and always called the paid provider. The file `<input accept="image/*">` was bypassed by drag-and-drop. There was no server error reporter (only `console.error`, invisible in production).

### Changes
- **`server/publicEndpointGuards.ts`** (new, single source of truth): kill switch (`PUBLIC_FORMS_ENABLED`), input validators, PII-safe log masking (`maskPhone`/`maskEmail`), persistent DB-row-count rate limiting, and a **tri-state Turnstile** verifier (`ok | invalid | unavailable | absent`).
- **`api/capture-lead.ts` / `api/submit-questionnaire.ts`**: reconciled to validate input, verify Turnstile end-to-end, rate-limit, and **preserve submitted data** (lead/response always stored) while withholding only the cost-bearing SMS/email. Wrapped with `withSentry`.
- **`server/sentryServer.ts`** (dependency-free) + `withSentry` across 12 API endpoints — server-side error reporting with a PII/secret `scrub()`.
- **Uploads**: `uploadPipeline.ts` is the single source of truth (40MB cap, 1000/batch, JPEG/PNG/WebP, HEIC rejected with guidance). Validated at both the pipeline (defensive gate) and the Dashboard (pre-filter + clear Hebrew errors). Unexpected upload failures reported to the existing client Sentry.
- **Client**: `EventCapturePage` / `QuestionnairePage` render the invisible Turnstile widget and send the token.

### Security impact
Closes the SMS/email wallet-drain P0 (bots blocked by Turnstile + rate limits; humans unaffected). Closes the upload-validation P1. Adds server-side error visibility. No PII reaches logs or Sentry (masked + scrubbed). Fail-open-safe: a Cloudflare/DB outage degrades to rate-limiting, never a hard block of real users.

### Tests performed
- Client `tsc` ✅, API+server `tsc` (nodenext) ✅, `vite build` ✅ (on rebased branch).
- Runtime unit-check of the guard module: 13/13 (validators, masking, tri-state Turnstile fail-open, kill switch).
- Adversarial code review (1 P2 found and fixed: questionnaire rate-count moved before insert).
- PII log audit ✅. **Not run:** live end-to-end flows (need a Vercel preview + backend + auth) — see `TRACK_A_MORNING_HANDOFF`.

### Environment variables required
None newly *required*. Behaviour degrades safely if unset: `CF_TURNSTILE_SECRET` + `VITE_CF_TURNSTILE_SITE_KEY` (Turnstile; else rate-limit-only), `PUBLIC_FORMS_ENABLED` (unset = enabled; `false` = emergency off), `SENTRY_DSN`/`VITE_SENTRY_DSN` (server Sentry; else console-only). Existing: `TWILIO_*`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

### Rollout risks
1. **HEIC now rejected** with a "export JPEG" message (was silently breaking) — mention in release notes.
2. `PUBLIC_FORMS_ENABLED` defaults **ON** — confirm the forms should be live (they're now protected). Set `false` to disable.
3. Turnstile only enforced when its two env vars are set; otherwise rate-limits carry the load.

### Rollback procedure
Nothing to un-deploy until merged. After merge: `git revert 907ba08` restores prior endpoint/upload behaviour; `git revert fd326e9` removes server Sentry (both additive, independently revertible). Instant no-deploy kill of the forms: set `PUBLIC_FORMS_ENABLED=false`.

### Full detail
`gallery-web/docs/TRACK_A_RECONCILIATION_REPORT_2026-07-16.md`

---

## Superseded branches — DO NOT open PRs for these (close after the primary merges)

These were reconciled INTO the primary PR. Per your instruction they were **not** deleted. Recommend closing (not deleting) once the primary is merged:

- `security/lock-public-form-endpoints` (mine) — superseded
- `fix/upload-validation-sentry` (mine) — superseded
- `fix/public-endpoints-rate-limit` — superseded (its kill switch + validators + masking + rate limits were adopted)
- `fix/upload-validation` — superseded (its HEIC handling + batch cap were adopted)
- `fix/upload-input-validation` (local only) — superseded
- `fix/server-side-sentry` — **fully absorbed** (cherry-picked into the primary); close after merge.
