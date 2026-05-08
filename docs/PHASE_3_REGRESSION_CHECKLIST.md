# Phase 3 Regression Checklist

> Run after merging Phase 3 PRs (DB migration 057 + backend append-event-posts + frontend ClientDashboard + FeedStudio).
> Mark each test: ✅ pass / ❌ fail / ⚠️ blocked.
> Tests are ordered so each group can be run independently.

---

## Pre-flight

Before running any tests, confirm all three layers are live:

- [ ] Migration 057 applied: `SELECT 1 FROM client_session_tokens LIMIT 1;` returns a row (or zero rows, no error).
- [ ] `client_code_attempts` table exists: `SELECT 1 FROM client_code_attempts LIMIT 1;` returns no error.
- [ ] `clients` table has new columns: `SELECT access_code_hash, access_code_set_at FROM clients LIMIT 1;` returns without error.
- [ ] Frontend deployed: open ClientDashboard in browser, open DevTools > Sources, confirm `verify_code` string appears in the built JS bundle.
- [ ] Vercel build green: check Vercel dashboard or run `vercel ls` — latest deployment status = READY.
- [ ] Identify one **migrated** test client (has `access_code_hash` set) and one **legacy** test client (`access_code_hash IS NULL`).

---

## Tests

### Group A: PIN Entry — New Hashed Flow

**T1 — Correct PIN unlocks dashboard and issues token**

1. In Supabase SQL editor: `SELECT set_client_access_code('<client_id>', '1234');` — confirm returns OK.
2. Open `/<biz>/c/<slug>` for that client in an Incognito window.
3. Enter code `1234` in the PIN form and submit.
4. Expected: dashboard loads, no PIN prompt visible.
5. Open DevTools > Application > Session Storage. Confirm a key like `client-session-<client_id>` holds a non-empty token string.
6. In Supabase: `SELECT token, expires_at FROM client_session_tokens WHERE client_id = '<client_id>' ORDER BY created_at DESC LIMIT 1;` — confirm a row exists with `expires_at` in the future.

**T2 — Wrong PIN shows Hebrew error, logs attempt**

1. In the same Incognito window (or clear sessionStorage), enter code `0000` and submit.
2. Expected: red Hebrew error message appears (no English fallback). Dashboard does NOT load.
3. No token appears in sessionStorage.
4. In Supabase: `SELECT * FROM client_code_attempts WHERE client_id = '<client_id>' ORDER BY attempted_at DESC LIMIT 1;` — confirm a new row with the wrong attempt is logged.

**T3 — 5 wrong attempts trigger cooldown with minutes remaining**

1. Starting from zero attempts (clear `client_code_attempts` for the test client or use a fresh client): submit wrong code 5 times consecutively.
2. On the 5th or 6th attempt, expected: response is a cooldown message in Hebrew. The message must include the number of minutes remaining (e.g., "נסה שוב בעוד X דקות").
3. Confirm no token is issued in sessionStorage.

**T4 — Cooldown expires, correct PIN works again**

1. In Supabase, run: `DELETE FROM client_code_attempts WHERE client_id = '<client_id>';` to clear the rate-limit log.
2. Enter the correct code `1234` in the same window.
3. Expected: dashboard unlocks, token issued — same result as T1.

---

### Group B: Legacy Fallback (Un-migrated Clients)

**T5 — Un-migrated client unlocks via plain-text fallback**

1. Confirm test legacy client: `SELECT access_code_hash FROM clients WHERE id = '<legacy_id>';` — must return NULL.
2. Find that client's plain-text code: `SELECT delivery_settings->>'clientCode' FROM galleries WHERE client_id = '<legacy_id>' ORDER BY published_at DESC LIMIT 1;`
3. Open `/<biz>/c/<legacy_slug>` in Incognito, enter that plain-text code.
4. Expected: dashboard loads. No token appears in sessionStorage (fallback path does not issue a token).

**T6 — Wrong code on un-migrated client: error shown, no cooldown counter**

1. On the same legacy client page, enter a wrong code.
2. Expected: red Hebrew error appears, but NO cooldown/minutes-remaining message is shown (because `fallback_to_legacy: true` was returned by the API, skipping the rate-limit path).
3. Confirm `client_code_attempts` table has NO new row for this legacy client_id.

---

### Group C: Token Persistence

**T7 — Token survives page refresh**

1. After T1 (token in sessionStorage), press F5 or Cmd+R to reload the page.
2. Expected: dashboard loads immediately without showing the PIN entry screen.

**T8 — Expired token triggers re-prompt**

1. After T1, in Supabase run: `UPDATE client_session_tokens SET expires_at = now() - interval '1 hour' WHERE client_id = '<client_id>';`
2. Reload the page.
3. Expected: PIN entry screen re-appears. The expired token no longer grants access.

---

### Group D: Token Attached to Write Actions

**T9 — choose-variant sends X-Client-Session header (token present)**

1. Start from an authenticated session (T1 completed, token in sessionStorage).
2. Open DevTools > Network tab, filter by `append-event-posts`.
3. Click any choose-variant control in FeedStudio (e.g., pick a variant for a post).
4. In Network, inspect the request headers. Confirm `X-Client-Session: <token>` is present.
5. Expected: action succeeds (200 response).

**T10 — choose-variant succeeds without token (advisory mode), server warns**

1. Open DevTools > Application > Session Storage, delete the `client-session-<client_id>` key.
2. Trigger a choose-variant action (without reloading/re-authenticating).
3. Expected: action still succeeds (200). No `X-Client-Session` header in the request.
4. In Vercel Function logs (or local server logs), confirm a "no session token" warning appears for this request.

**T11 — Mandatory mode: choose-variant returns 401 without token (future flag)**

> This test applies only when `REQUIRE_CLIENT_SESSION_TOKEN=1` is set in the environment. Skip if the flag is not yet enabled.

1. Set env var `REQUIRE_CLIENT_SESSION_TOKEN=1` in Vercel (or local .env). Redeploy.
2. Clear sessionStorage token as in T10.
3. Trigger choose-variant.
4. Expected: server returns 401 with `{"error":"session_token_required"}`. Action does NOT complete.

---

### Group E: Cross-Client Token Rejection

**T12 — Token from clientA rejected for clientB writes (advisory mode)**

1. Authenticate as clientA. Copy the token value from sessionStorage.
2. Open clientB's dashboard URL. In DevTools console, manually set: `sessionStorage.setItem('client-session-<clientB_id>', '<clientA_token>')`.
3. Trigger a choose-variant action on clientB's FeedStudio.
4. Expected (advisory mode): action succeeds (200), but Vercel/server logs show `token_client_mismatch` warning.
5. When `REQUIRE_CLIENT_SESSION_TOKEN=1`: expected 403 response.

---

### Group F: clientCode Not Leaked in OG Output

**T13 — /api/share response contains no clientCode**

```bash
curl -s "https://<your-domain>/api/share?id=<gallery-id>" | grep -i clientCode
```

Expected: no output. The string `clientCode` must not appear anywhere in the HTML response.

**T14 — Legacy plain-text clientCode still readable via REST (note for Phase 4)**

```bash
curl -s "https://<supabase-url>/rest/v1/galleries?select=delivery_settings&id=eq.<gallery-id>" \
  -H "apikey: <anon-key>"
```

Expected: `delivery_settings.clientCode` is still returned for un-migrated clients. This is acceptable for now. Document this field for removal in Phase 4 cleanup.

---

### Group G: Anti-Regression

**T15 — Anon gallery viewer still loads**

1. Open any live gallery URL (App.tsx viewer, not the client dashboard).
2. Expected: gallery loads fully for an anonymous visitor. No authentication screen.

**T16 — Photographer dashboard still functional**

1. Log in as a photographer and navigate to `/dashboard`.
2. Upload a test image. Edit a gallery title. Confirm saves successfully.
3. Expected: all existing photographer workflows unaffected.

**T17 — Default append-event-posts action (plan event) still works without token**

1. Trigger the "Plan event" / default post-append flow that existed before Phase 3.
2. Expected: works in advisory mode (no token required). Server processes the request normally.

**T18 — Old sessionStorage auth flag still grants access**

1. In DevTools > Application > Session Storage, manually set the legacy flag: `sessionStorage.setItem('client-dash-<client_id>', 'true')`.
2. Navigate to that client's dashboard without entering a PIN.
3. Expected: dashboard loads (backward compatibility maintained for pre-Phase-3 sessions).

---

### Group H: Backend Smoke Tests (curl)

**T19 — verify_code returns token on correct code**

```bash
curl -s -X POST https://<domain>/api/append-event-posts \
  -H "Content-Type: application/json" \
  -d '{"action":"verify_code","clientId":"<client_id>","code":"1234"}' | jq .
```

Expected: `{"ok":true,"token":"<uuid>","expires_at":"<iso-timestamp>"}`.

**T20 — verify_code returns error on wrong code**

```bash
curl -s -X POST https://<domain>/api/append-event-posts \
  -H "Content-Type: application/json" \
  -d '{"action":"verify_code","clientId":"<client_id>","code":"0000"}' | jq .
```

Expected: `{"ok":false,"error":"invalid_code"}` with HTTP status 401.

**T21 — redeem_token returns client_id for valid token**

Use the token from T19:

```bash
curl -s -X POST https://<domain>/api/append-event-posts \
  -H "Content-Type: application/json" \
  -d '{"action":"redeem_token","token":"<token-from-T19>"}' | jq .
```

Expected: `{"ok":true,"client_id":"<client_id>"}`.

**T22 — redeem_token rejects garbage token**

```bash
curl -s -X POST https://<domain>/api/append-event-posts \
  -H "Content-Type: application/json" \
  -d '{"action":"redeem_token","token":"not-a-real-token"}' | jq .
```

Expected: `{"ok":false,"error":"invalid_token"}` with HTTP status 401.

---

### Group I: Database Invariants

**T23 — Expired tokens accumulate (no GC yet — flag for Phase 4)**

```sql
SELECT count(*) FROM client_session_tokens WHERE expires_at < now();
```

Expected: count may be non-zero (no cleanup job exists yet). Record the count and note for Phase 4: add a scheduled job to prune expired tokens.

**T24 — Backfill populated access_code_hash for migrated clients**

```sql
SELECT id, access_code_hash IS NOT NULL AS hash_set
FROM clients
WHERE id IN (
  SELECT DISTINCT client_id FROM galleries
  WHERE delivery_settings->>'clientCode' IS NOT NULL
);
```

Expected: `hash_set = true` for all clients whose galleries had a `clientCode` value at migration time. Any `false` rows indicate a backfill gap — investigate and re-run `set_client_access_code` manually for those clients.

---

## Sign-off

- [ ] All tests pass, or failures documented with ticket references
- [ ] T11 and E12 mandatory-mode tests deferred to Phase 4 env-flag cutover
- [ ] T14 and T23 noted as known Phase 4 cleanup items
- [ ] Approver: ___________________________
- [ ] Date: ___________________________
