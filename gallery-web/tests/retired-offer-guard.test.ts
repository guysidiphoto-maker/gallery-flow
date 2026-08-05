// retired-offer-guard.test.ts — offline source-scan guard proving the
// PERMANENTLY RETIRED $150 one-time gallery offer never returns to the public
// marketing surfaces, and that no unhedged public face-recognition accuracy
// claim ("99%") creeps back in. Run:
//   npx tsx tests/retired-offer-guard.test.ts
//
// Founder decisions this guard enforces:
//   1. The $150 (and ₪150 / ₪590) one-time "pay per gallery" offer is retired
//      and must NOT be advertised on the public site.
//   2. NO public "99%" face-recognition accuracy claim, in any form.
//
// Scope note: this scans MARKETING files only. The dormant billing wiring in
// src/pages/Dashboard.tsx, src/lib/tokenClient.ts and App.tsx is intentionally
// NOT scanned — that surface is handled on another branch.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

// The five public marketing files the retired offer used to live in.
const MARKETING_FILES = [
  'src/components/landing3d/HomepagePricing.tsx',
  'src/components/landing3d/ScrollStorySection.tsx',
  'src/pages/LandingPageHe.tsx',
  'src/pages/PhotographersLanding.tsx',
  'src/pages/PricingPage.tsx',
]

// Markers that indicate the retired one-time offer is being advertised again.
// Kept intentionally specific so legitimate numbers (e.g. clamp(...150px),
// linear-gradient(150deg,...)) do NOT trip the guard.
const RETIRED_OFFER_MARKERS = [
  '$150',
  '₪150',
  '₪590',
  'תשלום חד-פעמי',
  'תשלום חד־פעמי',
  'חד-פעמית',
  'חד־פעמית',
  'one-time',
  'pay-per-gallery',
]

// The public 99% accuracy claim is retired in every form.
const ACCURACY_CLAIM_MARKERS = ['99%', '99 אחוז', 'עד 99', 'כ־99', 'כ-99']

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

for (const rel of MARKETING_FILES) {
  const src = readFileSync(join(ROOT, rel), 'utf8')

  for (const marker of RETIRED_OFFER_MARKERS) {
    ok(
      `${rel} has no retired-offer marker "${marker}"`,
      !src.includes(marker),
      `found "${marker}" — the retired $150 one-time offer must not be advertised`,
    )
  }

  for (const marker of ACCURACY_CLAIM_MARKERS) {
    ok(
      `${rel} has no public accuracy claim "${marker}"`,
      !src.includes(marker),
      `found "${marker}" — no public 99% face-recognition accuracy claim is allowed`,
    )
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
