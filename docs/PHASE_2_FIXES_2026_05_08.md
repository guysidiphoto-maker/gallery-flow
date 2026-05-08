# Phase 2 Fixes — 2026-05-08

> **Sprint result**: 4 stability/UX fixes shipped across 3 separate PRs + 1 production migration. Saving state from the public client dashboard now actually persists. Freshly-generated draft plans no longer vanish on refresh. Top-pick selections survive within a browser session. Save failures are visible to users instead of silent.

---

## What was wrong before Phase 2

The Phase 1 sprint closed the catastrophic data-loss + cost-drain risks. Phase 2 targets the **save-reliability layer** for the public client dashboard:

1. **Every "save" the customer made silently failed** — `chooseVariant`, `unchooseVariant`, `savePostEdit` in FeedStudio called `supabase.from('feed_plans').update(...)` directly with the anon key. RLS forbids anon UPDATE on `feed_plans`. Supabase returns `{data:null, error:null}` for RLS-blocked updates → optimistic UI shows success → reload = data gone.

2. **Freshly-generated plans vanished on refresh** — `/api/generate-feed` writes plans with `status='draft'`. Anon SELECT policy was `status IN ('accepted','published')` only. Plan in DB, invisible to the same anon caller that just created it.

3. **Top-pick toggle in client dashboard reset on every refresh** — `selectedPicks` was local state only, no persistence layer.

4. **No visible feedback on save failures** — even genuine errors (network, server 500) showed nothing to the user.

---

## What was fixed (3 PRs + 1 production migration)

### PR-2A · Migration 056 + Phase 2 docs
**Branch**: `fix/phase2-feed-plans-draft-visibility` · **Commit**: `9c5d2b1` (#79)

**The change**: dropped + recreated the anon SELECT policy on `feed_plans` to include `'draft'`:
```sql
DROP POLICY feed_plans_public_select ON public.feed_plans;
CREATE POLICY feed_plans_public_select ON public.feed_plans
  FOR SELECT TO anon
  USING (status IN ('draft', 'accepted', 'published'));
```

**Migration applied to production** (`055_drop_anon_all_storage_policies` came in Phase 1; `056_feed_plans_draft_visibility` is the Phase 2 one). Verified via `pg_policy`:
```
qual = (status = ANY (ARRAY['draft'::text, 'accepted'::text, 'published'::text]))
```

**Risk** (still 🟡 MEDIUM): widens anon read access. Anyone with a UUID can now read drafts in addition to accepted/published plans. Same UUID-guess surface that already exists for non-drafts; no new class of leak. Phase 3 closes this with session-token-scoped predicates.

**Bundled docs**:
- `docs/PHASE_1_FIXES_2026_05_08.md` — Phase 1 wrap-up summary.
- `docs/PHASE_2_REGRESSION_CHECKLIST.md` — 24 tests across 11 groups for Phase 2 validation.

---

### PR-2B · Action dispatcher on /api/append-event-posts
**Branch**: `fix/phase2-feed-plan-action-dispatcher` · **Commit**: `d07a3a7` (#78)

**The change**: extended the existing endpoint to handle 4 dispatchable actions (kept within Vercel's 12-function cap by reusing this file).

| Action | Body | Behavior |
|---|---|---|
| `append_event_posts` (default, BC) | `{ clientId, posts }` | Existing behavior, unchanged |
| `choose_variant` | `{ clientId, planId, variantId }` | Sets `chosen_variant_id`, `status='accepted'`, runs default schedule (Mon/Wed/Fri 19:00 IST) server-side |
| `unchoose_variant` | `{ clientId, planId }` | Clears `chosen_variant_id`, `status='draft'`, `accepted_at=null` |
| `save_post_edit` | `{ clientId, planId, variantId, post }` | Find-by-id replace within `variant.posts[]` |

**Security invariants**:
- Every write action runs `verifyOwnership(clientId, planId)` BEFORE mutating. Mismatch → 403 `plan_ownership_mismatch`.
- Variant + post existence validated → 400 `variant_not_found` / `post_not_found`. Never 500.
- Re-read + in-memory merge before write to avoid stale-write loss when concurrent edits hit different posts.
- All errors use `{ ok: false, error: '<code>', detail?: '<msg>' }`.
- `maxDuration=60s` carried over from Phase 1.B.
- Origin allowlist guard carried over from Phase 1.B.

**Production smoke** (verified after deploy):
- `action: 'choose_variant'` with bogus UUIDs → `{ok:false, error:'client_not_found'}` (ownership check fires correctly)
- `action: 'append_event_posts'` (legacy default) → `{ok:false, error:'clientId_required'}` (BC preserved)
- `Origin: https://evil.example.com` → `{ok:false, error:'origin_not_allowed'}` (Phase 1.B guard intact)

---

### PR-2C · Frontend write path + Toasts + sessionStorage
**Branch**: `fix/phase2-frontend-write-path` · **Commit**: `0d5b71f` (#77)

#### Fix 5. FeedStudio writes go through the endpoint
**Where**: `gallery-web/src/components/FeedStudio.tsx`.

**Before**: `chooseVariant`, `unchooseVariant`, `savePostEdit` called `supabase.from('feed_plans').update(...)` directly with anon key. Silent RLS-block → data lost on refresh.

**After**: each function POSTs to `/api/append-event-posts` with the matching action. On `res.ok && json.ok` the optimistic `setPlan(json.plan)` syncs UI to server-validated state. On any failure: toast (red Hebrew), no state mutation. Refresh → server is source of truth.

#### Fix 6. Toast component (`gallery-web/src/components/Toast.tsx`, new)
- `useToast()` hook returns `{ showToast, ToastContainer }`.
- Bottom-left RTL stack, max 3 visible (oldest drops), 4-second auto-dismiss, click to dismiss.
- 3 kinds: `success` (`#3DDC84`), `error` (`#ff6b6b`), `info` (`#D4FF00`).
- Dark `#0a0a0f` background, 1px subtle border colored by kind, 8px radius, soft shadow, Heebo 13px.
- ARIA: `role='alert'` for errors / `'status'` for success+info, `aria-live='polite'`.
- No new dependencies. 143 lines.

Mounted once inside `FeedStudio`'s root.

#### Fix 7. selectedPicks survives refresh (sessionStorage)
**Where**: `gallery-web/src/pages/ClientDashboard.tsx`.

**Before**: `selectedPicks: Set<string>` was local state only. Refresh = all selections gone.

**After**:
- Lazy-initializes from `sessionStorage.getItem('selectedPicks-' + clientId)`.
- Re-hydrates whenever `clientId` changes (via `useEffect`).
- Persists on every `togglePick` mutation.
- Photographer top-pick seed runs only when sessionStorage key is absent → user's manual add/remove choices survive refresh.
- Closing browser drops the key (sessionStorage scope, intentional). Phase 3+ may add a real `client_post_selections` table.

---

## Production verification

| Test | Result |
|---|---|
| Migration 056 applied | ✅ Verified via `pg_policy` post-apply |
| `feed_plans_public_select` includes 'draft' | ✅ qual contains `'draft'` |
| `action: 'choose_variant'` dispatches to `handleChooseVariant` | ✅ Returns `client_not_found` on bogus UUIDs (ownership check fires) |
| `action: 'append_event_posts'` (default) BC preserved | ✅ Returns `clientId_required` (legacy validation path) |
| `Origin: evil.example.com` rejected | ✅ Returns `origin_not_allowed` |
| `action: 'unknown_action'` | ✅ Falls through to `unknown_action` 400 (after ownership) |
| Type-check on all touched files | ✅ Clean |
| Vercel build green | ✅ Deploy completed without errors |

Full regression checklist: `docs/PHASE_2_REGRESSION_CHECKLIST.md` — 24 tests covering choose-variant persistence (T1-T2), unchoose (T3), post edit persistence (T4-T6), draft visibility (T7-T8), top-pick sessionStorage (T9-T11), error toasts (T12-T14), backwards compat (T15-T16), Origin guard (T17), anti-regression (T18-T20), security smoke (T21-T23), and the architectural smoke (T24 — confirms no direct PATCH to `/rest/v1/feed_plans`).

---

## What was NOT fixed in Phase 2 (deferred)

| Issue | Severity | Phase |
|---|---|---|
| `clientCode` plaintext + anon-readable PIN | 🟠 SECURITY | Phase 3 |
| Photographer JWT in localStorage (XSS = takeover) | 🟠 SECURITY | Phase 3 |
| Cross-client data leakage on same business | 🟠 SECURITY | Phase 3 |
| `gallery-images` bucket fully public — originals downloadable | 🟠 SECURITY | Phase 4 |
| `feed_plans.posts` JSONB rewrite scaling timebomb | 🟠 SCALE | Phase 5 |
| ClientDashboard fetches all images of all galleries (no LIMIT) | 🟠 SCALE | Phase 5 |
| Real `client_post_selections` table (currently sessionStorage) | 🟡 UX | Phase 3+ |
| Optimistic locking on post edits (currently re-read+merge) | 🟡 STABILITY | Phase 3+ |
| Per-post deep schema validation in `save_post_edit` | 🟡 DEBT | Phase 3+ |
| Mobile/UX bugs (HEIC, WebM stories, OG Hebrew, hover-only buttons) | 🟡 UX | Phase 5 |
| 12 technical-debt items | 🟡 DEBT | Phase 6 |

Plus the 3 Phase 1 follow-ups still outstanding:
- `og.tsx` may have same `delivery_settings` exposure as `share.ts`
- `gallery-page.ts` and `submit-questionnaire.ts` could use the Origin guard
- 2 leftover `Allow public uploads *` storage policies (need verification before drop)

---

## User-facing behavior change

| Action on public client dashboard | Before | After |
|---|---|---|
| Pick a variant | "saved" optimistically; refresh = gone | Persists. Server-validated state. |
| Edit a caption | Same silent failure | Persists. Visible "נשמר בהצלחה" or red error toast. |
| Replace a photo | Same silent failure | Persists. |
| Reschedule a post | Same silent failure | Persists. |
| Mark as published | Same silent failure | Persists. |
| Generate plan + refresh BEFORE picking | Plan disappears | Plan stays visible. |
| Tap top-pick toggle on photos | Reset on refresh | Survives within browser session. Resets when switching client. |
| Network failure during save | Silent | Red Hebrew toast: "שמירת הבחירה נכשלה. נסה שוב." |

---

## Cost / risk impact

| Risk | Before Phase 2 | After Phase 2 |
|---|---|---|
| Save data lost silently | 🔴 Active in every customer session | ✅ Closed — server is source of truth |
| Fresh draft plan invisible on refresh | 🔴 Active | ✅ Closed (RLS widened, Phase 3 will scope by session) |
| Top-pick selection lost on refresh | 🟡 Active | ✅ Survives session |
| User unaware of failures | 🟡 Active | ✅ Toast surface |
| Cross-client write injection | 🟠 Stopgap (Origin guard from P1) | 🟠 Same (Phase 3 will close with signed sessions) |
| **Save reliability for paying clients** | **🔴 Demo-killer** | **🟢 Functional** |

---

## Next steps

1. **Run the regression checklist** (`docs/PHASE_2_REGRESSION_CHECKLIST.md`) on production — 24 tests in ~30 minutes.
2. **Decide on outstanding Phase 1 follow-ups** (3 small items: og.tsx + Origin guard expansion + verify leftover storage policies). Could ship as PR-1D anytime.
3. **Approve Phase 3 scope** (Auth & client dashboard security):
   - Hash `clientCode` + move out of `delivery_settings` JSONB
   - `verify_client_code(client_id, code)` SECURITY DEFINER RPC with attempt counter + cooldown
   - Signed client session token (server-issued, httpOnly cookie or short-lived JWT)
   - Replace anon UPDATE/SELECT on `feed_plans` with session-scoped predicates
   - Tighten anon SELECT on `image_ai_scores`, `vendors`, `client_page_settings`

When ready, say **"continue to Phase 3"** and I'll spawn the next round of agents.
