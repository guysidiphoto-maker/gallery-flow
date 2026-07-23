# Client Portal V2 — Live Browser QA Report

Date: 2026-07-23 · Branch: `feat/client-portal-v2` (local only) · **Nothing pushed/merged/promoted; Production & Staging untouched.**

## Environments
- **Preview URL (final):** `https://pixflow-client-portal-v2-qa-p2br9p4jt.vercel.app` (Vercel target = Preview, never `--prod`). Dedicated Vercel project `pixflow-client-portal-v2-qa-web` (separate from the shared `gallery-web` project).
- **QA Supabase:** `pixflow-cpv2-qa2` (`icxitoczqtcgdkwiaxxc`) — built ADDITIVELY (no destructive reset), auth healthy. Migrations `088`–`095` + prod-faithful prerequisites. Synthetic data only.
- **The old broken QA project (`svbtemxmitufxaaszrkv`) was manually deleted by the operator** (its `DROP SCHEMA public CASCADE` had corrupted GoTrue auth); billing stopped.
- Owner web login is Google-OAuth-only, so owner flows were driven via **Supabase session injection** (email/password token grant → localStorage, same technique as the repo's Playwright e2e). Client flows used real email/password login.

## 🐞 Bugs found in browser QA and fixed (all committed)
1. **`withSentry(handler)` → `withSentry('name', handler)`** (`client-admin.ts`, `client-portal.ts`) — handler passed as the endpoint name → every client API threw `handler is not a function` → 500. Slipped through because `tsconfig` `include` is `["src"]` only (api/ never type-checked) and Vercel esbuild transpiles without type errors. → `00e50e2`.
2. **Missing member-read RLS** — portal showed "No galleries found" for authenticated members (live-content read policies were `TO anon` only). Migration **095** adds member-scoped SELECT on live galleries/images/sections/stories. → `f5ca103`.
3. **Production UI gating incomplete** — a non-entitled member still saw the content-engine Dashboard, Social Studio, Stories, and the Creative Engine button. Now all Production framing (home/Dashboard overview, Social Studio, Stories, Tender, Creative Engine) is hidden from nav/cards and direct tab access redirects to Galleries. → `238079c`.

## Live test results (all ✅)
| Flow | Result |
|---|---|
| Owner login → Dashboard | ✅ tokens 250, plan loaded, "לקוחות" nav enabled |
| Clients Manager list | ✅ only Studio A's clients (RLS); correct counts |
| Client detail | ✅ portal link, Preview-as-Client, galleries (published/draft), member + actions |
| Invite client user | ✅ 200, copy-link returned, **no email** |
| Accept invitation → set password | ✅ new account created + signed in → portal |
| Client portal (member) | ✅ shows only assigned **live** gallery; draft hidden |
| Bootstrap self-scoping + entitlement flag | ✅ `production_suite:false` (Studio A), galleries=["A1 Wedding"] |
| **Production gating — non-entitled** (membera1/Studio A) | ✅ Dashboard + Social Studio + Stories + Creative Engine **hidden**; only Library + My Page |
| **Production gating — entitled** (memberc1/Production C) | ✅ Dashboard + Social Studio **visible**, content engine, C1 Event |
| Cross-client URL tampering (membera1 → C1 portal) | ✅ "No galleries found" — **fail closed** |
| Cross-business assign/unassign (owner A → bizC gallery) | ✅ blocked (`gallery_not_in_business` / `unassign_failed`) |
| Disable membership → active session access | ✅ **immediately 0 memberships/0 galleries** |
| Reactivate membership | ✅ access returns (["A1 Wedding"]) |
| Unassign gallery | ✅ **immediately removed** from portal |
| Reassign gallery | ✅ returns |
| Account menu + Logout | ✅ session cleared → `/client-login` |

## Re-run after fixes (task 5)
- **Typecheck** (`tsc --noEmit -p .`): 0 errors. API files typechecked separately: 0 errors.
- **Build**: the Preview redeploy ran `npm run build` successfully (READY).
- **Offline CPV2 tests**: cpv2-entitlements 13 · cpv2-membership 9 · cpv2-clientadmin 18 · cpv2-adversarial 5 → **45/45**.
- **Regression (offline)**: blocker2-ownerAuth 13 · cover-image 16 · dedupe-upload 9 · upload-count 15 → **53/53**.
- **DB adversarial** (re-run on the new project, live JWT-role simulation): owner cross-business isolation, member self-scoping (draft/cross-client excluded), C1 entitled / A1 not, cross-business assign raises, anon fully denied → **all pass**.

## Remaining limitations (not exhaustively live-tested; budget/scope)
- **Mobile layout** and a **second concurrent browser session** were not resize/second-window tested live. (Bootstrap is stateless + self-scoped by `auth.uid()`, so a second session returns identical scoped data — validated implicitly via independent token grants.)
- **Public-gallery viewer / downloads / favorites / face recognition / publishing** remain outside the QA schema (need viewer RPCs / AWS / desktop).
- The QA Supabase schema is a **prod-faithful reconstruction, not full prod parity** (the repo's historical migration chain isn't cleanly replayable — see the QA-and-Deploy doc).
- One cosmetic note resolved: Production framing now fully hidden for non-entitled members.

## Complete migration list (additive, reversible; NOT applied to prod/staging)
`088` client_memberships + client_invitations · `089` business_entitlements + resolvers · `090` client_access_audit + append RPC · `091` bootstrap + service-role primitives · `092` owner read RPCs · `093` auth-user-by-email · `094` bootstrap production_suite flag · `095` member-read RLS. All have paired `_rollback.sql`.

## GO / NO-GO
**GO for a Staging rollout of Client Portal V2**, conditioned on: applying migrations `088`–`095` to Staging, granting `production_suite` to the businesses that should have it, and a short mobile/second-session pass. Core owner+client loop, tenant isolation, entitlement gating, and immediate revocation are all proven end-to-end on a real deployment; the three integration bugs are fixed and committed. **NO-GO for direct Production** without the Staging pass + explicit approval.

## Confirmation
No push, no merge, no production/staging deploy, no migrations applied to Production or Staging. The working QA Supabase project and Vercel Preview remain active (not deleted). The old broken QA project was deleted manually by the operator.
