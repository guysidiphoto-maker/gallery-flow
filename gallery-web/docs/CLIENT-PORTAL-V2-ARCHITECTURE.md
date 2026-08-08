# Client Portal V2 — Shared Architecture & Data Contract

Branch: `feat/client-portal-v2` · Start commit: `03390a850f158323069e0af78c11f730a769af3a` · Status: **local only, nothing pushed/deployed/applied**

> This is the single source of truth for the program. All teams/agents build against these contracts. No competing schemas, no duplicate auth systems. If a change is needed, it changes **here first**, then in code.

---

## 0. Verified reality (Phase 0)

- Production project = `vlyiqfawkrjvqcmkpfvs`. Staging = `bkccdomovxtuqdxrahnc`. App `.env`/`.env.production` point at prod.
- **Migration `082` is committed as a file but NOT applied to production** (applied history: `081` → `085`, no 082/083/084). `083`/`084` do not exist as files anywhere.
- **`080_feed_plans_drop_anon_read` IS applied in prod** — the feed_plans anon-read leak from the older audit is already closed in production.
- Prod applied-migration versions are **timestamps** (e.g. `20260721140604`), while repo files use `NN_name.sql`. New files continue at **`088+`**. Actual apply-time version is assigned by the Supabase CLI.
- Existing building blocks confirmed in code: `clients`, `galleries.client_id` (nullable), `client_session_tokens`/`client_code_attempts`/`verify_client_code`/`verify_client_token`/`set_client_access_code` (migration 057), `server/ownerAuth.ts` (`requireBusinessOwnerOfClient`), `plans` (feature-flag columns), `subscriptions` (`plan_id`,`status`). No `tenant_type`, no `business_members`, no `production_suite`, no client-user membership model.
- Baseline: gallery-web `tsc --noEmit` = **green**. Build = `vite build`. Unit tests = standalone `npx tsx tests/*.test.ts` with mock Supabase (see `tests/blocker2-ownerAuth.test.ts`). e2e = Playwright skip-if-missing-env.

## 1. Design principles (non-negotiable)

1. **Fail closed.** Every authz path defaults to deny. Missing config = no access.
2. **Server is the source of truth.** Frontend flags only render nav; they never grant access. Every protected API + RPC + RLS policy independently re-verifies.
3. **Never trust route params / `client_id` / `business_id` from the browser.** Always resolve from `auth.uid()` → verified ownership or membership.
4. **Additive & reversible.** No column drops, no policy weakening. Every migration idempotent + paired `_rollback.sql`. Nothing applied to prod in this program.
5. **Reuse, don't rebuild.** `ClientDashboard`, `ownerAuth.ts`, 057 client-auth, existing design primitives.
6. **No secrets to the browser.** Service-role only on the server. No plaintext passwords/tokens/reset-links stored or logged.

## 2. Domain model (target)

```
businesses (1 per user, existing)
  ├─ business_entitlements (NEW)      capability flags e.g. 'production_suite'
  ├─ clients (existing)               business_id, name, slug, access_code_hash (legacy PIN)
  │    ├─ client_memberships (NEW)    auth_user_id ↔ client; role + status
  │    ├─ client_invitations (NEW)    token_hash lifecycle; expiry/resend/accept/cancel
  │    └─ client_access_audit (NEW)   scoped activity trail
  └─ galleries (existing)             business_id NOT NULL, client_id NULLABLE (assignment link)
```

Gallery↔client link stays `galleries.client_id` (no join table in V1). One gallery → one client; one client → many galleries.

### 2.1 `client_memberships` (NEW)
| column | type | notes |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| business_id | uuid NOT NULL → businesses(id) ON DELETE CASCADE | denormalized for RLS + tenant scoping |
| client_id | uuid NOT NULL → clients(id) ON DELETE CASCADE | |
| auth_user_id | uuid NULL → auth.users(id) ON DELETE SET NULL | NULL until invitation accepted |
| email | citext NOT NULL | invited identity; lowercased |
| role | text NOT NULL DEFAULT 'viewer' | CHECK in (`client_admin`,`approver`,`viewer`) |
| status | text NOT NULL DEFAULT 'invited' | CHECK in (`invited`,`active`,`disabled`,`revoked`) |
| invited_by | uuid NULL → auth.users(id) | the owner user |
| invited_at | timestamptz DEFAULT now() | |
| accepted_at | timestamptz NULL | |
| last_access_at | timestamptz NULL | touched on portal bootstrap |
| created_at / updated_at | timestamptz DEFAULT now() | `updated_at` via trigger |

Constraints: `UNIQUE(client_id, email)` (one membership per email per client); partial `UNIQUE(client_id, auth_user_id) WHERE auth_user_id IS NOT NULL`. Indexes on `(auth_user_id)`, `(business_id)`, `(client_id, status)`, `(email)`.
**One person → many clients is supported** (auth_user_id is not globally unique; unique only per client).

### 2.2 `client_invitations` (NEW)
Separate table for lifecycle + auditability. Stores **only a SHA-256 hash** of the invite token (never the token).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| membership_id | uuid NOT NULL → client_memberships(id) ON DELETE CASCADE | |
| business_id | uuid NOT NULL → businesses(id) ON DELETE CASCADE | scoping |
| client_id | uuid NOT NULL → clients(id) ON DELETE CASCADE | scoping |
| email | citext NOT NULL | |
| token_hash | text NOT NULL | sha256(token); raw token only in the emailed link |
| status | text NOT NULL DEFAULT 'pending' | CHECK in (`pending`,`accepted`,`cancelled`,`expired`) |
| expires_at | timestamptz NOT NULL | e.g. now()+7d |
| created_at | timestamptz DEFAULT now() | |
| accepted_at | timestamptz NULL | |
| resent_count | int NOT NULL DEFAULT 0 | |
Index: `UNIQUE(token_hash)`, `(membership_id)`, `(business_id, client_id)`, `(email)`.

### 2.3 `business_entitlements` (NEW)
Canonical entitlement abstraction (billing-independent; does not modify subscriptions).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| business_id | uuid NOT NULL → businesses(id) ON DELETE CASCADE | |
| capability | text NOT NULL | e.g. `production_suite` |
| active | boolean NOT NULL DEFAULT false | **default deny** |
| source | text NOT NULL DEFAULT 'manual' | `manual`/`plan`/`grant` (provenance; billing untouched) |
| expires_at | timestamptz NULL | NULL = no expiry |
| created_at / updated_at | timestamptz | |
Constraint: `UNIQUE(business_id, capability)`.

### 2.4 `client_access_audit` (NEW)
Minimal scoped trail. `id, business_id, client_id, actor_type(owner|client|system), actor_user_id, action, target_type, target_id, metadata jsonb, created_at`. **Never** stores passwords/tokens/reset-links/signed image URLs. `action` is a controlled string (see §7).

## 3. Authorization contracts (the boundary)

### 3.1 Canonical resolvers (server + SQL)
- SQL `public.has_business_entitlement(p_business_id uuid, p_capability text) → boolean` — SECURITY DEFINER, `search_path=public`, default **false**; true only if a matching `business_entitlements` row is `active` and (`expires_at IS NULL OR expires_at > now()`). (Plan-derived sourcing may be added later without changing the signature.)
- SQL `public.client_portal_bootstrap() → jsonb` — SECURITY DEFINER; resolves `auth.uid()` → **active** memberships → clients → **published** galleries; touches `last_access_at`; returns only authorized data. This is the ONLY portal data entry point that the browser calls; it never accepts a client_id/business_id argument.
- TS `server/entitlements.ts`:
  - `requireBusinessEntitlement(req, supabase, businessId, capability)` → reuses `requireAuthedUser`, verifies owner, then `has_business_entitlement`. Fail → `403 entitlement_required`.
  - `resolveEntitlementsForBusiness(supabase, businessId)` for owner UI rendering.
- TS `server/membership.ts`:
  - `requireActiveMembership(req, supabase, clientId)` → valid JWT + an **active** `client_memberships` row for `(auth.uid(), clientId)`; returns `{userId, membershipId, businessId, role}`. Fail closed → `401/403`.
  - `requireOwnerOfClient` = existing `ownerAuth.requireBusinessOwnerOfClient` (reused).

### 3.2 Rule table
| Actor | May | Enforced by |
|---|---|---|
| Owner (businesses.user_id=auth.uid()) | CRUD own clients, memberships, invitations; assign only own galleries | RLS owner policies (SELECT) + SECURITY DEFINER RPCs (mutations, internal ownership check) + `ownerAuth` in APIs |
| Client member (active) | read own memberships; read assigned **published** galleries via bootstrap only | RLS member SELECT (own rows) + `client_portal_bootstrap` |
| Disabled/revoked member | nothing | status checked in bootstrap + membership resolver (not just row existence) |
| Anonymous | only existing public-gallery behavior | no new anon policies added |
| Production modules | only if `has_business_entitlement(biz,'production_suite')` | entitlement gate in API + route + query; default deny |

## 4. Gallery assignment contract
- Assign/unassign/reassign only via SECURITY DEFINER RPC (or `ownerAuth`-gated API) that verifies the gallery AND target client both belong to the caller's business. Cross-business assignment → error.
- Assignment sets `galleries.client_id`; unassign sets it NULL. No gallery/image duplication. No change to gallery status, publishing, passwords, storage, or URLs.
- Portal shows `client_id = <mine> AND status = 'live'` only. Draft galleries never surface in V1.
- Reassign requires explicit confirmation (UI) and is audited.

## 5. Auth model
- Supabase Auth (email+password). Owner never sees/sets client passwords.
- Invite: owner API → creates membership (`invited`) + invitation (hashed token) → (LOCAL: no real email; return the accept link/token for fixtures). Accept: client sets password via Supabase, invitation validated by token hash + expiry + email match → membership `active`, `auth_user_id` bound.
- Reset: Supabase recovery flow (no custom tokens stored).
- Disable/revoke: flips membership status → immediate loss of access (bootstrap re-checks every call; no reliance on session liveness). Disabling one membership never bans the auth user globally (they may belong to other clients).
- Rate-limit invite/resend/reset (reuse `client_code_attempts`-style ledger or a small per-action limiter).

## 6. Legacy PIN transition
- Keep 057 PIN path working. **Patch fail-open:** server-side, a client with no `access_code_hash` AND no non-empty `clientCode` must **deny**, not render open. Empty `clientCode` never bypasses.
- New clients default to authenticated membership (no PIN).
- Owner UI shows a "Legacy Access" badge and an "Upgrade to account" action (invite a member).
- Do not delete PIN code until V2 fully tested. Document retirement path.

## 7. Audit actions (controlled vocabulary)
`client_created, invitation_sent, invitation_resent, invitation_accepted, invitation_cancelled, membership_disabled, membership_reactivated, membership_revoked, gallery_assigned, gallery_unassigned, gallery_reassigned, portal_access, password_reset_requested, production_access_denied`.

## 8. Migration plan (files, NOT applied)
| file | contents |
|---|---|
| `088_client_memberships.sql` (+rollback) | `client_memberships` + `client_invitations` tables, constraints, indexes, `updated_at` trigger, RLS (owner SELECT, member SELECT own) |
| `089_business_entitlements.sql` (+rollback) | `business_entitlements` table + RLS + `has_business_entitlement()` |
| `090_client_access_audit.sql` (+rollback) | `client_access_audit` table + RLS + `append_client_audit()` (definer, service-role) |
| `091_client_portal_rpcs.sql` (+rollback) | `client_portal_bootstrap()`, membership lifecycle RPCs (invite/accept/disable/reactivate/revoke/assign/unassign), all definer + least-privilege grants |

All: `BEGIN/COMMIT`, `IF NOT EXISTS`, `SET search_path`, `REVOKE ... FROM PUBLIC,anon,authenticated` then explicit `GRANT`, verification-query comments.

## 9. Frontend contract
- Owner: enable disabled "לקוחות" nav **on this branch only**; new `ClientsManager` (list/create/detail/assign/members/preview) inside existing Dashboard shell + primitives.
- Client: adapt `ClientDashboard` to call `client_portal_bootstrap` after Supabase login; drop route-trust/PIN-only reads for new clients; legacy PIN path stays for un-upgraded clients (fail-closed).
- Production modules (FeedStudio, SocialManager, Creative Engine, Tender, Stories, Portfolio, Calendar) rendered only when `production_suite` resolves true AND re-checked server-side. localStorage-only modules stay hidden unless migrated in an isolated subtask.

## 10. Test contract
- Unit (tsx + mock supabase, fail-closed proofs): entitlement resolver, membership resolver, legacy-PIN fail-closed, invitation hash/expiry.
- Adversarial (see program Test Matrix): cross-client, cross-business, disabled/revoked reuse, anon API, non-entitled Production route/API, id tampering, empty clientCode bypass, expired/hijacked invite.
- Regression: existing photographer login/dashboard/gallery create/upload/publish/public view/password gate/face/download/zip/favorites/tokens/admin/OG/desktop publish/live URLs.

## 11. Out of scope (hard)
Instagram publishing (does not exist — not pretended). Brand Kit redesign. Checkout/billing/subscription records. Broad refactors. Router rewrite. Any prod write/apply/deploy/push.
