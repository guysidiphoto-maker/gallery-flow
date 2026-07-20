# Admin dashboard — setup & security (feat/admin-user-management)

Owner-only `/admin` page to view registered users and manually grant credits
(קרדיטים) to friends / test accounts. Nothing here is applied to production or
deployed automatically — this doc is the manual go-live checklist.

## What it does
- Lists users: email, business name, business id, registration date, current
  plan, credit balance, subscription status, gallery count. Paginated + search.
- "הענקת קרדיטים" per user: positive integer only, optional internal reason,
  confirmation modal, **idempotent** (double-click / retry never grants twice).
- Audit section: recent grants with target business, amount, acting admin,
  reason, request id, timestamp.
- No deduction feature. No password/token/service-key/PII exposure.

## Security model (the frontend route is NOT the boundary)
1. **All privileged work runs in the `admin` Edge Function** (server-side). The
   `SUPABASE_SERVICE_ROLE_KEY` never reaches the browser.
2. Every request must carry a valid Supabase JWT → verified with
   `auth.getUser()`. No/invalid JWT → **401**.
3. The verified user id must be in the **`ADMIN_USER_IDS`** allowlist (a secret).
   Not listed → **403**. If the secret is empty, everyone is denied (fail-closed).
4. The three DB functions (`admin_grant_credits`, `admin_list_businesses`,
   `admin_recent_grants`) are `SECURITY DEFINER` and granted to **service_role
   only** — `anon`/`authenticated` cannot call them via PostgREST at all.
5. Idempotency is enforced by the database, not the app: a unique partial index
   on `token_ledger(ref_id) WHERE reason='admin_grant'`. A retry reuses the same
   `request_id` and simply returns the current balance.

## Go-live steps (do these manually — nothing auto-applies)

1. **Apply the migration** to the target project (staging first, then prod when
   you decide):
   `supabase/migrations/085_admin_credit_grants.sql`
   Rollback if needed: `085_admin_credit_grants_rollback.sql` (keeps existing
   ledger rows + balances — only drops the functions + index).

2. **Find your admin user UUID** (Supabase → Authentication → Users → your row →
   User UID). You can list several, comma-separated.

3. **Set the secrets** on the project (Edge Functions → Secrets, or CLI):
   - `ADMIN_USER_IDS` = `uuid1,uuid2` (your allowlist)
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already set for existing
     functions — reused, not new.

4. **Deploy the Edge Function** `admin` with **JWT verification ON** (extra
   gateway layer on top of the in-function check):
   `supabase functions deploy admin` (default `verify_jwt = true`).

5. **Frontend** deploys with the normal web build (Vercel auto-deploys `main`).
   The `/admin` route is already wired in `main.tsx`.

## Required secrets
| Name | New? | Purpose |
|------|------|---------|
| `ADMIN_USER_IDS` | **yes** | comma-separated Supabase user UUIDs allowed into /admin |
| `SUPABASE_URL` | no (reused) | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | no (reused) | server-only key; never sent to browser |

## Verification (already run on staging)
Validated on **pixflow-staging** inside a `BEGIN … ROLLBACK` (nothing persisted):
service_role-only access, grant credits, duplicate `request_id` is idempotent,
distinct id grants again, invalid amounts (0/negative/oversized/unknown business)
rejected, ledger sum == balance, list search+pagination, audit shows the grant.
Frontend `tsc --noEmit` and production `vite build` both pass.
