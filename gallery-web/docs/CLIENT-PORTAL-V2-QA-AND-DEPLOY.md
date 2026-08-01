# Client Portal V2 — QA Checklist, Migrations & Deployment

Branch: `feat/client-portal-v2` (local only, nothing pushed/deployed/applied).

## A. Migrations — apply order (to a TEST project first, never prod without approval)

Apply in numeric order; each has a paired `_rollback.sql` (reverse order to roll back).

| # | file | adds |
|---|---|---|
| 088 | `088_client_memberships.sql` | `client_memberships`, `client_invitations`, RLS (owner/member SELECT), `cpv2_set_updated_at` trigger fn |
| 089 | `089_business_entitlements.sql` | `business_entitlements`, `has_business_entitlement()`, `my_business_entitlements()` |
| 090 | `090_client_access_audit.sql` | `client_access_audit`, `append_client_audit()` |
| 091 | `091_client_portal_rpcs.sql` | `client_portal_bootstrap()`, `cpv2_assign_gallery/unassign_gallery/set_membership_status/accept_invitation` |
| 092 | `092_client_admin_read_rpcs.sql` | `cpv2_owner_clients_overview/assignable_galleries/client_detail` |
| 093 | `093_cpv2_auth_helpers.sql` | `cpv2_auth_user_id_by_email()` (service_role) |
| 094 | `094_bootstrap_entitlements.sql` | `client_portal_bootstrap()` REPLACE with `production_suite` flag |

All are additive, idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`), and touch NO existing table columns or policies. `082` is unrelated to this program and remains unapplied.

Rollback: run `094_..._rollback` → `088_..._rollback` in DESCENDING order.

## B. Environment variables (already used by the repo; none new required for core flow)
- `SUPABASE_URL` / `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only — already present for existing endpoints).
- Optional later: SMTP config in Supabase Auth for real invitation/reset emails (this program sends NONE; links are returned to the owner to deliver).
- No new secret is required to run the portal locally.

## C. Granting the Production Suite entitlement (test)
Default is DENY. To enable Production modules for a test business (service_role / SQL editor):
```sql
INSERT INTO public.business_entitlements (business_id, capability, active, source)
VALUES ('<business-uuid>', 'production_suite', true, 'manual')
ON CONFLICT (business_id, capability) DO UPDATE SET active = true;
```

## D. Automated tests (offline, run now — all green)
```
cd gallery-web
npx tsx tests/cpv2-entitlements.test.ts   # 13
npx tsx tests/cpv2-membership.test.ts     #  9
npx tsx tests/cpv2-clientadmin.test.ts    # 18
npx tsx tests/cpv2-adversarial.test.ts    #  5
npx tsc --noEmit -p .                     # 0 errors
npm run build                             # green
```
Regression (existing, still green): `blocker2-ownerAuth` (13), `cover-image` (16), `dedupe-upload` (9), `upload-count` (15).

## E. Manual QA + adversarial matrix (run AFTER migrations applied to a test project)

Set up: Business A (photographer plan), Business B (photographer plan), Business C (grant `production_suite`). Clients A1, A2, B1, C1. Use two browsers/incognito.

### Happy path (Definition of Done 1-14)
1. As A owner: /dashboard → "לקוחות" → create client A1 → "Create + send invitation" → copy the returned invite link.
2. Open invite link (incognito) → shows "invited to A1" → set password (≥8) → auto sign-in → lands on A1 portal.
3. A owner: assign a LIVE gallery to A1 → it appears in A1 portal on refresh.
4. A owner: unassign it → gone from A1 portal immediately.
5. A owner: disable A1 member → member's next request/refresh loses access (bootstrap returns empty).
6. A owner: reactivate → access returns. Revoke → access gone.
7. A1 member: open a gallery, download → works under existing gallery permissions. Logout → session cleared.

### Adversarial (must all FAIL closed)
| # | attempt | expected |
|---|---|---|
| 1 | A1 opens A2's dashboard URL | no data (no active membership) → legacy/lock, never A2 data |
| 2 | A1 opens Business B client URL | no data |
| 3 | A owner assigns a Business B gallery (tamper galleryId) | RPC `gallery_not_in_business` error |
| 4 | Disabled member reuses an old tab/session | bootstrap empty → access lost |
| 5 | Revoked member opens a direct gallery link from portal | gallery viewer follows its own rules; portal shows nothing |
| 6 | Anonymous calls `/api/client-portal` bootstrap / `client_portal_bootstrap` as anon | 401 / permission denied |
| 7 | Non-Production business opens a Production tab directly | tab hidden; forced selection → "module not available" |
| 8 | Non-Production business calls `/api/generate-feed` directly (valid owner JWT) | 403 `entitlement_required` |
| 9 | Tamper `client_id`/`business_id`/`galleryId` in any owner API body | server resolves business from `auth.uid()`, ignores body → 403/404 |
| 10 | Empty legacy `clientCode` client opens dashboard | fail-closed "access restricted" (not open) |
| 11 | Reuse an expired/cancelled invite | `invitation_invalid` |
| 12 | Accept invite with a DIFFERENT email than invited | `invitation_invalid` |
| 13 | Spam invite/resend/reset > limit within window | 429 `rate_limited` |
| 14 | Clear browser storage, re-login on another computer | same cloud data (bootstrap re-resolves) |

### Browser QA
- Desktop + mobile (≤390px): ClientsManager, invite-accept, login, portal — RTL correct, no overflow, keyboard/Enter/Esc work, loading/empty/error states render.

## F. Regression checklist (must remain working — verify on the test env)
photographer login · dashboard · gallery create/upload/publish · public gallery load · password-protected gallery · face recognition · single + ZIP download · favorites · token balance · admin server authz · OG/gallery metadata · desktop publish flow · existing live gallery URLs. (No code path for these was modified except append-event-posts verify_code fail-closed and the four Production AI endpoints' entitlement gate.)

## G. Recommended deployment sequence (when approved — NOT done here)
1. Apply migrations 088→094 to **staging**; run §E on staging.
2. Grant `production_suite` to the businesses that should have it (staging).
3. Deploy the branch to a **Vercel preview**; re-run §E + §F against the preview.
4. Only then: apply 088→094 to prod, grant entitlements, promote the build.
5. Legacy PIN retirement is a LATER, separate step (see architecture doc §6) once all active clients are upgraded to accounts.

## H. GO / NO-GO
**Conditional GO for a Preview deployment**, gated on: (1) applying 088→094 to a non-prod project and passing §E/§F there, (2) confirming `SUPABASE_SERVICE_ROLE_KEY` present in the preview env. No prod change is part of this program.
