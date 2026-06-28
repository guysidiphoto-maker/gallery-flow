# Payments Audit — Pixflow Launch Readiness

**Auditor role:** Payments Engineer (AUDIT ONLY — read-only, no prod changes, no deploys, no commits).
**Date:** 2026-06-29
**Prod project:** `vlyiqfawkrjvqcmkpfvs` · https://pixflow-ai.com
**Branch audited:** `security/blocker1-revoke-rpc-migration` (NOT main) + live prod edge functions + prod DB.
**prod-touched:** no (SELECT-only SQL; `get_edge_function`/`list_edge_functions` read-only).

---

## Executive Summary

Payments are **wired but inert**. The provider is LemonSqueezy. The only payment-related
edge function deployed to prod is `lemonsqueezy-webhook` (and it correctly verifies HMAC
signatures). The `create-checkout` function — which every "buy" button in the app depends
on — is **NOT deployed to prod**, so every checkout call resolves to `null` and produces a
benign error toast. No hosted checkout can be opened, so **no user can be charged today**.

Financial-integrity controls are sound:
- **Webhook signature verification is LIVE in prod** (HMAC-SHA256, constant-time compare,
  rejects missing/invalid signature with 400 before any DB write). A forged webhook
  **cannot** grant tokens or mark a gallery paid without `LEMONSQUEEZY_WEBHOOK_SECRET`.
- **`mark_gallery_paid`, `add_tokens`, `reset_subscription_tokens` are service_role-only**
  (`proacl = {postgres, service_role}` — no `anon`, no `authenticated`). Payment state
  **cannot** be spoofed by a client RPC.
- Prod DB is clean: 0 galleries `requires_payment`, 0 galleries `one_time_paid`, 0
  LemonSqueezy subscriptions. Nothing to regress.

Fails-closed. The buttons that exist degrade to an error toast rather than 404/500/charge.
The gallery paywall + Dashboard billing controls are behind `VITE_FEATURE_GALLERY_BILLING`
(default OFF).

### Outcome Verdict: **B — Payments safely disabled/deferred (fails closed)**

Not production-ready (A) — checkout is not deployed and the deployed webhook is an older
version with no gallery-unlock support. But NOT launch-blocking (C) — nothing charges
anyone, nothing grants free unlimited access, and forgery is blocked. Ship the launch with
payments deferred. The only recommended pre-launch polish is cosmetic (P2): the always-on
"Buy more tokens" button leads to a dead end (error toast). Either hide it behind the same
feature flag or swap it to "Contact us" so users don't hit a broken-feeling flow.

---

## 1. Payment Entry-Point Inventory (current deployed/branch code)

| # | Surface | File:line | Calls | Gated? | Reachable charge? |
|---|---------|-----------|-------|--------|-------------------|
| 1 | Sidebar "Buy more tokens" button → modal | `gallery-web/src/pages/Dashboard.tsx:2284` | opens modal | NO (always visible) | No — checkout not deployed |
| 2 | Buy-tokens modal tier buttons | `gallery-web/src/pages/Dashboard.tsx:6561-6571` | `startCheckout(planId)` | NO | No — returns null → error toast |
| 3 | StudioSettings "Buy more tokens" button | `gallery-web/src/pages/StudioSettings.tsx:746` | opens modal | NO | No |
| 4 | StudioSettings buy-tokens modal tiers | `gallery-web/src/pages/StudioSettings.tsx:803-810` | `startCheckout(planId)` | NO | No — null → `alert()` |
| 5 | Dashboard gallery "Unlock ₪590" + payment toggle | `gallery-web/src/pages/Dashboard.tsx:2871-2924` | toggle `requires_payment`; `startGalleryCheckout` | YES — `GALLERY_BILLING_ON` (`Dashboard.tsx:49`, default OFF) | No |
| 6 | Public gallery ₪590 paywall screen | `gallery-web/src/App.tsx:1646-1675` | `startGalleryCheckout(gallery.id)` | NO flag, but only renders if `gallery.requires_payment===true` (0 in prod; only settable via #5 which is flag-OFF) | No |
| 7 | `/pricing` page tier + ₪590 CTAs | `gallery-web/src/pages/PricingPage.tsx:116-120, 145` | `window.location.href = '/dashboard'` (marketing only) | n/a | No — no checkout call |
| 8 | LandingPage pricing section | `gallery-web/src/pages/LandingPage.tsx:780+` | scroll/anchor only | n/a | No |
| 9 | tokenClient checkout seam | `gallery-web/src/lib/tokenClient.ts:18-42` | `supabase.functions.invoke('create-checkout', …)` | n/a | No — function 404s |

Marketing/pricing surfaces (7, 8) never invoke checkout — they route to `/dashboard`. The
only functional checkout paths are 2/4 (subscription) and 5/6 (gallery unlock), all of which
dead-end because `create-checkout` is undeployed.

---

## 2. Checkout Flow Trace (end to end) — prior findings VERIFIED

button → `tokenClient.startCheckout/startGalleryCheckout`
  → `supabase.functions.invoke('create-checkout', {body})`
  → **create-checkout NOT FOUND in prod (404)** → invoke `error` set → returns `null`
  → UI shows error toast / alert. END. No LemonSqueezy call, no webhook, no DB write.

- **Prior finding "create-checkout not deployed": CONFIRMED.** `list_edge_functions` on
  prod returns only: `lemonsqueezy-webhook`, `rekognition`, `share-gallery`,
  `verify-custom-domain`, `backfill-public-thumbs`, `backfill-derivatives`. No
  `create-checkout`. The source exists at `supabase/functions/create-checkout/index.ts` but
  has never been deployed.
- **Prior finding "url vs checkoutUrl mismatch": NO LONGER PRESENT on this branch.** Local
  `create-checkout/index.ts:128,156` returns `{ checkoutUrl }`; `tokenClient.ts:26,41` reads
  `data.checkoutUrl`. They MATCH. (The mismatch was real in an earlier state; this branch
  fixed it.) No `billingCycle` is required by the current function either. So even if
  create-checkout were deployed, the field plumbing would work.

---

## 3. Webhook Security (the key financial-integrity question)

**File:** `supabase/functions/lemonsqueezy-webhook/index.ts` (local branch) — and the LIVE
deployed prod source was fetched via `get_edge_function` (version 6) and inspected directly.

**Signature verification: PRESENT and LIVE in prod.**
```
const signature = req.headers.get('x-signature')
if (!signature) return 400 'Missing signature'
const body = await req.text()
if (!verifySignature(body, signature)) return 400 'Invalid signature'
```
`verifySignature` = HMAC-SHA256 of the raw body keyed by `LEMONSQUEEZY_WEBHOOK_SECRET`,
compared to the `x-signature` header using a constant-time hex compare
(`timingSafeEqualHex`). All DB writes (`add_tokens` / `mark_gallery_paid` /
subscription updates) happen AFTER this gate.

**Can a forged webhook grant tokens / mark galleries paid for free? NO** — provided
`LEMONSQUEEZY_WEBHOOK_SECRET` is set to the real LemonSqueezy signing secret. An attacker
without the secret cannot produce a valid `x-signature`, so the request is rejected at 400
before any handler runs. `verify_jwt:false` on this function is CORRECT and expected —
LemonSqueezy cannot present a Supabase JWT; HMAC is the auth mechanism. This is the right
design.

**Residual verification item (cannot confirm from read-only MCP — secrets are masked):**
If `LEMONSQUEEZY_WEBHOOK_SECRET` were UNSET/empty in prod, `WEBHOOK_SECRET` would be
`undefined`/`""` and the HMAC key would be guessable, making forgery possible. This is a
deployment-config check, not a code defect. Since no checkout exists and no real charges
flow yet, it is not launch-blocking, but **must be verified before enabling live checkout**.

**Deployed vs branch drift (note, not a vuln):** Prod webdeployed version 6 is the OLDER
PR2 implementation — it uses `grantPlanTokens`/`add_tokens` with hardcoded variant IDs
(`1519997`→pro, `1520026`→business), treats `order_created` as a token top-up, and has NO
`gallery_unlock` / `mark_gallery_paid` / `reset_subscription_tokens` handling. The newer
gallery-unlock + monthly-reset webhook lives only in the branch and is NOT deployed.
Consequence: even if checkout were turned on, the gallery ₪590 flow would not be honored by
the live webhook. Reinforces verdict B — the pricing-v2 model is not actually live.

---

## 4. Risk Questions

- **Can a user accidentally pay?** No. No hosted checkout can open (create-checkout 404s).
- **Can a user hit 404/500 on a payment button?** They hit a silent 404 on the edge
  function invoke, which is caught and shown as an error toast/alert (Dashboard.tsx:6569,
  StudioSettings.tsx:809, App.tsx:1664). No white-screen, no unhandled 500. Mildly
  confusing UX (P2), not a crash.
- **Can a user get free unlimited paid access WITHOUT paying?**
  - Via client RPC spoof: **No** — `mark_gallery_paid`/`add_tokens`/`reset_subscription_tokens`
    are service_role-only (Section 5).
  - Via webhook forgery: **No** (Section 3), assuming the signing secret is set.
  - Via skipping the paywall UI: **No** — App.tsx:1639 notes enforcement is server-side
    (migrations 077/078 withhold images); the React screen is presentation only. And 0
    galleries are in the paid model in prod anyway.

---

## 5. RPC Lockdown Confirmation (prod, live)

`SELECT proname, prosecdef, proacl FROM pg_proc …` on prod:

| RPC | security_definer | proacl | anon/authenticated execute? |
|-----|------------------|--------|------------------------------|
| `add_tokens` | true | `{postgres=X/postgres, service_role=X/postgres}` | **NO** |
| `mark_gallery_paid` | true | `{postgres=X/postgres, service_role=X/postgres}` | **NO** |
| `reset_subscription_tokens` | true | `{postgres=X/postgres, service_role=X/postgres}` | **NO** |

CONFIRMED locked to `service_role`. The financial mutators are not client-callable. Matches
prior sprint's claim about `mark_gallery_paid`; also verified for `add_tokens` and
`reset_subscription_tokens`.

---

## Findings (classified)

### P2-1 — "Buy more tokens" button always visible but leads to a dead end
- **file:line:** `gallery-web/src/pages/Dashboard.tsx:2284` (button) + `:6561-6571` (modal CTAs); `gallery-web/src/pages/StudioSettings.tsx:746` + `:803-810`.
- **Impact:** UX. User clicks "buy tokens", picks a tier, gets an error toast/alert ("שגיאה בפתיחת תשלום"). Looks broken; can dent trust at launch.
- **Financial risk:** None (no charge possible).
- **Fix (RECOMMEND ONLY):** Gate the buy-tokens entry points behind a feature flag mirroring the existing `GALLERY_BILLING_ON` pattern, e.g. add `const TOKEN_BILLING_ON = import.meta.env.VITE_FEATURE_TOKEN_BILLING === 'true'` near `Dashboard.tsx:49` and wrap the buttons at `Dashboard.tsx:2284` / `StudioSettings.tsx:746` with `{TOKEN_BILLING_ON && (…)}`. Alternatively swap the CTA to a "Contact us" link. Default OFF until `create-checkout` is deployed AND the webhook is upgraded.
- **can-do-now:** yes (frontend-only, behind flag). **prod-touched:** no. **rollback:** flip flag / revert the wrap.

### P2-2 — Deployed prod webhook is the older PR2 version (no gallery-unlock / monthly-reset)
- **file:line:** prod `lemonsqueezy-webhook` v6 (deployed) vs `supabase/functions/lemonsqueezy-webhook/index.ts` (branch).
- **Impact:** If checkout is later enabled, the gallery ₪590 unlock and monthly allowance reset would NOT be honored by the live webhook (it only does cumulative `add_tokens`). Pricing-v2 is not actually live end-to-end.
- **Financial risk:** Low now (nothing flows). Would become a correctness/revenue issue at enable time.
- **Fix (RECOMMEND ONLY):** Before enabling payments, deploy the branch webhook + `create-checkout`, and set all `LEMONSQUEEZY_VARIANT_*` env vars. Out of scope for this audit (no deploys).
- **can-do-now:** no (deploy). **prod-touched:** no. **rollback:** redeploy prior version.

### P3-1 — Verify `LEMONSQUEEZY_WEBHOOK_SECRET` is set in prod before enabling checkout
- **file:line:** `lemonsqueezy-webhook/index.ts:19`.
- **Impact:** If unset, HMAC key is empty → webhook forgery → free tokens/paid galleries. Only matters once payments are live.
- **Financial risk:** High IF unset AND checkout enabled; currently moot (no checkout).
- **Fix (RECOMMEND ONLY):** Confirm the secret is configured (Supabase function secrets) and matches the LemonSqueezy store signing secret as part of the payment go-live checklist. Cannot verify via read-only MCP (secret values masked).
- **can-do-now:** no (config verification). **prod-touched:** no. **rollback:** n/a.

### P3-2 — `startGalleryCheckout` / create-checkout gallery branch is unauthenticated by design
- **file:line:** `supabase/functions/create-checkout/index.ts:108-129` (resolves business from gallery, no auth required); `tokenClient.ts:33`.
- **Impact:** When deployed, anyone who knows a gallery UUID could open a checkout for it. This only lets them PAY (charging themselves), and the webhook marks the gallery paid — i.e., a stranger could gift-pay someone's gallery. No free access, no charge to the owner. Intentional per the code comments (couple pays directly). Noted for awareness.
- **Financial risk:** None adverse (the payer is charged, not victimized).
- **Fix:** None required; document the intent. Optionally rate-limit checkout creation.
- **can-do-now:** n/a. **prod-touched:** no. **rollback:** n/a.

---

## Go-Live Checklist (for WHEN payments are turned on — not part of this launch)
1. Deploy branch `lemonsqueezy-webhook` (gallery-unlock + monthly-reset) and `create-checkout`.
2. Set env: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_VARIANT_PRO/_BUSINESS/_AGENCY/_GALLERY`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `PUBLIC_SITE_URL`.
3. Confirm `LEMONSQUEEZY_WEBHOOK_SECRET` matches the store signing secret (P3-1).
4. Register the webhook URL in LemonSqueezy for all subscribed events.
5. Flip `VITE_FEATURE_GALLERY_BILLING=true` and the new token-billing flag (P2-1).
6. Test with a real low-value purchase end to end (subscription + gallery unlock).
