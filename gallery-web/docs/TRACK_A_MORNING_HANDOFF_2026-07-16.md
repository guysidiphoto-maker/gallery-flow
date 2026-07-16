# Track A — Morning handoff (read this first)

**Prepared overnight, 2026-07-16.** Nothing was merged, deployed, or applied to the database. Pricing/LemonSqueezy untouched. Your `PricingPage.tsx` WIP is still safe in `stash@{0}`.

---

## TL;DR — what's done and what needs YOU

**Done overnight (pushed, reviewed, tested — not merged):**
- ✅ Reconciled all the overlapping security/upload branches into ONE branch: `security/track-a-hardening-reconciled` (best-of-both + server-side Sentry).
- ✅ Adversarial code review → found 1 P2 bug → fixed → re-verified → re-pushed.
- ✅ Full type-check + build + a 13/13 runtime unit-check of the security guards.
- ✅ Wrote: reconciliation report, LemonSqueezy checklist, PR descriptions, this handoff, and a Track B plan.

**Needs you (human-gated — I can't and shouldn't do these while you sleep):**
1. **Merge** the primary PR (main is protected → PR-only; you said don't auto-merge).
2. **Verify LemonSqueezy** in the dashboard (only you have access).
3. **Decide the pricing direction** (your Solo/Pro/Studio 99/199/449 is wired nowhere yet).
4. **Confirm two defaults** (HEIC rejection + `PUBLIC_FORMS_ENABLED` on).
5. Optionally run **live e2e** against a preview deploy.

---

## Step-by-step for the morning

### 1. Open + review the PR
Branch `security/track-a-hardening-reconciled` → `main`. Description ready to paste in `PR_DESCRIPTIONS_TRACK_A_2026-07-16.md`.
URL: https://github.com/guysidiphoto-maker/gallery-flow/pull/new/security/track-a-hardening-reconciled

### 2. (Optional but recommended) run the live flow check on the preview
Vercel builds a preview per PR. Against that preview URL, verify: lead capture → SMS, questionnaire → SMS/email, upload (JPEG ok / HEIC rejected / 100MB rejected), gallery access, face search, download. These are the flows I could NOT run headless (they need a live backend + auth).

### 3. Confirm two product defaults (change now if you disagree)
- **HEIC uploads are now rejected** with "export as JPEG" (they were silently breaking before — the transform can't decode HEIC). If you want HEIC accepted, we need to add HEIC→JPEG conversion first.
- **Public forms are ON by default** (protected by Turnstile + rate limits). If lead-capture/questionnaire should stay off for launch, set env `PUBLIC_FORMS_ENABLED=false`.

### 4. Merge order
Only one PR to merge: **`security/track-a-hardening-reconciled`**. After it merges, close (don't delete) the 6 superseded branches listed in the PR-descriptions doc.

### 5. LemonSqueezy verification (the real launch blocker)
Work through `LEMONSQUEEZY_VERIFICATION_CHECKLIST_2026-07-16.md`. **Headline:** your intended prices (Solo ₪99 / Pro ₪199 / Studio ₪449) are reflected in **zero** layers — the site shows ₪79/159/349, the DB shows $19/$39/$94, and plan IDs are `pro/business/agency`. Nothing charges the intended amounts yet. That doc lists every mismatch + the exact dashboard checkboxes. **This is a separate work item** from the security PR — I did not touch pricing per your instruction.

### 6. Integrated regression (after merge)
Once you've merged, tell me and I'll run an integrated check from the updated `main` (type-check + build + re-review of the combined tree) and then mark Track A complete — per your step 13/14.

---

## Decisions I made for you overnight (and why)

| Decision | Choice | Why |
|---|---|---|
| Reconciliation approach | Best-of-both, single branch | Your explicit option 1 |
| Max upload size | 40 MB | Covers real high-res JPEG/PNG; blocks RAW/video (25MB felt tight, 75MB too loose) |
| Max batch | 1000 | Guardrail; uploads are token-gated anyway |
| HEIC | Reject w/ message | Transform can't decode it → accepting = broken images |
| Turnstile failure | Fail-open to rate limits | Never block a real guest when Cloudflare is down |
| Rate-limited submit | Preserve data, withhold only SMS/email | Photographer still gets the lead; guest still gets the link |
| Public forms default | ON (kill switch available) | They're real flows and now protected |
| Track B | Planned only, NOT built | You said don't start it; I prepared a reviewable plan instead (see below) |

---

## What I deliberately did NOT do (your rails)
No merge · no deploy · no production DB migration applied · no pricing / LemonSqueezy / plan / website-price changes · no branches deleted or closed · `PricingPage.tsx` stash untouched.

## The phase after — Track B
I did **not** build Track B (you'd said don't start it, and your own Phase-0 doc sequences it after Track A ships). Instead I wrote a concrete, reviewable plan + a **draft** (not applied) migration so you can green-light it fast: `proposals/TRACK_B_PRODUCTION_FOUNDATIONS_PLAN_2026-07-16.md`.
