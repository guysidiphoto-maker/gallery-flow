# Phase 2 Regression Checklist

> Run after merging Phase 2 PRs (DB migration 056 + backend append-event-posts.ts + frontend FeedStudio + ClientDashboard).
> Mark each test ✅ pass / ❌ fail / ⚠️ blocked.

---

## Pre-flight

- [ ] Migration 056 applied — confirm with:
  ```sql
  SELECT polname, qual FROM pg_policy WHERE polrelid = 'feed_plans'::regclass;
  ```
  Expected: `feed_plans_public_select` qual includes `'draft'`.
- [ ] Vercel build green (check Vercel dashboard — no red build).
- [ ] Latest `main` deployed (Vercel shows commit hash matching latest push).
- [ ] Have a test client URL ready (format: `/client/<clientId>`).
- [ ] Have DevTools open (Chrome F12) throughout.

---

## Tests

### Group A: Choose-variant persistence

**T1. Variant choice survives page refresh**
- Severity: regression | Phase 2 change: ClientDashboard sessionStorage
- Steps:
  1. Open client dashboard for a test client.
  2. Generate a feed plan (click "צור פיד" or equivalent). Wait for 3 variants to appear.
  3. Click "בחר" on variant #2.
  4. Confirm the UI collapses to show only variant #2 as chosen.
  5. Press F5 (hard refresh).
- Pass: Variant #2 remains chosen after refresh. No flash of "all 3 variants" state.
- Fail: Dashboard shows all 3 variants again, or shows an empty state.

**T2. Workspace renders chosen variant content after refresh**
- Severity: regression | Phase 2 change: ClientDashboard sessionStorage + choose_variant API
- Steps:
  1. Continue from T1 (variant #2 is chosen and page was refreshed).
  2. Inspect the post grid / feed preview area.
- Pass: The post cards shown correspond to variant #2's posts (spot-check captions match).
- Fail: Post area is empty, shows wrong variant's posts, or shows a loading spinner indefinitely.

---

### Group B: Unchoose-variant

**T3. Unchoose resets to draft and all 3 variants persist after refresh**
- Severity: regression | Phase 2 change: unchoose_variant action
- Steps:
  1. Start with a client that has a chosen variant (use T1 setup or repeat).
  2. Click "החלף וריאנט" (the swap / unchoose button).
  3. Confirm UI shows all 3 variants simultaneously and no "chosen" badge is visible.
  4. Open Network tab — verify the POST to `/api/append-event-posts` had `action:'unchoose_variant'` and returned `{ok:true, plan:{status:'draft'}}`.
  5. Press F5.
- Pass: After refresh, all 3 variants are still shown. No chosen highlight.
- Fail: Page shows empty state, or only 1 variant, or chosen badge reappears.

---

### Group C: Save-post-edit persistence

**T4. Caption edit persists after refresh**
- Severity: regression | Phase 2 change: save_post_edit action
- Steps:
  1. Open any chosen variant's post. Click the edit (pencil) icon.
  2. Change the caption to a unique test string (e.g., "בדיקה QA caption 001").
  3. Click "שמור". Modal closes.
  4. Press F5.
- Pass: The edited post still shows "בדיקה QA caption 001". No revert to original.
- Fail: Caption reverted to original AI-generated text after refresh.

**T5. Photo replacement persists after refresh**
- Severity: regression | Phase 2 change: save_post_edit action
- Steps:
  1. Open a post edit modal that allows photo replacement.
  2. Replace the current photo with a different image from the picker.
  3. Click "שמור". Confirm new photo is visible in the post card.
  4. Press F5.
- Pass: New photo is still shown after refresh.
- Fail: Original photo reappears.

**T6. Scheduled date edit persists after refresh**
- Severity: regression | Phase 2 change: save_post_edit action
- Steps:
  1. Open a post edit modal. Change the scheduled date to a clearly different date (e.g., 2 weeks later than current).
  2. Click "שמור". Confirm date shown in post card updates.
  3. Press F5.
- Pass: New scheduled date is shown after refresh.
- Fail: Date reverts to original default.

---

### Group D: Draft visibility (migration 056)

**T7. Draft plan visible after refresh without variant choice**
- Severity: regression | Phase 2 change: migration 056 RLS policy
- Steps:
  1. Open a client dashboard. Generate a fresh feed plan. Do NOT click "בחר" on any variant.
  2. Confirm 3 variants are shown (plan is in `draft` status).
  3. Press F5.
- Pass: All 3 variants still shown after refresh. No empty state.
- Fail: Empty state or "אין פיד" message appears — this means `draft` rows are still invisible to anon.

**T8. Draft row confirmed readable via Network tab**
- Severity: regression | Phase 2 change: migration 056 RLS policy
- Steps:
  1. From T7 state (draft plan, no chosen variant, page just refreshed).
  2. Open DevTools → Network → filter by "feed_plans".
  3. Locate the `feed_plans` SELECT request. Inspect the response JSON.
- Pass: Response includes the plan row with `status:'draft'` and a non-empty `posts.variants` array.
- Fail: Response is an empty array `[]` or the row is missing.

---

### Group E: Top-pick selection persistence (sessionStorage)

**T9. Top-pick selections survive refresh**
- Severity: regression | Phase 2 change: ClientDashboard sessionStorage
- Steps:
  1. On the client dashboard, locate the top-pick toggle (star / heart / checkbox) on individual photos.
  2. Toggle on exactly 3 specific photos. Note which ones.
  3. Press F5.
- Pass: The same 3 photos show as selected after refresh.
- Fail: All selections cleared, or different photos selected.

**T10. Switching client resets selections**
- Severity: regression | Phase 2 change: ClientDashboard sessionStorage keyed by clientId
- Steps:
  1. With Client A open and 3 top-picks selected (use T9 result), navigate to Client B's dashboard URL.
  2. Check top-pick state on Client B.
  3. Navigate back to Client A.
- Pass: Client B has its own (separate) selection state; Client A's selections are intact when returning to it.
- Fail: Client B shows Client A's selections, or returning to Client A shows Client B's selections.

**T11. Selections gone after browser close (sessionStorage scope)**
- Severity: cosmetic | Phase 2 change: ClientDashboard sessionStorage
- Steps:
  1. With 3 top-picks selected (T9 state), fully close the browser (all windows).
  2. Reopen browser and navigate back to the same client dashboard URL.
- Pass: Top-pick selections are cleared (empty). No photos pre-selected.
- Fail: Photos remain selected — this would indicate localStorage was used instead of sessionStorage.

---

### Group F: Error toasts visible

**T12. Blocked network shows Hebrew error toast on choose-variant**
- Severity: regression | Phase 2 change: Toast component + FeedStudio error handling
- Steps:
  1. Open DevTools → Network → right-click "Block request URL" for `/api/append-event-posts`.
  2. On a draft plan showing 3 variants, click "בחר" on any variant.
- Pass: A red toast appears at the bottom-left corner with Hebrew text (e.g., "שגיאה בשמירה"). The UI does NOT flip to show a chosen variant — all 3 variants remain visible.
- Fail: No toast appears, or the UI incorrectly shows the variant as chosen despite the failed request.

**T13. Retry after network restore succeeds**
- Severity: cosmetic | Phase 2 change: FeedStudio fetch flow
- Steps:
  1. From T12 state. Unblock the URL in DevTools Network.
  2. Click "בחר" again on the same variant.
- Pass: Request succeeds. UI shows chosen variant. Either a success toast appears or the transition is silent — both are acceptable per spec.
- Fail: Another error toast fires even though network is restored, or UI remains in broken state.

**T14. Blocked network shows toast on save-post-edit, modal stays open**
- Severity: regression | Phase 2 change: Toast component + FeedStudio error handling
- Steps:
  1. Block `/api/append-event-posts` in DevTools.
  2. Open a post edit modal. Change caption. Click "שמור".
- Pass: Red Hebrew toast appears. Modal remains open (not dismissed). Caption field still shows the edited value.
- Fail: Modal closes silently (user loses their edit with no feedback), or no toast appears.

---

### Group G: Backwards compatibility

**T15. EventPlanDialog default path unaffected**
- Severity: regression | Phase 2 change: dispatcher defaults
- Steps:
  1. Open a gallery event in the photographer dashboard (authenticated session).
  2. Open the EventPlanDialog for any event. Generate/approve a plan.
  3. Click "אשר והוסף לפיד" (confirm and add to feed).
- Pass: Request completes without error. Plan posts appended. No 400/500 response in Network tab.
- Fail: Error response, or the dialog shows a failure state.

**T16. Append-event-posts still appends posts to existing plan**
- Severity: regression | Phase 2 change: dispatcher defaults
- Steps:
  1. With an existing client plan already containing posts, trigger the plan-event flow for a second event for the same client.
  2. Approve and add to feed.
  3. Open the client's feed studio and verify post count increased.
- Pass: New posts appear in the rolling/chosen variant. Previous posts intact.
- Fail: Existing posts wiped, or new posts not appearing.

---

### Group H: Origin guard (Phase 1.B carry-over)

**T17. External origin rejected**
- Severity: regression | Phase 2 change: none — carry-over guard
- Steps:
  1. Open a terminal. Run:
     ```
     curl -s -X POST https://<your-vercel-url>/api/append-event-posts \
       -H 'Origin: https://evil.example.com' \
       -H 'Content-Type: application/json' \
       -d '{}'
     ```
- Pass: Response is `{"ok":false,"error":"origin_not_allowed"}` with HTTP 403.
- Fail: Any `ok:true` response, or HTTP 200, or a 500 that processes the body.

---

### Group I: Anti-regression

**T18. Anon live gallery read still works**
- Severity: regression | Phase 2 change: migration 056
- Steps:
  1. Open any public gallery share URL (no auth).
  2. Confirm photos load. Confirm no 403/RLS errors in the Network tab.
- Pass: Gallery loads normally. No auth errors.
- Fail: Photos fail to load, or console shows Supabase RLS errors.

**T19. Authenticated photographer can still edit plans**
- Severity: regression | Phase 2 change: migration 056, backend changes
- Steps:
  1. Log in as the photographer. Open the feed studio for any client.
  2. Make a minor edit to a post caption. Save.
- Pass: Edit saves. No console errors. Network shows successful `/api/append-event-posts` response.
- Fail: 403 ownership error, or UI error on save.

**T20. Face recognition / image upload unaffected**
- Severity: regression | Phase 2 change: none expected
- Steps:
  1. Upload a new gallery batch with photos of recognizable faces.
  2. Trigger face recognition (if manual trigger exists) or wait for auto-processing.
  3. Confirm recognized faces appear in the gallery.
- Pass: Face recognition results appear as before. No upload errors.
- Fail: Upload fails, recognition results missing, or new console errors referencing feed_plans.

---

### Group J: Security smoke

**T21. Ownership mismatch returns 403**
- Severity: regression | Phase 2 change: verifyOwnership in backend
- Steps:
  1. Obtain `planId` belonging to Client A.
  2. POST to `/api/append-event-posts` with:
     ```json
     {"action":"choose_variant","clientId":"<CLIENT_B_ID>","planId":"<PLAN_A_ID>","variantId":"any"}
     ```
     Use a valid `clientId` for a *different* client.
- Pass: HTTP 403 with `{"ok":false,"error":"plan_ownership_mismatch"}`.
- Fail: HTTP 200 (plan modified), or 500 (server error instead of access denial).

**T22. Non-existent variantId returns 400**
- Severity: regression | Phase 2 change: choose_variant handler
- Steps:
  1. POST to `/api/append-event-posts` with valid matching `clientId` and `planId`, but `variantId:"does-not-exist"`.
     ```json
     {"action":"choose_variant","clientId":"<VALID_ID>","planId":"<OWNED_PLAN_ID>","variantId":"does-not-exist"}
     ```
- Pass: HTTP 400 with `{"ok":false,"error":"variant_not_found"}`. Not a 500.
- Fail: HTTP 500, or the request modifies the plan with a null/empty variant.

**T23. Malformed post.id returns 400 on save_post_edit**
- Severity: regression | Phase 2 change: save_post_edit handler
- Steps:
  1. POST to `/api/append-event-posts`:
     ```json
     {"action":"save_post_edit","clientId":"<VALID_ID>","planId":"<OWNED_PLAN_ID>","variantId":"<VALID_VARIANT_ID>","post":{"id":"nonexistent-post-xyz","format":"single","image_id":"x","caption":"x","source_gallery_id":"x"}}
     ```
- Pass: HTTP 400 with `{"ok":false,"error":"post_not_found"}`. Not a 500.
- Fail: HTTP 500, or the endpoint silently inserts a new post into the variant array.

---

### Group K: Browser console smoke

**T24. FeedStudio fully migrated off direct Supabase writes**
- Severity: regression | Phase 2 change: FeedStudio.tsx fetch migration
- Steps:
  1. Open DevTools on the public client dashboard. Open both Console and Network tabs.
  2. Clear existing network log. Pick a variant on a draft plan.
  3. In Network tab, filter by "append-event-posts". Count POST requests.
  4. In Network tab, filter by "rest/v1/feed_plans". Look for any PATCH or PUT requests.
  5. In Console tab, look for any unhandled errors.
- Pass: Exactly ONE POST to `/api/append-event-posts` with request body containing `action:'choose_variant'`. Zero direct PATCH/PUT calls to `/rest/v1/feed_plans`. Console clean.
- Fail: Direct PATCH to `/rest/v1/feed_plans` present (FeedStudio not fully migrated), or multiple duplicate requests fired, or unhandled promise rejection in console.

---

## Sign-off

- [ ] All tests pass / acceptable failures documented with issue links
- [ ] Approver: _______________
- [ ] Date: _______________
- [ ] Notes on any blocked tests: _______________
