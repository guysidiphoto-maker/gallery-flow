# Integration Preview Hardening — Final Report (2026-07-24)

Phase goal: a real, isolated, working Vercel QA Preview containing the final overnight commit + hardening, plus items A–F. Nothing merged, pushed, or deployed to Production/Staging. All DB changes on the isolated QA project only.

## 1. Exact deployed commit
`54b67b43c15848b75a8c8e58efb5f62f0ef0d006` (HEAD of `feat/client-portal-v2-overnight`). Contains the required final overnight commit `03fb5ac71d3c797c6a64e95983d873e667c4c944` as an ancestor, plus this phase's hardening commits (A/B/D/E + the 40MB fix).

## 2. Exact dedicated Vercel project ID
`prj_siCYAfHfeJ56gX4d8w527MUMqDvd` — name `pixflow-client-portal-v2-qa-web` (team `team_av9N4sqbNO4TSocERkTvYnbU`). This is the DEDICATED QA project, distinct from the shared Production project `gallery-web` = `prj_ZItyMnCwuMVQgPYEX7qcKSY4XwMH`.

## 3. Exact Preview URL
https://pixflow-client-portal-v2-qa-h1sby7teg.vercel.app
Deployment `dpl_F9XkzC175eYtEZkH6KewV7qbJDQ7`, state READY, **target = preview** (Vercel `target: null`, not production). Note: the URL has Vercel Deployment Protection ON, so open it while logged into your Vercel account (guysidiphoto-maker) — it resolves the SSO automatically for you.

## 4. Confirmation: Preview uses ONLY the QA database
Verified three ways: (a) env var NAMES on the project are all Preview-scoped: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_FEATURE_NEW_IA` — no prod/staging refs; (b) runtime proof: a session token keyed to the QA project ref (`sb-icxitoczqtcgdkwiaxxc-auth-token`) was accepted by the deployed app and loaded QA data (it would be ignored if the app pointed at prod/staging); (c) an API-mediated write (create client) on the deployed preview wrote to the QA DB. There is NO `FEATURE_SOCIAL_STUDIO` env var → Social stays locked.

## 5. Confirmation: Production and Staging untouched
- Shared Production Vercel project `gallery-web` (`prj_ZItyMnCwuMVQgPYEX7qcKSY4XwMH`): NOT deployed. The main checkout's `.vercel` still links to it, untouched; the QA deploy ran from an isolated git worktree.
- Supabase Production `vlyiqfawkrjvqcmkpfvs` and Staging `bkccdomovxtuqdxrahnc`: NOT touched. Every migration and query targeted only QA `icxitoczqtcgdkwiaxxc`.
- The one `target:production` deployment visible on the QA project is from the PRIOR session (commit `4cdd0ec`), on the QA project's own isolated production env — not the shared gallery-web production, and not created this phase. My deploy is target=preview.
- Service-role key: server-only. Never in `src/`, never in the built `dist/` bundle, no `VITE_`-prefixed service var; only referenced in `api/*` server functions.

## 6. New migration list (all QA-only, additive + rollback, all applied to QA and verified)
- `096_onboarding_progress` — onboarding state (prior phase).
- `097_gallery_event_metadata` — event metadata cols + audit CHECK extension (prior phase).
- `098_search_rpcs` — search RPC + pg_trgm (prior phase).
- `099_import_center` — import tables (prior phase).
- `100_tender_collections` — tender tables (prior phase).
- `101_tender_grants_hardening` — explicit REVOKE anon / GRANT authenticated on tender (prior phase).
- `102_portal_client_resolver` — **NEW**: membership-gated `resolve_client_portal(business_slug, client_slug)` + `resolve_client_portal_by_id(client_id)` so the short `/:biz/c/:clientSlug` route resolves without exposing the `businesses`/`clients` tables to members. Enumeration-safe, minimal fields, authenticated+service_role only.
- `103_rls_initplan_error_hygiene` — **NEW**: rewrote all new-table RLS policies (096/099/100) to `(select auth.uid())` for initplan caching (no semantic change).

## 7. Exact test results
- `tsc --noEmit -p .` (src): clean, 0 errors.
- `tsc` api/server (nodenext strict): clean, 0 errors.
- `npm run build`: success (only the pre-existing >500 kB chunk-size warning).
- Offline test suites (`npx tsx`), **16 suites / 404 assertions / 0 failures**:
  entitlements 13, membership 9, clientadmin 18, adversarial 5, ownerAuth 13, cover-image 16, dedupe-upload 9, upload-count 15, social-lockdown 30, tour 29, assignment 34, search 65, tender 35, import-center 77, portal-route 23 (NEW), api-error-hygiene 13 (NEW).
- DB adversarial (live on QA): portal resolver enumeration test — member resolves own client (1 row), cross-business/anon/empty/oversized/SQL-injection all return 0 rows, `clients` table survived injection; assignment lifecycle — draft+assigned hidden, published visible to owner's member, cross-business hidden, reassign removes access immediately, unassign clears. All pass.
- Security advisors (QA, post-102/103): the new resolvers + search RPC appear only under the intentional "authenticated SECURITY DEFINER" class (self-scoped via auth.uid(), anon revoked) — the same class as the existing cpv2_owner_* functions; they are correctly NOT anon-executable. No new vulnerabilities. Pre-existing WARNs unchanged (legacy anon functions, leaked-password-protection auth setting, pg_trgm/citext in public schema — cosmetic).

## 8. Browser QA matrix (against the DEPLOYED Preview URL unless noted)
| Case | Result |
|---|---|
| App loads on deployed URL (SSO via your Vercel session) | PASS |
| Uses QA DB (runtime token-ref proof) | PASS |
| Owner login screen (Google OAuth) | PASS (renders; OAuth not automatable) |
| Owner dashboard + new nav (Overview/Search/Tender/Import) | PASS |
| Clients Manager + real QA data + natural Hebrew | PASS |
| API-mediated write: create client via deployed function | PASS (wrote to QA, cleaned up) |
| Short portal route `/:biz/c/:clientSlug` (item A) | PASS (previously "Business not found") |
| Client portal Overview (correct Hebrew punctuation) | PASS |
| Social Studio locked for ENTITLED member (Coming soon panel) | PASS |
| No console errors | PASS |
| English locale for new UI | PASS (verified local; ownerLocale toggle) |
| Assignment lifecycle end-to-end | PASS (DB-level on QA; UI field verified) |
Notes: Google-OAuth owner login and the deployed API writes cannot be exercised by plain local `vite dev`, so those were validated on the DEPLOYED preview (and via QA DB for the RPC path). Mobile reflow: the layout uses responsive CSS (clamp/flex-wrap) and builds clean; a dedicated mobile screenshot pass is a remaining nice-to-have.

## 9. Screenshots
Captured during this phase (saved to disk): deployed owner login, deployed owner dashboard + nav, deployed Clients Manager, new-client modal, created-client detail (API write), deployed short-route client portal, deployed Social Coming-soon panel; plus local: Overview, Search result, Tender form, Import wizard, new-gallery modal with the "assign to client" field + client picker (with inline "create new client"), English nav.

## 10. Remaining known limitations
- **Deployment Protection (SSO)** is ON for the preview: you open it fine (logged into Vercel); a fully public share link would need protection disabled or a bypass token.
- **Pixieset import** browser JSZip flow is a SYNTHETIC PROTOTYPE (labeled as such); large/real migrations need the server-worker architecture in `docs/PIXIESET-IMPORT-PRODUCTION-ARCHITECTURE.md`.
- **RAW/TIFF/HEIC** still unsupported by the web upload pipeline (JPEG/PNG/WebP only); the 40MB→200MB fix covers high-res JPEGs but RAW originals from Pixieset need server-side transcode (documented).
- **QA `businesses` table** has no public slug-read policy; the short route now works via the membership-gated resolver (102). A production rollout should confirm the equivalent public-gallery slug path (`get_business_by_slug` exists and is anon-safe).
- **pg_trgm/citext in public schema** — cosmetic Supabase lint; move to a dedicated schema at prod hardening time.
- **Minor copy**: a couple of pre-existing strings in the Clients components still use an em-dash / guillemets (outside the wave-1 string modules the UX pass covered). Low priority; listed in `docs/UX-HEBREW-REVIEW-2026-07-24.md`.

## 11. GO / NO-GO for your manual Preview review
**GO.** The Preview is live, isolated to the QA database, contains all overnight + hardening features, passes typecheck/build/404 tests/DB adversarial/security review, and was browser-verified end-to-end on the deployed URL including an API-mediated write and the short portal route. Open it logged into Vercel.

## 12. Your 10-minute manual checklist
1. Open https://pixflow-client-portal-v2-qa-h1sby7teg.vercel.app while logged into Vercel. Confirm the Pixflow login screen appears (not a Vercel error).
2. Owner view: sign in with the QA owner (Google) OR reuse your session. Click Overview (סקירה) — see status cards + recent galleries. Click Search (חיפוש), type "Wedding" — see the A1 Wedding result with a match-reason chip.
3. Click Tender library (מאגר למכרזים) and Import (ייבוא) — confirm both screens load; Import step 1 shows the truthful "export from Pixieset yourself" instructions.
4. Click New Gallery — confirm the "שייך ללקוח (לא חובה)" field with a searchable client list and "create new client".
5. Client view: open `/production-c/c/client-c1` (the short URL) — confirm the client portal loads (this is the route we fixed). Click "סטודיו לרשתות · בקרוב" — confirm it shows the "Coming soon" lock panel, NOT a studio.
6. Toggle English (top-right on the portal; owner locale toggles the new nav) — confirm labels switch cleanly.
7. If all looks right: tell me to open a PR / plan Staging (I have NOT done either).

## Resources still running (no new cost)
- QA Supabase `pixflow-cpv2-qa2` (`icxitoczqtcgdkwiaxxc`) — active, free tier.
- QA Vercel project `pixflow-client-portal-v2-qa-web` — preview live.
- Local git worktree `/tmp/pixflow-qa-preview` (detached at the deployed commit, linked to the QA project) — kept so re-deploys are one command; safe to delete anytime with `git worktree remove --force /tmp/pixflow-qa-preview`.
- `gallery-web/.env.local` still points local `npm run dev` at QA (publishable anon key only, gitignored).
- No new paid resources created; no QA resources deleted.
