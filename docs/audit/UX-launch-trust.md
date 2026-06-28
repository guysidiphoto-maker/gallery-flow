# Pixflow — UX & Launch-Trust Audit

Role: UX / Visual-QA + Frontend Engineer (audit only). READ-ONLY analysis of code + public HTML.
Repo: `/Users/guysidi/gallery-flow` · Web app: `gallery-web/src/` (React SPA) · Prod: https://pixflow-ai.com
Date: 2026-06-29 · Scope: launch-TRUST and UX-correctness only (not taste). No redesign, no edits, no deploys. **prod-touched = no for every item.**

---

## Executive summary

The product is in **better shape than a typical pre-launch SaaS**: onboarding has a real empty state, the public gallery viewer is polished and correctly localized, password gate and Viewer are templates of good bilingual UX. The core photographer flow (create gallery → upload → publish) is not broken.

**The launch-trust risks are concentrated in three places:**

1. **Fabricated testimonials with hardcoded 5-star ratings** on the English landing page (`/en`). This is a clear honesty/legal risk (fake named endorsements + fake stats) — the only true **P0**.
2. **Raw English/technical error strings leaking to Hebrew users** across the client portal, client dashboard, and FeedStudio AI errors (including operator-only messages like "Anthropic key not configured in Vercel" shown to paying clients). Makes the product look broken/unfinished the moment anything fails.
3. **"Coming soon" / dead affordances surfaced in the main UI** — a `בקרוב` "Download Tracking" placeholder panel under the gallery grid, disabled export/schedule buttons, a blank "תצוגה חיה" editor tab, and a FeedStudio where 4 of 5 post formats open a "phase 2" wall.

Plus a structural inconsistency: **two contradictory landing pages** (a macOS desktop pitch at `/en` with USD pricing vs. the Hebrew face-recognition SaaS at `/` with ILS pricing) describing different products at different prices.

### Launch-trust verdict: **CONDITIONAL — do not launch the `/en` page until the fake testimonials are removed.**
The Hebrew root (`/`) + ILS pricing page are honest and launch-ready. The single hard blocker is the fabricated testimonials section on `/en` (P0). After that's removed/disabled, the remaining items are P1–P3 polish that won't make the product look scammy, only somewhat unfinished. Recommend: remove testimonials (P0), fix the most-visible error leaks + hide the "Download Tracking" placeholder (P1), then launch.

Routing note (confirmed in `main.tsx:235-236`): prod root `/` serves `LandingPageHe` (clean). `/en` serves `LandingPage` (contains the P0). The desktop/USD page is therefore live but secondary.

---

## P0 — Makes the product look scammy / legal risk (LAUNCH BLOCKER)

### P0-1 — Fake named testimonials + hardcoded ★★★★★ ratings
- **File/route:** `gallery-web/src/pages/LandingPage.tsx` (served at `/en`), lines 79–90 (EN) / 224–235 (HE) / section 748–777 / stars 760–762.
- **What a user sees:** Four testimonials with invented names, roles, locations, quotes, each with a hardcoded five-star rating:
  - "Avi Cohen, Wedding Photographer, Tel Aviv", "Maya Levi, Event Photographer", "Daniel Russo, Portrait Photographer, NY", "Tom Barak, Concert Photographer".
  - Embedded fabricated stat: "Pixflow cut my delivery time by **80%**" (L88/233).
  - `{'★★★★★'}` rendered on all four cards (L761).
- **Why it hurts trust:** Fabricated endorsements with fake names + fake star ratings are a textbook FTC / consumer-protection violation and a brand bomb if a "named" person is contacted. Cannot be softened.
- **Fix (small + safe):** Hide the entire `#testimonials` block (wrap the section render in `false &&` or remove). Re-add only with real, attributable, consented testimonials. **can-do-now: yes. prod-touched: no.**

---

## P1 — Looks broken/unfinished at launch (fix before public)

### P1-2 — Raw English/technical errors leaked to Hebrew end users
- **Files/routes:**
  - `pages/ClientPage.tsx:146-149,234` → `'No galleries found'` / `'Could not load client page'` rendered bare, unstyled, English, no RTL.
  - `pages/ClientDashboard.tsx:171,176,282` → `'Business not found'`, `'Client not found'`, `'Could not load'`, `'No galleries found'` (English inside the RTL Hebrew shell).
  - `components/FeedStudio.tsx:1266-1267` → `'מפתח Anthropic לא מוגדר ב-Vercel.'` / `'Supabase לא מוגדר ב-Vercel.'` — operator/devops errors shown verbatim to paying clients, naming Anthropic/Vercel/Supabase.
  - `components/FeedStudio.tsx:1271,1279` → `'קריאה ל-AI נכשלה. ' + detail.slice(0,80)` and default `'שגיאה. ' + (detail || code)` splice raw (English) server/Anthropic text into Hebrew UI.
  - `pages/Dashboard.tsx` — ~15 toasts/alerts concatenate raw `error.message`; worst are native `alert('שגיאה: ' + error.message)` at L896 (delete section) and L1328 (export), plus gallery-create L704.
- **What a user sees:** English DB/API error text (or vendor config errors) on an otherwise Hebrew screen the moment anything fails.
- **Why it hurts trust:** Reads as a broken/leaky site; the Vercel/Anthropic config strings look like the product is held together with tape.
- **Fix (small + safe):** (a) Hebrew copy for the ClientPage/ClientDashboard empty+error fallbacks (reuse the `PasswordGate` `GATE_STRINGS` + `lang` pattern already in the codebase). (b) In `FeedStudio.humanError`, replace `anthropic_not_configured`/`supabase_not_configured` with a generic "שירות ה-AI אינו זמין כרגע. נסו שוב מאוחר יותר." and drop `code`/`detail` from user-visible strings (log to console). (c) A single `humanizeError()` helper for Dashboard + convert the native `alert()`s to `showToast`. **can-do-now: yes. prod-touched: no.**

> NOTE: the **public gallery viewer** (`App.tsx:1601-1624`) already does this correctly — `'Gallery not found'` is mapped to a branded Hebrew "הגלריה לא נמצאה" with RTL. That is the template to copy.

### P1-3 — "Download Tracking" `בקרוב` placeholder panel on the main dashboard
- **File/route:** `pages/Dashboard.tsx:5804-5858` (`/dashboard`).
- **What a user sees:** A greyed-out panel with a "בקרוב" pill and three skeleton placeholder rows, rendered for every user with ≥1 gallery, directly under the gallery grid. Also redundant with the shipped per-gallery Activities tab.
- **Why it hurts trust:** A visible "coming soon" widget bolted onto the primary dashboard reads as unfinished.
- **Fix (small + safe):** Wrap the block in `false &&` or a feature flag until the real feature ships. **can-do-now: yes. prod-touched: no.**

### P1-4 — FeedStudio: 4 of 5 post formats open a "phase 2" wall
- **File/route:** `components/FeedStudio.tsx:565-589` (footer reinforces `:1060-1062`).
- **What a user sees:** Clicking any carousel/story/reel/text post (AI plans routinely generate these) opens a modal saying `{format} · בקרוב` / "עריכה מלאה לפורמט הזה תזמין בעדכון הקרוב". Only single-image posts are editable.
- **Why it hurts trust:** The product sells full AI feed management; most generated posts are read-only dead ends. Biggest FeedStudio trust gap.
- **Fix:** Product decision (document only). Short term: AI plan should bias toward single-image, or gate non-single formats with a clearer "preview only — full editing soon" affordance instead of a dead modal. **can-do-now: partial. prod-touched: no.**

### P1-5 — FeedStudio generation progress bar finishes/looks frozen while still working
- **File/route:** `components/FeedStudio.tsx:275-281,346,769`.
- **What a user sees:** Stage timer caps at ~36–48s and the progress bar sits at 100% / full width while the (often >1 min) fetch is still pending. No timeout/abort on the fetch; if the serverless function hangs, the user is stuck on a full-bar "Generating" screen indefinitely.
- **Why it hurts trust:** Looks like a frozen/failed generation on a paid AI feature.
- **Fix (small + safe):** When stage hits last, switch to a pulsing "כמעט שם…" state (not a static 100% bar); add an `AbortController` timeout → Hebrew "לקח יותר מהצפוי, נסו שוב" toast. Mirror the Dashboard story-render poll (`Dashboard.tsx:1606-1634`), which has the same no-timeout issue (P2). **can-do-now: yes. prod-touched: no.**

### P1-6 — Public client portal (`ClientPage.tsx`) is 100% English with no RTL
- **File/route:** `pages/ClientPage.tsx` throughout (nav `:299-301`, `:349` "Client Login", `:407,442,551,572,641,653,742` etc., English months `:65-66`, no `direction:'rtl'` anywhere).
- **What a user sees:** The client's first-impression public link is entirely English LTR ("Galleries / Highlights / Stories / Powered by Pixflow"), with Hebrew event-type filter chips mixed in — for a Hebrew-market product.
- **Why it hurts trust:** Inconsistent with the RTL Hebrew logged-in dashboard; reads as half-built.
- **Fix:** Localize strings + add `dir="rtl"` (or honor a delivery-language setting). Sizable but mechanical — **document the scope; not a one-liner. prod-touched: no.**

---

## P2 — Polish gaps (won't look scammy, but rough)

### P2-1 — Blank "תצוגה חיה" editor tab
- `pages/Dashboard.tsx`: tab listed at L3108 switches `editTab` to `preview`, but the only content for that tab is killed by a `{false && ...}` guard at L5535. Clicking it shows an empty white pane. Fix: remove the `preview` tab entry. **can-do-now: yes.**

### P2-2 — Disabled "בקרוב" export/schedule buttons in Creative Engine
- `components/CreativeEngineDialog.tsx:512-513`: `📥 ייצוא PNG (בקרוב)` and `📅 תזמן ל-IG (בקרוב)` rendered `disabled`. Honest but visible dead affordances. Fix: hide until functional. **can-do-now: yes.**

### P2-3 — Half-translated dashboards (EN labels in RTL Hebrew shells)
- `pages/Dashboard.tsx`: KPI stat cards `Galleries/Photos/Published/Drafts` (L2122-2125), primary CTA `New Gallery` (L2414), empty-state `Create first gallery`/`Try demo` (L2537/2557), Add-Set modal entirely English (L5718…) with Hebrew placeholders mid-modal.
- `pages/ClientDashboard.tsx`: tab labels `Feed Studio/Content Studio/Galleries/Stories` (L539-545), `Selected/Top Picks/Download {n}/Browse more/View Gallery` etc., `Loading…`/`Loading Feed Studio…` Suspense fallbacks.
- Deliberate "editorial English eyebrow" style is fine, but action buttons + KPIs switching language reads as half-translated. Fix: translate action/KPI strings; keep decorative eyebrows English. **Document + decide.**

### P2-4 — Silent download failures (no error handling)
- `pages/ClientDashboard.tsx:83-91`: `downloadImage` `fetch→blob` has no try/catch; a failed/expired signed URL silently does nothing while the "Downloading…" label resets. Fix: try/catch + Hebrew toast. **can-do-now: yes.**

### P2-5 — Stories block page load on the critical path
- `pages/ClientPage.tsx:196-206` and `pages/ClientDashboard.tsx:327-332`: `await Promise.all(stories.map(HEAD ...))` before `setLoading(false)`. Many stories on a slow CDN hold the whole page on the spinner. Fix: set loading false first, populate stories after. **can-do-now: yes.**

### P2-6 — Mobile: Viewer touch targets below 44px
- `Viewer.tsx:182,199,306`: close 38×38, prev/next 42×42 — below the 44px touch-target guideline; edge-mistap risk on phones (swipe nav exists as fallback). Fix: bump to ≥44px on small screens. **MANUAL: verify in browser. can-do-now: yes.**

### P2-7 — ClientHome "pending approvals" CTA points at a non-existent queue
- `components/ClientHome.tsx:102-107`: hardwired `0` + button "לאישור פוסטים" navigates to FeedStudio, which has no approval queue. The file header (`:1-8`) admits these are honest placeholders. Document only / make the CTA neutral.

### P2-8 — Two contradictory landing pages / pricing models
- `LandingPage.tsx` (`/en`): macOS desktop pitch, USD ($19/$39), free tier "3 galleries/500 photos/2GB".
- `LandingPageHe.tsx` (`/`) + `PricingPage.tsx`: face-recognition SaaS, ILS (₪79/₪159/₪349 + ₪590), free tier "100 photos".
- Different products, currencies, tier names, free limits. Per project memory the ILS tiers are canonical → the USD/desktop page is stale. **Fix: pick one canonical landing+pricing; remove/redirect the other. Document — owner decision.**

---

## P3 — Minor / informational

- `pages/LandingPage.tsx:46,66,72` — hard time guarantees ("in seconds", "Live gallery in 60 seconds", "Under 5 minutes"). Soften or verify (bandwidth-dependent).
- `pages/LandingPageHe.tsx:108` — face-recognition accuracy FAQ "גבוה מאוד — עובד גם בתאורה חלשה, עם משקפיים ובתמונות קבוצתיות." Overclaim; soften to "works well in most conditions; a clear well-lit selfie is best" (the blog already says this).
- `components/FaceScanShowcase.tsx:16,141` — decorative `99%` confidence chips; reads as a published accuracy figure. Consider removing/lowering.
- `pages/LandingPage.tsx:118,131` — "Start Free Trial" CTA but there's no trial (free tier is permanent). Soften to "Get Started".
- `pages/Dashboard.tsx:1389,4989` — `recheckCustomDomain` is a stub ("רענן סטטוס" does nothing visible). Business-plan + pending-domain only. Hide or wire.
- `App.tsx:568,582` — TODO comments: event meta / gallery description at `rgba(.25)`/`(.22)` ≈ 1.6–1.8:1 contrast on black; fails WCAG for non-decorative text. Design decision flagged in code.
- `ClientPage.tsx:406,550,574,655` — muted text at `rgba(255,255,255,.3)` on `#0a0a0f` ≈ borderline 3:1. **MANUAL: verify contrast.**
- `pages/Dashboard.tsx:1053…` — faked upload-percentage steps (0/30/80/100), not real progress. Document only.
- `pages/Dashboard.tsx:565-579` — activities fetch *failure* falls through to the "no activity yet" empty state (indistinguishable). Document only.
- `Viewer.tsx:1163-1168` (FeedStudio `datetime-local`) — native date picker inside RTL. **MANUAL: verify it doesn't render broken in RTL.**

---

## Strong surfaces (no action — use as templates)

- **`App.tsx` public gallery viewer** — localized branded error (`:1601-1624`), section-per-page navigation, LQIP, snapshot fallback.
- **`Viewer.tsx`** — LQIP + spinner + localized error + "next image" CTA, focus trap, swipe; spinner correctly hides on error.
- **`PasswordGate.tsx`** — fully bilingual via `GATE_STRINGS` + `lang` prop, cooldown, a11y-complete. The bilingual pattern to extend to ClientPage/ClientDashboard.
- **`Dashboard.tsx` first-run** — genuine onboarding hero (`:2480-2603`): welcome, value prop, "Create first gallery" CTA, "Try demo", feature tiles, skeleton loader (no flash-of-empty). Onboarding is NOT a risk.
- **`FeedStudio` empty state** (`:639-753`) and save/choose error handling (`:396-400,451-457`) — clean Hebrew toasts + console logging. The right pattern; `humanError` (P1-2) should match it.

---

## MANUAL browser/mobile checks for owner

1. Open a public client link on a **phone** — confirm Viewer arrows/close/download are tappable (≥44px) and the download bar doesn't overflow with a long Hebrew label. (`Viewer.tsx`)
2. Verify the **public gallery viewer is one-section-per-page** (project invariant — never a stacked scroll) on mobile + desktop.
3. Open the **client portal (`ClientPage`)** as a Hebrew client — confirm whether the all-English LTR layout is acceptable for launch.
4. Trigger a **FeedStudio AI generation** that runs >1 min — confirm the progress bar doesn't look frozen and an error/timeout surfaces if it hangs.
5. Force an **error** (bad client code, dead gallery link, offline) on ClientPage / ClientDashboard — confirm no raw English error text appears.
6. Check **contrast** of muted text on the dark ClientPage (`rgba(.3)` lines) and the `rgba(.22-.25)` event meta in `App.tsx`.
7. Open the **FeedStudio schedule `datetime-local`** picker in RTL — confirm it's not visually broken.
8. Confirm **AI Stories** (sold as a current feature + paid-tier deliverable) actually ships at launch; if not, remove from features + pricing.
9. Click the **"תצוגה חיה"** editor tab in `/dashboard` — confirm/repro the blank pane.
10. Decide which **landing page + pricing model** is canonical (`/` ILS SaaS vs `/en` USD desktop).

---

## Fake / overclaimed copy to remove before public launch

| # | Item | File:line | Action |
|---|------|-----------|--------|
| 1 | **Four fake named testimonials** (Avi Cohen / Maya Levi / Daniel Russo / Tom Barak) | `LandingPage.tsx:79-90, 224-235` | **REMOVE (P0)** — fake endorsements |
| 2 | **Hardcoded ★★★★★ on every testimonial** | `LandingPage.tsx:760-762` | **REMOVE (P0)** — fake ratings |
| 3 | **"cut my delivery time by 80%"** (fabricated stat in testimonial) | `LandingPage.tsx:88, 233` | REMOVE with #1 |
| 4 | Hard time guarantees: "in seconds", "60 seconds", "under 5 minutes" | `LandingPage.tsx:46,66,72` (+HE) | Soften / verify |
| 5 | Face-recognition "גבוה מאוד — even low light/glasses/groups" | `LandingPageHe.tsx:108` | Soften |
| 6 | Decorative "99%" confidence chips | `FaceScanShowcase.tsx:16,141` | Remove / lower |
| 7 | "Start Free Trial" with no trial | `LandingPage.tsx:118,131` | Reword to "Get Started" |

No fake client/partner logos, no award badges, and no fake usage counts ("10,000+ photographers", "trusted by") were found. The Hebrew root (`/`), SEO landing, blog, and ILS `PricingPage.tsx` are honest. **The only true fake copy is the testimonials block on `/en`.**

---

## Pricing story clarity

- **ILS `PricingPage.tsx` is clear and launch-ready** (not a placeholder): 3 tiers — מקצועי ₪79 (2,000 photos/75GB), עסקי ₪159 "הכי משתלם" (10,000/400GB), סוכנות ₪349 (30,000/1.5TB), one-time ₪590 single-event (12-mo storage), Free 100 photos no-card. No TODO/coming-soon.
- **Risk is contradiction, not absence:** the `/en` page advertises a different USD ladder for a different (desktop) product (P2-8). A visitor comparing the two sees inconsistent pricing. Resolve to one canonical model before public launch.
