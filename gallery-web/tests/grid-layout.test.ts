// grid-layout.test.ts — proves the Design → Grid controls actually take effect
// (they previously "saved" but changed nothing on desktop):
//   1. gridSpacing is now accepted by the write validator (was silently dropped).
//   2. thumbnailSize + gridSpacing resolve to a real, DIFFERENT layout/gap.
//   3. Legacy galleries (no Design-tab keys) keep their exact appearance.
// Run:  npx tsx tests/grid-layout.test.ts

import { validateDeliverySettingsPatch } from '../src/lib/deliverySettingsSchema.ts'
import { resolveGridLayout, gapForSpacing } from '../src/lib/galleryLayout.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// ── 1. Persistence: gridSpacing is now a valid, allow-listed write ───────────
{
  ok('gridSpacing="large" passes client validation (was rejected → never saved)',
    validateDeliverySettingsPatch({ gridSpacing: 'large' }).ok === true)
  ok('gridSpacing="regular" passes client validation',
    validateDeliverySettingsPatch({ gridSpacing: 'regular' }).ok === true)
  const bogus = validateDeliverySettingsPatch({ gridSpacing: 'huge' })
  ok('gridSpacing="huge" is rejected (bounded enum)', bogus.ok === false)
}

// ── 2. The controls produce a real, visible difference ───────────────────────
{
  const regular = resolveGridLayout({ thumbnailSize: 'regular', gridSpacing: 'regular' })
  const large   = resolveGridLayout({ thumbnailSize: 'large',   gridSpacing: 'large' })
  ok('thumbnailSize changes the column mode (regular=3-col vs large=2-col)',
    regular.layoutMode === '3-col' && large.layoutMode === '2-col')
  ok('gridSpacing changes the spacing tier (regular=small vs large=wide)',
    regular.imageSpacing === 'small' && large.imageSpacing === 'wide')
  ok('the pixel gap is meaningfully different (4px vs 22px), not a near-tie',
    gapForSpacing(regular.imageSpacing) === 4 && gapForSpacing(large.imageSpacing) === 22)
}

// ── 3. Backward compatibility: legacy galleries unchanged ────────────────────
{
  // No Design-tab keys at all → falls back to the documented defaults.
  const empty = resolveGridLayout({})
  ok('empty settings → default 2-col / small (unchanged behavior)',
    empty.layoutMode === '2-col' && empty.imageSpacing === 'small')
  // Legacy explicit layoutMode/imageSpacing keep working when no Design keys.
  const legacy = resolveGridLayout({ layoutMode: '1-col', imageSpacing: 'medium' })
  ok('legacy layoutMode/imageSpacing still honored',
    legacy.layoutMode === '1-col' && legacy.imageSpacing === 'medium')
  ok('legacy medium gap = 10px', gapForSpacing('medium') === 10)
  // Design-tab keys win over legacy keys when both present.
  const both = resolveGridLayout({ layoutMode: '1-col', thumbnailSize: 'regular', gridSpacing: 'large' })
  ok('Design-tab keys override legacy layoutMode',
    both.layoutMode === '3-col' && both.imageSpacing === 'wide')
}

// ── 4. Feed mode override (mobile single column) still wins ───────────────────
{
  const feed = resolveGridLayout({ thumbnailSize: 'large', gridSpacing: 'large' }, true)
  ok('feed mode forces 1-col / none regardless of grid keys',
    feed.layoutMode === '1-col' && feed.imageSpacing === 'none')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
