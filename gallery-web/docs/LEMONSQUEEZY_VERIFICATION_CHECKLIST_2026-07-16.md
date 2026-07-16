# LemonSqueezy Verification Checklist — Track A launch gate

**Date:** 2026-07-16
**Purpose:** Confirm what a customer is actually charged matches what we display, and that every layer (website copy → DB → env vars → webhook → live LemonSqueezy variant) agrees. Nothing here changes code.

> **How to read this doc:** Section A = facts *verified from the repository* (no action, just context). Section B = the intended pricing direction. Section C = the mismatches found (these need decisions). Section D = the manual checkbox checklist you complete in the LemonSqueezy dashboard.

---

## A. Facts verified from the repository (2026-07-16)

- **Checkout sends only a variant ID, never a price.** `supabase/functions/create-checkout/index.ts` posts `variant: { id }` — the charged amount is 100% whatever the LemonSqueezy variant is set to. The repo cannot determine or control the price.
- **The DB `plans.price_monthly_cents` / `price_annual_cents` are read NOWHERE** in `gallery-web/src` or `api`. They are vestigial. Current values: pro `1900`, business `3900`, agency `9400` (i.e. $19/$39/$94). **Do not use these to reason about ₪ pricing.** (Per instruction: not modifying them now.)
- **Displayed prices are hardcoded in the frontend** (two places, must stay in sync):
  - `gallery-web/src/pages/PricingPage.tsx`
  - `gallery-web/src/components/landing3d/HomepagePricing.tsx`
  - Current copy in both: `pro / מקצועי / ₪79`, `business / עסקי / ₪159`, `agency / סוכנות / ₪349`, one-time gallery `₪590`, free tier "100 תמונות חינם, no credit card".
- **`plans.token_count` IS live** (monthly allowance reset by the webhook on payment): starter `100`, pro `2000`, business `10000`, agency `30000`.
- **Plan IDs in code/DB are:** `starter`, `pro`, `business`, `agency`. There is **no** `solo` / `studio` / `production` / `trial` plan id anywhere.
- **Webhook maps variant→plan from env vars only**, with a silent fallback (see §C-7):
  `supabase/functions/lemonsqueezy-webhook/index.ts` → `const planId = VARIANT_TO_PLAN[variantId] || custom.plan_id || 'pro'`.

### Environment variables the billing flow requires

| Env var | Used by | Purpose |
|---|---|---|
| `LEMONSQUEEZY_API_KEY` | create-checkout | Auth to LemonSqueezy API |
| `LEMONSQUEEZY_STORE_ID` | create-checkout | Store the checkout belongs to |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | lemonsqueezy-webhook | HMAC signature verification |
| `LEMONSQUEEZY_VARIANT_PRO` | checkout + webhook | Variant id ⇄ plan `pro` |
| `LEMONSQUEEZY_VARIANT_BUSINESS` | checkout + webhook | Variant id ⇄ plan `business` |
| `LEMONSQUEEZY_VARIANT_AGENCY` | checkout + webhook | Variant id ⇄ plan `agency` |
| `LEMONSQUEEZY_VARIANT_GALLERY` | checkout + webhook | Variant id for the ₪590 one-time gallery unlock |
| `PUBLIC_SITE_URL` | create-checkout | Post-checkout redirect target |
| `VITE_FEATURE_GALLERY_BILLING` | Dashboard (frontend) | Must be `1` to show any billing/buy UI (currently OFF) |

> These must be present in **Supabase Edge Function secrets** (webhook + create-checkout run there). `VITE_FEATURE_GALLERY_BILLING` is a **Vercel build-time** var for the frontend.

### Expected variant → plan mapping (as the code expects it today)

| LemonSqueezy variant (env) | Resolves to plan id | Monthly token allowance | Displayed name |
|---|---|---|---|
| `LEMONSQUEEZY_VARIANT_PRO` | `pro` | 2000 | מקצועי |
| `LEMONSQUEEZY_VARIANT_BUSINESS` | `business` | 10000 | עסקי |
| `LEMONSQUEEZY_VARIANT_AGENCY` | `agency` | 30000 | סוכנות |
| `LEMONSQUEEZY_VARIANT_GALLERY` | (one-time unlock) | n/a | ₪590 gallery |

---

## B. Intended pricing direction (provided 2026-07-16)

| Tier | Intended price | Self-service? |
|---|---|---|
| Solo | ₪99 / mo | yes |
| Pro | ₪199 / mo | yes |
| Studio | ₪449 / mo | yes |
| Production | — | **no** (sales-led, not self-service yet) |
| Trial | verify current implementation before changing | — |

---

## C. Mismatches found — DECISIONS NEEDED (do not assume anything is wired)

> ⚠️ **Headline: the intended direction (B) is reflected in ZERO layers.** Names, prices, and tier structure all differ. "Verifying LemonSqueezy" cannot make these agree — a pricing decision + code/DB/variant changes are required first. This is a launch prerequisite, separate from the two security/upload branches.

1. **Plan names disagree.** Intended `Solo / Pro / Studio` vs code `pro / business / agency` (`מקצועי / עסקי / סוכנות`). Note "Pro" exists in both **but at different prices** (intended ₪199 vs current `pro`=₪79) — a dangerous collision if half-migrated.
2. **Prices disagree three ways.** Intended `99 / 199 / 449` vs website `79 / 159 / 349` vs DB `$19 / $39 / $94`. **No two layers match.**
3. **Tier structure disagrees.** Intended = Solo/Pro/Studio (+ Trial, + sales-led Production). Code = free `starter` + `pro` + `business` + `agency`.
4. **"Production not self-service" is contradicted by code.** The current top tier `agency` is tagged *"לחברות הפקה"* (for production companies) and **is** a self-service checkout. Intended direction says Production must NOT be self-service.
5. **"Trial" is undefined in code.** There is no trial plan. The free experience is the `starter` plan (100 photos, no credit card). `subscriptions.status` can be `'trial'` but nothing sets/uses it. Decide what "Trial" means before wiring it.
6. **DB price columns are misleading.** `price_monthly_cents` ($19/$39/$94) contradicts the ₪ display and the intended ₪ prices. Harmless (read nowhere) but should eventually be corrected or removed. (Not touching now, per instruction.)
7. **Webhook silent-default risk.** `planId = VARIANT_TO_PLAN[variantId] || custom.plan_id || 'pro'`. If a variant id is unmapped (env missing/typo), a paying customer is **silently provisioned as `pro`** (2000 tokens) regardless of what they bought. Env vars must be exactly correct, or entitlements are wrong with no error.

---

## D. Manual dashboard checklist (LemonSqueezy) — complete before enabling billing

**Step 0 — Decide the price set first (blocks everything below):**
- [ ] Confirm launch prices: **either** keep current code (`₪79/159/349`, names מקצועי/עסקי/סוכנות) **or** migrate to intended (`Solo ₪99 / Pro ₪199 / Studio ₪449`). If intended, a code+DB+variant change is required (not just this checklist).

**Store & currency:**
- [ ] Store currency is **ILS (₪)** so customers are charged shekels, not dollars.

**Variants (per the price set chosen in Step 0):**
- [ ] Pro variant price == displayed Pro price
- [ ] Business/Studio variant price == displayed price
- [ ] Agency variant price == displayed price (or removed if Production goes sales-led)
- [ ] Annual variants (if the annual toggle is shown) priced correctly
- [ ] Gallery one-time variant == **₪590**

**Env wiring (Supabase Edge Function secrets):**
- [ ] `LEMONSQUEEZY_VARIANT_PRO` = the exact variant id of the Pro product
- [ ] `LEMONSQUEEZY_VARIANT_BUSINESS` = variant id of the Business/Studio product
- [ ] `LEMONSQUEEZY_VARIANT_AGENCY` = variant id of the Agency product (or unset if retired)
- [ ] `LEMONSQUEEZY_VARIANT_GALLERY` = variant id of the ₪590 gallery unlock
- [ ] `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET` all set
- [ ] `PUBLIC_SITE_URL` set to the production site
- [ ] Cross-check: every configured variant id resolves to the INTENDED plan (guards against the §C-7 silent `pro` fallback)

**Frontend flag (Vercel):**
- [ ] `VITE_FEATURE_GALLERY_BILLING=1` (only when going live; currently OFF)

**Webhook registration:**
- [ ] Webhook URL registered in LemonSqueezy points at the deployed `lemonsqueezy-webhook` function
- [ ] Signing secret matches `LEMONSQUEEZY_WEBHOOK_SECRET`

**End-to-end test (LemonSqueezy test mode):**
- [ ] New signup → checkout opens with correct ₪ price
- [ ] Test payment succeeds
- [ ] Webhook fires → `subscriptions` row created with the **correct** plan id
- [ ] `reset_subscription_tokens` runs → token balance == the plan's `token_count`
- [ ] Dashboard reflects the purchased plan + balance
- [ ] Cancel → downgrades to `starter` as expected
- [ ] One-time ₪590 gallery unlock → gallery unlocks, 12-month retention set

---

**Sign-off:** Track A billing is verified only when Step 0 is decided, every box above is checked, and the end-to-end test passes in production with real variants.
