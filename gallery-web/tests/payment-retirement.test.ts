// payment-retirement.test.ts — regression guard for retiring the one-time
// "$150 gallery unlock" client-payment feature while KEEPING subscription
// billing intact. The moving parts live in Deno edge functions, a SQL
// migration, and the frontend, so this asserts against their source (no DOM /
// no Deno runtime needed). Run:  npx tsx tests/payment-retirement.test.ts
//
// It proves, in one place, the two halves of the change:
//   (A) the gallery-unlock payment path is gone everywhere, and
//   (B) subscription checkout + the token economy are untouched.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..') // repo root (gallery-flow)
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// ── create-checkout edge function ────────────────────────────────────────────
{
  const s = read('supabase/functions/create-checkout/index.ts')
  ok('create-checkout refuses a bare galleryId (410, no session)',
    /galleryId && !planId/.test(s) && /gallery_unlock_retired/.test(s) && /410/.test(s))
  ok('create-checkout no longer creates a gallery-unlock checkout',
    !/purpose:\s*'gallery_unlock'/.test(s))
  ok('create-checkout no longer references the gallery variant env',
    !/LEMONSQUEEZY_VARIANT_GALLERY/.test(s) && !/GALLERY_VARIANT/.test(s))
  ok('create-checkout KEEPS subscription checkout (planId → PLAN_VARIANT)',
    /PLAN_VARIANT/.test(s) && /createLsCheckout/.test(s) && /invalid_plan/.test(s))
}

// ── lemonsqueezy-webhook edge function ───────────────────────────────────────
{
  const s = read('supabase/functions/lemonsqueezy-webhook/index.ts')
  ok('webhook never marks a gallery paid',
    !/mark_gallery_paid/.test(s.replace(/\/\/[^\n]*/g, '')) /* ignore comments */)
  ok('webhook has no gallery_unlock order handler',
    !/order_created:/.test(s.replace(/\/\/[^\n]*/g, '')))
  ok('webhook KEEPS subscription events + allowance reset',
    /subscription_created/.test(s) && /subscription_payment_success/.test(s)
    && /reset_subscription_tokens/.test(s) && /subscription_cancelled/.test(s))
}

// ── SQL: paywall gate neutralized non-destructively ──────────────────────────
{
  const s = read('supabase/migrations/104_retire_gallery_paywall.sql')
  ok('migration 104 redefines gallery_is_locked to always return false',
    /CREATE OR REPLACE FUNCTION gallery_is_locked/.test(s) && /SELECT false;/.test(s))
  ok('migration 104 is non-destructive (no DROP COLUMN / DROP FUNCTION)',
    !/DROP\s+COLUMN/i.test(s) && !/DROP\s+FUNCTION/i.test(s) && !/DELETE\s+FROM/i.test(s))
}

// ── Frontend: no gallery-payment surfaces, subscription client kept ──────────
{
  const token = read('gallery-web/src/lib/tokenClient.ts')
  ok('tokenClient still exports subscription startCheckout',
    /export async function startCheckout/.test(token))
  ok('tokenClient no longer exports startGalleryCheckout',
    !/export async function startGalleryCheckout/.test(token))
  ok('tokenClient no longer exports GALLERY_UNLOCK_PRICE_ILS',
    !/GALLERY_UNLOCK_PRICE_ILS/.test(token))
  ok('tokenClient keeps the token packages (subscription tiers)',
    /TOKEN_PACKAGES/.test(token))

  const app = read('gallery-web/src/App.tsx')
  ok('public viewer has no paywall / gallery-checkout code',
    !/startGalleryCheckout/.test(app) && !/requires_payment === true/.test(app))

  const dash = read('gallery-web/src/pages/Dashboard.tsx')
  ok('dashboard has no client-payment toggle / buy button',
    !/startGalleryCheckout/.test(dash) && !/GALLERY_BILLING_ON/.test(dash.replace(/\/\/[^\n]*/g, '')))
}

// ── Marketing surfaces: the "$150 one-time gallery" offer is gone everywhere ─
// (Browser QA found it lingering on the 3D homepage + photographers landing
// after the first pass — this sweep makes that class of miss impossible.)
{
  const marketing = [
    'gallery-web/src/pages/PricingPage.tsx',
    'gallery-web/src/pages/LandingPageHe.tsx',
    'gallery-web/src/pages/PhotographersLanding.tsx',
    'gallery-web/src/components/landing3d/HomepagePricing.tsx',
  ]
  for (const f of marketing) {
    const body = read(f).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
    const hasOffer = /\$150/.test(body) || /שלמו? פעם אחת/.test(body)
      || /רק גלריה אחת/.test(body) || /תשלום חד-פעמי/.test(body)
    ok(`${f.split('/').pop()} shows no $150 one-time-gallery offer`, !hasOffer)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
