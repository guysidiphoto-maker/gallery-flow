# Self-Serve Signup Readiness Audit — Pixflow

Auditor role: Auth/Signup Engineer (READ-ONLY, audit only)
Date: 2026-06-29
Prod project: vlyiqfawkrjvqcmkpfvs · Staging: bkccdomovxtuqdxrahnc · https://pixflow-ai.com
prod-touched = no (SELECT-only; no writes, no DDL, no auth user changes)

---

## Executive summary & verdict

**Verdict: Open self-serve signup CANNOT launch safely as-is. Two P0 gaps must be closed first.**

The good news (verified):
- **Tenant isolation is solid.** Every owner-scoped table (`businesses`, `galleries`,
  `images`, `clients`, `business_tokens`) is RLS-scoped by `user_id = auth.uid()` or
  `business_id = current_business_id()`. A brand-new user sees **0** other tenants' rows
  and **cannot** update/delete cross-tenant. `businesses.user_id` is UNIQUE → one
  workspace per user (no multi-business spam from one login).
- **Photo uploads ARE hard-capped** by a token economy. New business gets a 100-token
  signup grant (DB trigger `businesses_grant_signup_tokens` → `_grant_signup_tokens`,
  verified live). `record_image_upload()` atomically consumes 1 token/photo and raises
  `insufficient_tokens` at 0. So a free attacker can upload at most **100 photos** total
  before they must pay — this is a real, working guardrail.
- Onboarding auto-provisions correctly: first dashboard load runs `initBusiness()` which
  creates the `businesses` row (→ trigger grants 100 tokens), then the user can
  immediately create galleries and upload. No missing-row dead-end.

The blockers:
- **P0-1 — Signup gate state is unknown and likely OPEN with no email confirmation.**
  Sign-in is Google-OAuth-only (`signInWithOAuth({provider:'google'})`). Any Google
  account can click "התחברות עם Google" and instantly become a full tenant. Whether
  GoTrue `enable_signup` is on, and whether Google is the *only* provider, is **not
  readable via SQL** and MUST be confirmed in the dashboard (see manual checks). With
  Google-only OAuth, emails are auto-verified by Google — acceptable — **but** if the
  Email provider is also enabled with autoconfirm, that opens password signup with
  unverified emails. Must verify.
- **P0-2 — The only enforced limit is 100 tokens. Storage, gallery count, AI/render,
  and export are effectively UNLIMITED for a free account.** `plans.storage_limit_bytes`,
  `plans.max_galleries`, `plans.max_photos_per_month` exist but are **display-only**
  (read by `get_my_usage()` for the quota widget) and **never enforced on insert**.
  Worse: new users get **no `subscriptions` row at all**, so even the display plan does
  not apply to them — they are an unplanned account whose sole boundary is the token
  balance. 100 photos at full original resolution can still be tens of GB of storage and
  egress cost, and nothing stops a free user from creating hundreds of (empty or
  near-empty) galleries.

**Minimum gates to launch open signup safely:** (1) confirm/lock the GoTrue signup config
(P0-1), and (2) add hard server-side caps for the free tier — at minimum max galleries and
a storage ceiling — or accept the 100-token cap as the *whole* free allowance and disable
the unused plan tiers' implied generosity (P0-2). Details below.

---

## 1. Actual auth flow (code map)

| Item | Finding | File |
|---|---|---|
| Sign-in methods | **Google OAuth only.** `signInWithOAuth({provider:'google', redirectTo: origin+'/dashboard'})` | `gallery-web/src/lib/auth.ts:5` |
| email/password | **None.** No `signInWithPassword` anywhere in `src/`. | grep: 0 hits |
| magic link / OTP | **None.** No `signInWithOtp`. | grep: 0 hits |
| Signup UI / "register" page | **No dedicated signup page/button.** Signup is implicit in OAuth — the same "התחברות עם Google" button both signs in and creates the account. Sign-in buttons at `Dashboard.tsx:2086`, `StudioSettings.tsx:281`, `LandingPageHe.tsx:116`. | — |
| Reachable today? | **Yes.** Any Google user reaching the dashboard login screen can self-provision. Self-serve is *already* effectively on at the app layer; only the GoTrue `enable_signup` flag could be blocking it server-side (unverified). | `Dashboard.tsx:2085-2103` |
| Session handling | `useAuth()` hook via `getSession()` + `onAuthStateChange`. Standard. | `auth.ts:18` |

Note: photographer auth is Google-OAuth; **client gallery access is a separate
password/session system** (`ClientPage.tsx`, migrations 057/061) — out of scope here.

## 2. New-user onboarding (first sign-in)

1. User completes Google OAuth → lands on `/dashboard`.
2. `Dashboard.initBusiness()` (`Dashboard.tsx:581-610`) looks up `businesses` by
   `user_id`; if none, **auto-inserts** one with a generated slug
   (`<name>-<base36 timestamp>`), `user_id = user.id`.
3. The INSERT fires DB trigger `businesses_grant_signup_tokens` →
   `_grant_signup_tokens()` (migration `043_token_economy.sql:66-90`, **verified live in
   prod**), inserting `business_tokens(balance=100)` + a `signup_grant` ledger row.
4. User can immediately create galleries (`gallery_bootstrap` RPC) and upload up to 100
   photos. No missing client/business row blocks them.

Free allowance: **100 photos (tokens)**. No free `subscriptions` row is created, so the
"Starter" plan's 500 photos/mo, 3 galleries, 2 GB are NOT applied — token grant is the
real number. This mismatch (plans table says one thing, token grant another) should be
reconciled before marketing a "free tier".

## 3. First dashboard state / empty-state UX

- Login screen is clean (Pixflow wordmark, "כניסה לחשבון", single Google button) —
  `Dashboard.tsx:2059-2105`.
- After sign-in a new user has 0 galleries. (Did not find a dedicated guided
  empty-state/onboarding wizard component in `src/` beyond the gallery list + create
  flow.) **P3:** verify the empty galleries list shows a clear "create your first gallery"
  CTA and surfaces the 100-token balance so the user understands their free allowance.
  This is UX polish, not a launch blocker.

## 4. Tenant isolation for a new user (from live `pg_policies`)

Verified READ of `pg_policies` (prod):
- `businesses`: SELECT/INSERT/UPDATE all `WITH CHECK/USING (user_id = auth.uid())`. No
  DELETE policy. ✅
- `galleries`, `clients`: `ALL` scoped `business_id = current_business_id()`. ✅
- `images`: `ALL` scoped via `EXISTS(gallery owned by current_business_id())`. ✅
- `business_tokens`: SELECT only, scoped to owner. No client-writable path (consumption
  is via `SECURITY DEFINER` RPCs). ✅

Conclusion: **a new user sees 0 other businesses/clients/galleries/images and cannot
mutate cross-tenant.** Isolation is correct. `current_business_id()` returns the single
row for `auth.uid()`; a user with no business row simply matches nothing (0 rows), not
everything.

**Watch item (P2):** two `anon`-role INSERT policies exist —
`galleries_demo_insert` and `images_demo_insert` — allowing UNAUTHENTICATED inserts of
demo galleries/images gated only by `demo_expires_at > now()`. Currently 0 demo galleries
in prod. This is an open-signup-independent anon write surface; coordinate with the
security audit. Not a signup blocker but should be rate-limited / Turnstile-gated.

## 5. Abuse surface of OPEN signup (free account)

| Resource | Capped? | Where |
|---|---|---|
| Photos uploaded | **Yes — 100 total** (token grant). Hard, atomic, race-safe. | `record_image_upload`, `043` |
| Storage bytes | **No enforcement.** `storage_limit_bytes` is display-only. 100 originals can be tens of GB + egress. | `get_my_usage` only |
| Galleries count | **No enforcement.** `max_galleries` display-only; no free `subscriptions` row anyway. Unlimited galleries. | `gallery_bootstrap` (no count check) |
| AI / story renders | Owned by another engineer — **flagging:** open signup multiplies whoever-can-call-AI by the number of free accounts. Confirm AI endpoints check token balance / their own quota, not just `authenticated`. | out of scope, flagged |
| Exports / ZIP download | Client-side ZIP (`galleryExport.ts`); no per-account cap found. Low risk (their own ≤100 images). | — |
| Multiple businesses per user | **No** — `businesses_user_id_idx` UNIQUE. ✅ | DB |
| New accounts per person | Limited only by # of Google accounts. No email-domain / velocity control. | GoTrue (manual) |

Net: the **token cap is the one real guardrail**; storage and gallery-count are wide open.

## 6. Recommended MINIMUM safe guardrails

| Guardrail | Exists? | Recommendation |
|---|---|---|
| Email confirmed before access | Implicit via Google OAuth (Google-verified). | OK **if** Google is the only provider. Confirm Email provider is OFF or autoconfirm OFF. |
| Free max photos | ✅ 100 tokens, enforced | Keep. Decide if 100 is the intended free number (vs plans' 500). |
| Free max galleries | ❌ | Add a hard cap (e.g. 3, matching Starter) enforced in `gallery_bootstrap` / a gallery-insert trigger. |
| Free storage ceiling | ❌ | Add server-side check in `record_image_upload` summing original sizes vs a free cap (e.g. 2 GB). |
| Free max AI calls/day | ❓ (other engineer) | Confirm AI endpoints are token- or quota-gated, not just `authenticated`. |
| "Limit reached" UX | ❌ for storage/galleries; token path raises `insufficient_tokens` | Add clear limit-reached states for galleries/storage, plus upgrade CTA. |
| Anon demo-insert rate limit | ❌ | Turnstile / rate-limit the `*_demo_insert` anon policies. |
| Signup velocity / abuse | ❌ | Optional: GoTrue rate limits + monitoring; not a hard blocker. |

---

## Issue register

### P0-1 — GoTrue signup config unverified / possibly open with unverified email
- Route/file: GoTrue (Supabase Auth) config; app entry `gallery-web/src/lib/auth.ts:5`.
- Impact: If `enable_signup=true` AND the Email provider is enabled with autoconfirm,
  anonymous password signups with unverified emails could create full tenants. If only
  Google OAuth is enabled, emails are Google-verified and this risk is contained.
- Fix: In dashboard, confirm provider set = Google only (or email confirmation required);
  set `enable_signup` to the intended value for open self-serve; ensure autoconfirm OFF
  for any email provider.
- Can do now: No (dashboard-only, owner action). prod-touched=no.
- Rollback: revert provider/flag toggles in dashboard.

### P0-2 — No enforced free-tier limits except token balance (storage & galleries unlimited)
- Route/file: `supabase/migrations/043_token_economy.sql` (`record_image_upload` — no
  storage check), `gallery_bootstrap` (migration 073 — no gallery-count check),
  `get_my_usage` (040 — limits are display-only); new users get no `subscriptions` row
  (`Dashboard.tsx:581` inserts only `businesses`).
- Impact: A free account can create unlimited galleries and accumulate unbounded storage
  /egress (up to 100 full-res originals + repeated gallery creation), amplified by open
  signup.
- Fix: Enforce free-tier caps server-side: (a) gallery-count cap in `gallery_bootstrap`
  or an insert trigger; (b) storage ceiling check inside `record_image_upload`; OR
  formally treat the 100-token grant as the entire free allowance and reconcile the
  plans table so nothing implies 500/3/2GB. Assign a free `subscriptions` row on
  business creation if plan-based enforcement is chosen.
- Can do now: No (requires DDL/migration — out of read-only scope). prod-touched=no.
- Rollback: migrations are additive; drop the new trigger/check to revert.

### P1 — Plan-limit vs token-grant mismatch confuses "free tier" definition
- File: `plans` rows (Starter=500 photos/3 galleries/2GB) vs `_grant_signup_tokens` (100).
- Impact: Marketing/UX and enforcement disagree; users may expect 500 photos but hit 100.
- Fix: Pick one source of truth; align plans.starter token_count/grant.
- Can do now: No (data/DDL). prod-touched=no. Rollback: revert the UPDATE.

### P2 — Anonymous demo-insert policies are an unauthenticated write surface
- File: policies `galleries_demo_insert`, `images_demo_insert` (anon role).
- Impact: Anyone (no signup needed) can insert demo galleries/images while
  `demo_expires_at>now()`; no rate limit found. Storage/abuse vector independent of signup.
- Fix: Gate behind Turnstile + server rate limit, or restrict. Coordinate w/ security audit.
- Can do now: No. prod-touched=no. Rollback: re-add/adjust policy.

### P3 — First-run empty-state UX may not guide new users
- File: `gallery-web/src/pages/Dashboard.tsx` (galleries list empty state).
- Impact: New user may not know next step or their 100-token allowance.
- Fix: Add empty-state CTA + visible token balance / free-limit messaging.
- Can do now: Yes (frontend), but not in this audit's scope. prod-touched=no.

---

## Manual Supabase dashboard checks REQUIRED (not readable via SQL)

Authentication → Providers / Settings:
1. **`enable_signup`** — is self-serve signup ON? (intended ON per owner, confirm.)
2. **Enabled providers** — is it **Google ONLY**? Is the **Email** provider enabled? If
   Email is on:
3. **"Confirm email" / autoconfirm** — is email confirmation REQUIRED (autoconfirm OFF)?
   If autoconfirm is ON with email signup, unverified accounts can be created → close it.
4. **Allowed email domains / restrictions** — any allow/deny list? (none expected.)
5. **Redirect URLs allow-list** — `https://pixflow-ai.com/dashboard` (+ origins) present;
   no overly-broad wildcard.
6. **Auth rate limits** (signup/OTP/email) — set to sane values to blunt mass-signup abuse.
7. **Google OAuth client** — confirm correct client ID/secret, no test creds in prod.
8. Confirm there is no SMTP/email provider misconfig that would silently auto-confirm.

(GoTrue `enable_signup`, provider list, and autoconfirm are NOT in any SQL-readable table;
they live in the Auth service config and must be eyeballed in the dashboard.)
