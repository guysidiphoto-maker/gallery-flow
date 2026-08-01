# Client Portal V2 — Dedicated QA Project Run Report

Date: 2026-07-23 · Branch: `feat/client-portal-v2` (local; nothing pushed/deployed) · Prod & staging untouched (read-only introspection only).

## 1. Test project name and purpose
- **Name:** `pixflow-client-portal-v2-qa` · **ref:** `svbtemxmitufxaaszrkv` · region `ap-southeast-2` · org `zrkgnikhgnxjzoqoaawn`.
- **Purpose:** isolated, throwaway database exclusively for Client Portal V2 database-level adversarial QA. Synthetic data only. No prod data copied, no prod users, no emails sent, no secrets committed. Separate from `staging` (`bkccdomovxtuqdxrahnc`) and `prod` (`vlyiqfawkrjvqcmkpfvs`).

## 2. Migration chain applied
The repo's historical chain is **not cleanly replayable** on a fresh DB (documented failures, §5). To keep QA faithful and reliable, the CPV2 **prerequisite tables were provisioned with a minimal DDL matching prod's exact column definitions** (verified earlier against prod `information_schema`: `businesses`, `clients` incl. `slug`+`access_code_hash`, `galleries` incl. `client_id`+`status`+`event_date`+`delivery_settings`+`published_at`, plus prod-equivalent RLS: `businesses_owner_select`, `clients_owner_all`, `galleries_owner_all`, `galleries_public_live`). Then the **real CPV2 migrations `088`–`094`** (verbatim from the branch) were applied on top:
`088` client_memberships + client_invitations · `089` business_entitlements + resolvers · `090` client_access_audit + append RPC · `091` bootstrap + service-role primitives · `092` owner read RPCs · `093` auth-user-by-email · `094` bootstrap w/ production_suite flag. **All applied without error.**

## 3. Synthetic test data created
3 businesses: Studio A, Studio B, Production **C** (C granted `production_suite`). 6 clients (A1, A2, B1, C1 + `Legacy Empty` [no code], `Legacy Coded` [bcrypt hash + a live gallery with `clientCode`]). 5 galleries (A1 Live, A1 Draft, A2 Live, B1 Live, Legacy Coded Live). 8 synthetic `auth.users`. 7 memberships: active (A1, A2, C1), **disabled**, **revoked**, 2 invited (pending + expired). 2 invitations (valid pending / expired). 1 entitlement (C). Fixed UUIDs; no real identities.

## 4. Exact QA results — 6 groups, ~30 assertions, ALL PASS

**Group 1 — owner cross-business isolation (as authenticated Owner A):**
- Owner sees only own 4 clients (RLS) ✅ · `cpv2_owner_clients_overview` returns only own ✅ · `cpv2_owner_client_detail(B1)` → NULL (cross-business fail-closed) ✅ · own detail non-null ✅ · **detail strips `access_code_hash`** ✅ · Owner A not entitled ✅ · Owner A cannot see Business C memberships ✅ · legacy-PIN flags correct (coded=true, empty=false, account=false) ✅

**Group 2 — member A1 portal bootstrap self-scoping:** authenticated ✅ · exactly 1 membership (A1) ✅ · **exactly 1 gallery = A1 Live only** ✅ · **no draft, no A2, no B1** ✅ · `production_suite=false` ✅

**Group 3 — entitlement + non-active denial:** member C1 `production_suite=true` ✅ · **disabled, revoked, and non-member users all get empty memberships+galleries** ✅

**Group 4 — anonymous fully denied:** `client_portal_bootstrap`, `cpv2_owner_clients_overview`, `has_business_entitlement`, `cpv2_accept_invitation` all → permission denied for anon ✅ · anon reads 0 rows from memberships/invitations/entitlements ✅

**Group 5 — service-role RPCs + invitation lifecycle:** reassign accounting (previous_client_id correct) ✅ · cross-business gallery → `gallery_not_in_business` ✅ · foreign client → `client_not_in_business` ✅ · unassign clears `client_id` (immediate removal) ✅ · membership status cross-tenant → `membership_not_in_business` ✅ · accept wrong email → `invitation_email_mismatch` ✅ · expired → `invitation_expired` ✅ · valid accept → membership active + bound + invitation accepted ✅ · replay → `invitation_not_pending` ✅

**Group 6 — resolver + schema completeness:** resolver C=true, A=false, **expired=false**, unknown-capability=false ✅ · all 4 CPV2 tables present ✅ · all 11 CPV2 functions present ✅ · bootstrap contains `production_suite` ✅

## 5. Migration failures / inconsistencies found (valuable finding)
The repo cannot be replayed end-to-end onto a fresh database:
1. **`schema.sql` is a current-state snapshot**, so migration `003`'s `ALTER TABLE images RENAME COLUMN storage_path TO web_preview_path` fails (column already `web_preview_path`).
2. **`008_backfill_business_id.sql` is a manual-substitution migration** containing `<<<YOUR_USER_UUID>>>` and an unconditional `RAISE EXCEPTION` — aborts on any fresh apply.
3. **`015_plans_and_subscriptions.sql` integer overflow**: `50 * 1024 * 1024 * 1024` is evaluated as INT (overflow) before assignment to the BIGINT column → `22003 integer out of range`.
4. Files `067`, `074`, `079`, `080` exist in prod history (timestamp versions) but **have no file in the repo**, so a full replay also breaks at `068` (depends on `067`).
These are pre-existing repo-hygiene issues unrelated to CPV2, but they mean "apply the whole chain" is not currently possible without cleanup. CPV2 migrations `088`–`094` themselves applied cleanly.

## 6. Security & tenant-isolation results
Every tenant-isolation invariant held under real role/JWT simulation (`SET LOCAL role` + `request.jwt.claims`): cross-business owner reads blocked (RLS), cross-client member reads blocked (bootstrap self-scope), anon fully denied, service-role primitives reject cross-tenant ids, disabled/revoked lose access immediately, `access_code_hash` never leaves the DB, entitlement default-deny + expiry enforced. **No isolation failures.**

## 7. Browser QA results
**Not executed against this project.** Full browser QA (GoTrue `signInWithPassword`, password-setup form, second-session login, client-side tab gating) requires running the web app pointed at this project with real Auth users (the synthetic `auth.users` here were SQL-seeded without passwords and cannot GoTrue-login). The **data layer** behind every browser flow (invite → accept-bind → bootstrap → entitlement gating → disable→revoke) is proven above; the **app layer** is covered by the 45 offline unit tests + `tsc` + `vite build` (all green). Browser QA is deferred to a Preview deployment (QA-and-Deploy doc §E/§G).

## 8. Remaining blockers
- None for CPV2 correctness. To later apply CPV2 to prod, the prod schema already has all prerequisites (verified), so `088`–`094` apply directly. To apply to *staging*, staging must first be brought to the prod baseline (it is ~40 migrations behind) — or use this dedicated project pattern.
- Repo hygiene (§5) should be fixed before anyone attempts a full-chain replay elsewhere.

## 9. GO / NO-GO for a future Preview deployment
**GO (conditional)** — CPV2 migrations apply cleanly and every database-level security invariant passes on a prod-faithful schema. Conditions before Preview: (1) apply `088`–`094` to the Preview's database (prod-baseline or this project), (2) `SUPABASE_SERVICE_ROLE_KEY` present in the Preview env, (3) run the browser-level matrix (§7) once on the Preview. **NO-GO for direct prod** without that Preview pass and explicit approval.

## 10. Can the test project be paused/deleted?
**Yes — safely, at any time.** It contains only synthetic data, is not referenced by any app/env/deploy, and is isolated from staging/prod. It was **not** deleted automatically (per instruction). To stop the ~$10/mo charge, pause or delete it from the Supabase dashboard (or ask me to). Nothing depends on it.
