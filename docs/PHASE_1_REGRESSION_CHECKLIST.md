# Phase 1 Regression Checklist

> Run after merging Phase 1 PRs. Mark each test as ✅ pass / ❌ fail / ⚠️ blocked.

## Pre-flight

- [ ] Confirm latest `main` is deployed to `pixflow-ai.com` (check Vercel dashboard — build status green).
- [ ] Confirm migration 055 was applied in Supabase (SQL Editor: `SELECT * FROM supabase_migrations ORDER BY version DESC LIMIT 5;` — row with `055` present).
- [ ] Confirm Vercel build is green with no function errors.
- [ ] Have the Supabase anon public key ready (from Project Settings → API). You will paste it into curl commands below.
- [ ] Have a known image path in `gallery-images` ready (copy any object key from Supabase Storage UI).

---

## Group A: Live Gallery Rendering (anon visitors)

### T1. New-style gallery URL loads photos — alma-academy

**Phase 1 change:** #1 (storage policy DROP)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. Open Chrome (desktop). Navigate to `https://pixflow-ai.com/eclipse-media/g/alma-academy`.
2. Wait up to 15 seconds for images to load.
3. Scroll through the full photo grid.

**Pass criteria:** All photo thumbnails render. No broken image icons. Network tab (DevTools → Network → filter `img`) shows HTTP 200 for Supabase storage URLs.

**Fail criteria:** Any image returns 403/401 or shows a broken icon.

---

### T2. New-style gallery URL loads photos — lsport

**Phase 1 change:** #1
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. Open Chrome. Navigate to `https://pixflow-ai.com/eclipse-media/g/lsport`.
2. Scroll through photos and stories strip.

**Pass criteria:** Photos load. Stories thumbnails (if any) load without 403 errors.

---

### T3. Legacy short-form gallery URL still works

**Phase 1 change:** #1 (regression risk from routing, combined with storage policy)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. Open Chrome. Navigate to `https://pixflow-ai.com/eclipse-media/alma-academy`.
2. Confirm the page loads and shows photos (same gallery as T1).

**Pass criteria:** Page renders with photos. No redirect loop or 404.

---

### T4. Gallery loads on Mobile Safari

**Phase 1 change:** #7 (lazy loading) + #1
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. On an iPhone, open Safari. Navigate to `https://pixflow-ai.com/eclipse-media/g/alma-academy`.
2. Scroll slowly from top to bottom.

**Pass criteria:** Images load progressively as you scroll (lazy loading working). No images stuck as blank placeholders after passing them. No JS errors (check Safari Web Inspector if available).

**Fail criteria:** Images remain blank after scrolling past them, or the page crashes.

---

### T5. Stories strip loads for anon visitor

**Phase 1 change:** #1 (stories bucket policy)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. Open Chrome. Navigate to `https://pixflow-ai.com/eclipse-media/g/alma-academy`.
2. Locate the Stories strip (horizontal scroll row near top).
3. Click one story — it opens/plays.

**Pass criteria:** Story thumbnails render (HTTP 200 from `gallery-stories` bucket). Story opens on click.

**Fail criteria:** 403/401 on story media, or broken thumbnails.

---

## Group B: Photographer Dashboard — Upload & Edit

### T6. Upload 3 photos to a test gallery

**Phase 1 change:** #1 (INSERT on storage must still work for authenticated users)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. Navigate to `https://pixflow-ai.com/dashboard`. Log in as a photographer account.
2. Open or create a test gallery named `regression-test-YYYYMMDD`.
3. Upload 3 JPEG photos via the upload button.
4. Wait for upload confirmation.

**Pass criteria:** All 3 photos appear in the gallery grid within 30 seconds. No upload errors in the UI.

**Fail criteria:** Upload fails with 403/401, or photos do not appear after upload.

---

### T7. Mark a photo as top-pick — persists

**Phase 1 change:** #1 (UPDATE on storage objects is gone for anon, but auth users must still work)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. In the test gallery from T6, click the star/heart icon on one photo to mark it as a top pick.
2. Reload the page.

**Pass criteria:** The photo is still marked as top-pick after reload.

---

### T8. Edit gallery name — persists

**Phase 1 change:** #1 (database-level, not storage — sanity check that dashboard DB writes still work)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. In the test gallery, click the gallery name and rename it to `regression-test-RENAMED`.
2. Reload the page.

**Pass criteria:** Gallery displays the new name after reload.

---

## Group C: Client Dashboard & AI Wizard

### T9. Client dashboard galleries grid renders

**Phase 1 change:** #1, #3 (origin allowlist)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. Open Chrome. Navigate to `https://pixflow-ai.com/eclipse-media/c/promarket`.
2. Confirm the galleries grid appears with cover images.

**Pass criteria:** Grid renders with cover images (no broken icons). No 403 errors on storage URLs.

---

### T10. AI wizard opens and completes — scoring + 4 directions

**Phase 1 change:** #2 (maxDuration=60), #3 (origin allowlist), #5 (LLM tail gated)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. On the client dashboard (`/eclipse-media/c/promarket`), click the "🎨 מנוע יצירה" button on any gallery card.
2. Step through the wizard pages (style, brief, etc.).
3. Click the final "Generate" / "צור" button.
4. Wait up to 60 seconds.

**Pass criteria:** AI scoring completes. Exactly 4 creative directions are returned and displayed. No timeout error.

**Fail criteria:** Request times out, returns an origin error (403), or fewer than 4 directions appear.

---

## Group D: Feed Studio

### T11. "תכנן את הפיד שלי" button — workspace renders

**Phase 1 change:** #2, #3, #7 (lazy images in FeedStudioPreviews)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. On the client dashboard, click "תכנן את הפיד שלי".
2. Wait up to 60 seconds.
3. Scroll through the workspace cards.

**Pass criteria:** Workspace renders multiple post cards. Card images load (lazy load triggers on scroll). No timeout or origin error.

---

### T12. Per-event "תכנן פוסטים" — returns posts

**Phase 1 change:** #2, #3
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. On the client dashboard, find an individual event row and click "תכנן פוסטים".
2. Wait up to 60 seconds.

**Pass criteria:** Posts are generated and displayed for that event. No error shown.

---

## Group E: Face Recognition

### T13. Selfie upload returns matches

**Phase 1 change:** #2 (maxDuration=60 on AI endpoints), #3
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. Open a gallery that has face recognition enabled (confirm with the developer which gallery slug to use).
2. Click the face-search button and upload a selfie JPEG.
3. Wait up to 30 seconds.

**Pass criteria:** Matched photos are returned and displayed. No timeout or CORS error.

---

## Group F: URL Backwards Compatibility

### T14. Legacy UUID client URL redirects or loads

**Phase 1 change:** #1 (routing unaffected, but confirm no regression)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. Obtain the UUID-format client URL (`/eclipse-media/client/<uuid>/dashboard`) from the developer or Supabase `clients` table.
2. Navigate to that URL in Chrome.

**Pass criteria:** Page either loads the dashboard correctly or redirects cleanly to the new slug-based URL. No 404.

---

## Group G: Downloads & JSZip

### T15. Download 5 photos as ZIP

**Phase 1 change:** #1 (anon SELECT on storage must still work; DELETE was removed but download is GET)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. Open `https://pixflow-ai.com/eclipse-media/g/alma-academy` (anon, no login).
2. Select 5 photos using checkboxes (or long-press on mobile).
3. Click "Download" / "הורד".
4. Wait for the ZIP file to download.

**Pass criteria:** ZIP file downloads and contains all 5 selected images when opened.

**Fail criteria:** Download fails, returns an error, or ZIP is empty/corrupt.

---

## Group H: Cross-Client Isolation (Smoke Test — Known Issue)

### T16. Anon fetch to another client's gallery (smoke, not security gate)

**Phase 1 change:** N/A (documents current known state; Phase 3 will fix)
**Severity if fails:** COSMETIC — ship anyway (tracked separately)

**Steps:**
1. Open DevTools → Console on `https://pixflow-ai.com/eclipse-media/c/promarket`.
2. Run:
   ```js
   fetch('https://vlyiqfawkrjvqcmkpfvs.supabase.co/rest/v1/galleries?select=*&client_slug=eq.another-client', {
     headers: { apikey: '<anon-key>', Authorization: 'Bearer <anon-key>' }
   }).then(r => r.json()).then(console.log)
   ```
3. Observe the result.

**Expected behavior (document, do not block):** Data for `another-client` is returned (RLS not yet enforced at row level for gallery reads). This is a known gap to be fixed in Phase 3. Record the result here for baseline comparison.

---

## Group I: Anti-Regression for Phase 1 Changes Themselves

### T17. Blocked CORS — evil origin returns 403

**Phase 1 change:** #3 (origin allowlist)
**Severity if fails:** SECURITY REGRESSION — block deploy

**Steps:**
1. From a terminal, run:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     https://pixflow-ai.com/api/generate-feed \
     -X POST \
     -H "Content-Type: application/json" \
     -H "Origin: https://evil.example.com" \
     -d '{}'
   ```

**Pass criteria:** HTTP response code is `403`. Response body (if you remove `-o /dev/null`) contains `origin_not_allowed`.

---

### T18. No origin header passes through to business validation

**Phase 1 change:** #3
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. From a terminal, run:
   ```bash
   curl -s https://pixflow-ai.com/api/generate-feed \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

**Pass criteria:** Response is NOT a 403. It returns a business-layer error such as `{"ok":false,"error":"brief_required"}` or similar (400-level). This confirms the empty-origin bypass works correctly.

---

### T19. OG share meta — clientCode absent

**Phase 1 change:** #4 (OG field whitelist in share.ts)
**Severity if fails:** SECURITY REGRESSION — block deploy

**Steps:**
1. Obtain a valid gallery share ID from the developer (or from the Supabase `galleries` table — the `id` column).
2. In a terminal, run:
   ```bash
   curl -s "https://pixflow-ai.com/api/share?id=<gallery-id>" | grep -i "clientCode"
   ```
3. Also view the URL in a browser and use DevTools → Elements to search for `clientCode` in `<meta>` tags.

**Pass criteria:** The string `clientCode` does NOT appear anywhere in the HTML source or curl output. Only allowed fields appear: `studioName`, `galleryTitle`, `galleryDescription`, `eventDate`, `eventLocation`, `studioWebsite`, `logoUrl`.

**Fail criteria:** `clientCode` or any other private field appears in the response.

---

### T20. LLM error tail hidden in production

**Phase 1 change:** #5 (NODE_ENV gate)
**Severity if fails:** SECURITY REGRESSION — block deploy

**Steps:**
1. Force an AI endpoint error by calling it with a deliberately invalid payload:
   ```bash
   curl -s https://pixflow-ai.com/api/generate-feed \
     -X POST \
     -H "Content-Type: application/json" \
     -H "Origin: https://pixflow-ai.com" \
     -d '{"brief": "x", "___force_error": true}'
   ```
2. Inspect the JSON response for any field named `tail`, `raw`, `llmResponse`, or similar containing multi-line LLM output.

**Pass criteria:** Response contains only a short user-facing error message. No raw LLM output or stack trace is exposed.

---

### T21. ErrorBoundary catches uncaught SPA exception — Hebrew panel shown (approximated)

**Phase 1 change:** #6 (global ErrorBoundary)
**Severity if fails:** REGRESSION — ship with caution

**Steps (approximated — requires DevTools):**
1. Open `https://pixflow-ai.com/eclipse-media/c/promarket` in Chrome.
2. Open DevTools → Console.
3. Paste and run:
   ```js
   // This simulates an unhandled render error
   window.__triggerErrorBoundary && window.__triggerErrorBoundary();
   ```
4. If the above helper does not exist, navigate to any client dashboard page, then in Console run:
   ```js
   throw new Error("manual regression test")
   ```
   (Note: a thrown error in the console does NOT propagate to React's ErrorBoundary — this step is for documentation only. The tester should confirm with the developer that a Storybook or test story for ErrorBoundary exists and renders the Hebrew fallback UI.)

**Pass criteria:** Developer confirms (or a test story shows) that a React render error inside the app tree renders a Hebrew-language error panel rather than a blank white screen.

**Note:** Full automated validation of this requires a dedicated test fixture. Mark as ⚠️ blocked if no test story is available.

---

## Group J: Storage Delete Security Regression

### T22. Anon DELETE on gallery-images is blocked (THE critical test)

**Phase 1 change:** #1 (DROP `anon_all_*` policies)
**Severity if fails:** CRITICAL SECURITY REGRESSION — block deploy immediately

**Steps:**
1. From a terminal, run the following (replace `<known-path>` with any real object key visible in Supabase Storage UI, e.g. `eclipse-media/alma-academy/photo-001.jpg`):
   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     "https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/gallery-images/<known-path>" \
     -X DELETE \
     -H "apikey: <anon-key>" \
     -H "Authorization: Bearer <anon-key>"
   ```
2. Record the HTTP response code.

**Pre-Phase-1 expected:** `200` (file would be deleted — data loss).
**Post-Phase-1 pass criteria:** `401` or `403`.

**Fail criteria:** Any `2xx` response means the policy was not applied. Stop deployment and recheck migration 055.

---

### T23. Anon DELETE on gallery-stories is blocked

**Phase 1 change:** #1
**Severity if fails:** CRITICAL SECURITY REGRESSION — block deploy immediately

**Steps:**
1. Repeat T22 using the `gallery-stories` bucket:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     "https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/gallery-stories/<known-path>" \
     -X DELETE \
     -H "apikey: <anon-key>" \
     -H "Authorization: Bearer <anon-key>"
   ```

**Post-Phase-1 pass criteria:** `401` or `403`.

---

### T24. Anon SELECT on gallery-images still works (no regression)

**Phase 1 change:** #1 (SELECT must be preserved)
**Severity if fails:** REGRESSION — block deploy

**Steps:**
1. In a browser (logged out / incognito), navigate to any Supabase image URL from the gallery:
   `https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/gallery-images/<known-path>`

**Pass criteria:** Image downloads / displays correctly (HTTP 200). Anon read access is intact.

---

## Sign-off

| # | Test | Result | Notes |
|---|------|--------|-------|
| T1 | alma-academy photos load (Chrome) | | |
| T2 | lsport photos + stories load | | |
| T3 | Legacy URL works | | |
| T4 | Mobile Safari lazy load | | |
| T5 | Stories strip anon | | |
| T6 | Upload 3 photos | | |
| T7 | Top-pick persists | | |
| T8 | Gallery rename persists | | |
| T9 | Client dashboard grid | | |
| T10 | AI wizard 4 directions | | |
| T11 | Feed Studio workspace | | |
| T12 | Per-event post plan | | |
| T13 | Face recognition match | | |
| T14 | Legacy UUID URL | | |
| T15 | ZIP download 5 photos | | |
| T16 | Cross-client isolation smoke | | |
| T17 | Evil origin → 403 | | |
| T18 | No origin → business error | | |
| T19 | OG share no clientCode | | |
| T20 | LLM tail hidden in prod | | |
| T21 | ErrorBoundary Hebrew panel | | |
| T22 | Anon DELETE gallery-images → 403 | | |
| T23 | Anon DELETE gallery-stories → 403 | | |
| T24 | Anon SELECT gallery-images → 200 | | |

- [ ] All REGRESSION tests pass (or acceptable failures documented with a tracking issue).
- [ ] T22 and T23 specifically confirmed as 401/403.
- [ ] Approver: ___________________________
- [ ] Date: ___________________________
- [ ] Deployment approved: Yes / No
