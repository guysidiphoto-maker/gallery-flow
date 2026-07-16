# Pixflow "Production OS" — Phase Zero: Current State Report

**Date:** 2026-07-16
**Author:** CTO/architecture pass (evidence-based audit, read-only)
**Repo:** `/Users/guysidi/gallery-flow` (branch `feat/pricing-page-storage-framing`, `main` is protected/PR-only)
**Scope of this doc:** Establish ground truth before any build. No code was changed to produce this.

---

## 1. Executive reality check

The "Production OS" brief asks to build **two products on shared infrastructure** — a photographer SaaS **and** a multi-tenant Production-company platform (orgs, roles, RBAC, brands, projects, central media library, collections, tender search, social workflow, approvals, reports, white-label, billing overhaul) — then QA and ship a release candidate.

Three facts from the real codebase and the team's own docs must reshape that plan:

1. **The foundation is single-tenant, not multi-tenant.** Every table is scoped by `businesses.user_id = auth.uid()`. There is **one business per user** and **no** organizations, members, roles, or permission model. True multi-tenancy + RBAC is a **foundational rewrite of the security model**, not a feature addition. (Evidence: RLS pattern below.)

2. **The Production-company product is already documented as FUTURE VISION, not MVP** — by the team itself. `docs/VISION_RETAINER_PLATFORM.md` scopes it as a Phases 1–6 roadmap; `PIXFLOW_PRICING_STRATEGY_2026-07.md` (dated today) states launch is **photographer-first in Israel** and production companies are a **secondary, later** audience. Building the Production platform now contradicts the current committed strategy.

3. **The photographer product itself is not safely launched yet.** The most recent QA report (`PIXFLOW_FULL_SITE_QA_REPORT_2026-07-11.md`) lists open **P0 cost/security blockers**: two public API endpoints (`api/capture-lead`, `api/submit-questionnaire`) send SMS/email with **no auth, rate-limit, or CAPTCHA** (open wallet-drain), checkout is untested end-to-end behind a flag, and the `/photographers` ad landing page isn't built.

**Conclusion:** The single most valuable, lowest-risk work right now is to **finish and harden the photographer product** and **lay Production foundations behind a feature flag** — not to big-bang a 15-agent multi-tenant rebuild on top of an unshipped, single-tenant base. Recommendation and options in §7.

---

## 2. Stack & architecture (as-built)

- **Web app** (`gallery-web/`): React 18 SPA on **Vite**, deployed on **Vercel**. SSR is limited to edge functions that pre-render OG/meta for bots; the app itself is a client-side SPA with a hand-rolled router (`main.tsx`). No component library — bespoke components on a token system in `src/theme.ts`. Hebrew-first, full RTL.
- **Desktop app** (`src/`): **Electron** photographer curation tool (~15k LOC). Local import, EXIF, duplicate detection, sections, top-picks, story rendering (FFmpeg), social composition, publish-to-cloud. **No direct AI**; all AI is web-side.
- **Backend**: **Supabase** is the entire backend — Postgres + Auth (Google OAuth) + Storage + Edge Functions. No separate API server; Vercel `/api/*` functions are thin (OG, form submit, ZIP, video render).
- **Payments**: **LemonSqueezy** (Stripe fully removed). Subscriptions + one-time gallery unlock, HMAC-verified webhook, idempotent.
- **AI**: web-only Anthropic Claude calls — caption generation, feed/campaign planning, image scoring (vision). **AWS Rekognition** for face search, server-side via edge function.

---

## 3. Database ground truth (34 tables, migrations 002→081)

- **Tenant model:** `businesses` (1 row per user) → `galleries` → `images`/`gallery_sections`. Plus `clients`, `vendors`, `events`, `questionnaires`, token economy (`business_tokens`, `token_ledger`, `monthly_usage`), face (`image_faces`), AI (`image_ai_scores`).
- **RLS isolation is single-owner:**
  ```sql
  -- representative pattern, repeated across every owned table
  CREATE POLICY galleries_owner_all ON galleries
    FOR ALL TO authenticated
    USING (business_id = current_business_id())      -- current_business_id() = businesses.id WHERE user_id = auth.uid()
    WITH CHECK (business_id = current_business_id());
  ```
- **What does NOT exist** (must be created for Production): `organizations`, `organization_members`, `roles`/permissions, `workspaces`, `brands`, `projects`, `collections`/`collection_items`, `saved_searches`, `tender_searches`, `social_posts`, `content_calendar`, `approvals`, `comments`, `activity_logs`, `feature_flags` (DB-level), `organization_modules`, plus any `account_status`/approval/invite/pilot model.
- **Billing model v2 (live in prod, migrations 075–078):** monthly token allowance that **resets** (use-it-or-lose-it) via `reset_subscription_tokens()`; one-time ₪590 gallery unlock (12-mo retention) via `mark_gallery_paid()`; paywall enforced in `gallery_get_images()`.

---

## 4. What already exists toward "Production" (partial / UI-only)

| Capability | State today | Files |
|---|---|---|
| Clients | Real table, but = event/couple end-clients, not org-clients | `clients` table, `ClientDashboard` |
| Vendors + tagging | Real, cloud-synced, many-to-many | `src/renderer/.../store/vendors.ts`, `vendors`/`image_vendor_tags` |
| Sections / top-picks | Real, cloud-synced | `gallery_sections`, `images.is_top_pick` |
| Tender builder | **UI-only**, exports PDF/ZIP, no DB objects | `components/TenderBuilder.tsx` |
| Social manager | **UI-only**, posts in localStorage, no integrations | `components/SocialManager.tsx`, `FeedStudio.tsx` |
| AI (captions/feed/scoring) | Real web APIs, Claude | `gallery-web/api/generate-*.ts`, `score-images.ts` |
| Feature flags | **ENV only** (`VITE_FEATURE_GALLERY_BILLING`, `VITE_FEATURE_NEW_IA`) — no per-account/DB flags | `Dashboard.tsx` |

So "Production" is ~20% scaffolded as disconnected UI experiments, 0% as a governed multi-tenant product.

---

## 5. Open P0/P1 from the team's own latest QA (must not be regressed or ignored)

- **P0** `api/capture-lead` — open SMS endpoint, no auth/rate-limit/CAPTCHA (cost drain).
- **P0** `api/submit-questionnaire` — same class of exposure (SMS + email).
- **P0** `/photographers` landing page not built (needed for paid Meta traffic).
- **P0/P1** Checkout untested end-to-end; `VITE_FEATURE_GALLERY_BILLING` OFF; risk LemonSqueezy variant prices (USD cents) ≠ DB ₪ prices — **needs verification**.
- **P1** No upload MIME/size validation; no server-side error tracking; flat 5k-image galleries crash mobile; several `getSession()`/loader paths lack `.catch`.

---

## 6. Decided constraints that must bind any new work

1. Face search = **always included, never metered** (the market wedge).
2. Prices in **₪ NIS**; let LemonSqueezy handle currency; verify variant↔plan mapping.
3. ₪590 one-time unlock = **two channels** (photographer buys / guest buys), **one** webhook path.
4. Multi-tenancy is a **future** capability; launch is single-business.
5. Production/retainer platform is **roadmap vision**, not MVP.
6. Do not turn on billing in prod until signup→auth→dashboard→upload→purchase is verified end-to-end.
7. Storage caps + monthly token reset not yet enforced (post-launch, not a blocker).
8. Primary audience = **event photographers in Israel**; couples/HR/production are later demand-gen.

---

## 7. Recommended path (for decision)

Building the full Production OS now is premature against the team's own strategy and would sit on an unshipped, single-tenant base. Three viable directions, in order of recommended priority:

- **Track A — Harden & ship the photographer product (recommended first).** Close the real P0s (lock down the two open SMS endpoints; build `/photographers`; verify checkout + price parity; add upload validation + error tracking). Directly unblocks revenue and paid traffic. ~1 focused sprint, one PR per surface, no schema risk.
- **Track B — Production foundations behind a flag.** Additive, non-breaking migration for `organizations` + `organization_members` + `roles` + a DB `feature_flags`/`organization_modules` layer, with a Production app shell gated to invite/admin-approved accounts. Real value, but large, and premature per §6.5 until A is done.
- **Track C — Consolidate the scattered Production experiments** (tender/social/AI) into one governed "Production" surface behind a flag, backed by real tables, without the full RBAC rewrite.

**CTO recommendation: A now, then B as a foundation, then C.** Do not run a 15-agent big-bang; sequence it, one PR per surface, stop-and-report per phase, never auto-deploy, never destructive SQL without preview.

---

## 8. Agent ownership map (when build starts)

| Surface | Owner agent | Base branch off `main` |
|---|---|---|
| Public SMS endpoints hardening | Backend/Security | `security/lock-public-form-endpoints` |
| `/photographers` landing + SSR meta | Web/Marketing | `feat/photographers-landing` |
| Checkout + price parity verification | Billing | `chore/verify-checkout-price-parity` |
| Upload validation + error tracking | Backend | `fix/upload-validation-sentry` |
| Org/roles/flags migration (additive) | Database | `feat/org-foundation-migration` |
| Production app shell (flagged) | Production FE | `feat/production-shell` |

No two agents touch the same file/table concurrently; DB migrations are serialized through one owner.
