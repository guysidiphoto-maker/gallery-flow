// tender.test.ts — offline proofs for the tender library helpers.
//   npx tsx tests/tender.test.ts
//
// Covers (per the overnight task):
//   1. metadata validation of the update_gallery_metadata action
//      (enum rejection, length caps, null=Unclassified, keywords rules)
//   2. gallery-in-business fail-closed (mock pattern from cpv2-clientadmin.test.ts)
//   3. match-reason computation (honest: which filters matched, no scores)
//   4. collection item dedupe + presence helpers
//   5. plain-text export formatter

import {
  validateGalleryMetadataPatch, galleryBelongsToBusiness,
  computeMatchReasons, dedupeCollectionItems, hasCollectionItem,
  METADATA_LIMITS, type GalleryDbLike,
} from '../src/components/tender/metadata.js'
import { formatCollectionExport } from '../src/components/tender/collections.js'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// mock supabase slice (same shape as cpv2-clientadmin.test.ts)
function makeDb(row: { id?: string; client_id?: string | null } | null): GalleryDbLike {
  const builder: any = {
    select: () => builder, eq: () => builder,
    maybeSingle: async () => ({ data: row }),
  }
  return { from: () => builder } as GalleryDbLike
}

async function run() {
  // ── 1. validateGalleryMetadataPatch ────────────────────────────────────────
  {
    const r = validateGalleryMetadataPatch({
      event_size_bucket: 'medium', industry: ' הייטק ', venue_type: 'indoor',
      time_of_day: 'night', event_keywords: ['כנס', ' כנס ', 'tech'],
      event_location: 'תל אביב', event_date: '2026-05-14',
    })
    ok('valid full patch accepted', r.ok === true)
    if (r.ok) {
      ok('industry trimmed', r.patch.industry === 'הייטק')
      ok('keywords deduped after trim', Array.isArray(r.patch.event_keywords) && r.patch.event_keywords.length === 2)
      ok('fields list reported', r.fields.includes('event_size_bucket') && r.fields.includes('event_keywords'))
    }
  }
  {
    const r = validateGalleryMetadataPatch({ event_size_bucket: 'gigantic' })
    ok('enum rejection: bad size bucket', r.ok === false && !r.ok && r.error === 'event_size_bucket_invalid')
  }
  {
    const r = validateGalleryMetadataPatch({ venue_type: 'underwater' })
    ok('enum rejection: bad venue_type', r.ok === false && !r.ok && r.error === 'venue_type_invalid')
  }
  {
    const r = validateGalleryMetadataPatch({ time_of_day: 'dawn' })
    ok('enum rejection: bad time_of_day', r.ok === false && !r.ok && r.error === 'time_of_day_invalid')
  }
  {
    const r = validateGalleryMetadataPatch({ industry: 'x'.repeat(METADATA_LIMITS.industry + 1) })
    ok('length cap: industry > 60 rejected', r.ok === false && !r.ok && r.error === 'industry_too_long')
  }
  {
    const r = validateGalleryMetadataPatch({ event_location: 'x'.repeat(121) })
    ok('length cap: event_location > 120 rejected', r.ok === false && !r.ok && r.error === 'event_location_too_long')
  }
  {
    const r = validateGalleryMetadataPatch({ event_type: 'x'.repeat(61) })
    ok('length cap: event_type > 60 rejected', r.ok === false && !r.ok && r.error === 'event_type_too_long')
  }
  {
    const r = validateGalleryMetadataPatch({ event_keywords: Array.from({ length: 21 }, (_, i) => `k${i}`) })
    ok('keywords: > 20 rejected', r.ok === false && !r.ok && r.error === 'too_many_keywords')
  }
  {
    const r = validateGalleryMetadataPatch({ event_keywords: ['x'.repeat(41)] })
    ok('keywords: single keyword > 40 rejected', r.ok === false && !r.ok && r.error === 'keyword_too_long')
  }
  {
    const r = validateGalleryMetadataPatch({ event_keywords: 'not-an-array' })
    ok('keywords: non-array rejected', r.ok === false && !r.ok && r.error === 'event_keywords_invalid')
  }
  {
    const r = validateGalleryMetadataPatch({ event_date: '14/05/2026' })
    ok('date: non ISO rejected', r.ok === false && !r.ok && r.error === 'event_date_invalid')
  }
  {
    const r = validateGalleryMetadataPatch({ event_date: '2026-02-30' })
    ok('date: impossible calendar date rejected', r.ok === false && !r.ok && r.error === 'event_date_invalid')
  }
  {
    const r = validateGalleryMetadataPatch({ event_size_bucket: null, industry: '' })
    ok('null / empty clears back to Unclassified', r.ok === true
      && r.ok && r.patch.event_size_bucket === null && r.patch.industry === null)
  }
  {
    const r = validateGalleryMetadataPatch({ action: 'update_gallery_metadata', galleryId: 'g1' })
    ok('no recognized fields → rejected (no_fields)', r.ok === false && !r.ok && r.error === 'no_fields')
  }
  {
    const r = validateGalleryMetadataPatch({ event_size_bucket: 'large', bogus_column: 'DROP TABLE' })
    ok('unknown keys ignored, never forwarded', r.ok === true && r.ok
      && !('bogus_column' in r.patch) && r.fields.length === 1)
  }

  // ── 2. galleryBelongsToBusiness fail-closed ────────────────────────────────
  {
    const hit = await galleryBelongsToBusiness(makeDb({ id: 'g1', client_id: 'c9' }), 'g1', 'bizA')
    ok('gallery in business → belongs + clientId', hit.belongs === true && hit.clientId === 'c9')
  }
  {
    const miss = await galleryBelongsToBusiness(makeDb(null), 'gX', 'bizA')
    ok('gallery NOT in business → fail closed', miss.belongs === false && miss.clientId === null)
  }
  {
    const weird = await galleryBelongsToBusiness(makeDb({ client_id: 'c9' }), 'g1', 'bizA')
    ok('row without id → fail closed', weird.belongs === false)
  }

  // ── 3. computeMatchReasons ─────────────────────────────────────────────────
  {
    const g = {
      name: 'כנס הייטק 2025', client_name: 'Wix', client_id: 'c1',
      event_type: 'conference', event_location: 'תל אביב', event_date: '2025-06-01',
      event_size_bucket: 'large', industry: 'הייטק', venue_type: 'indoor',
      time_of_day: 'day', event_keywords: ['במה', 'קהל'],
    }
    const reasons = computeMatchReasons(g, {
      event_type: 'conference', event_size_bucket: 'large', industry: 'הייטק',
      client_id: 'c1', location: 'תל אביב', venue_type: 'indoor', time_of_day: 'day',
      year_from: 2024, year_to: 2026, keywords: ['קהל'],
    }, 'הייטק')
    ok('all matching filters reported', ['event_type', 'event_size_bucket', 'industry', 'client',
      'event_location', 'venue_type', 'time_of_day', 'year', 'keywords', 'name']
      .every(k => reasons.includes(k)), JSON.stringify(reasons))
    ok('reasons deduped', new Set(reasons).size === reasons.length)
  }
  {
    const g = { name: 'חתונה', event_type: 'other', event_size_bucket: 'small' }
    const reasons = computeMatchReasons(g, { event_type: 'conference', event_size_bucket: 'large' }, '')
    ok('non-matching filters yield NO reasons (no invented matches)', reasons.length === 0)
  }
  {
    const g = { event_date: '2020-01-01' }
    const reasons = computeMatchReasons(g, { year_from: 2024 }, '')
    ok('year outside range → no year reason', !reasons.includes('year'))
  }

  // ── 4. dedupeCollectionItems + hasCollectionItem ───────────────────────────
  {
    const items = [
      { gallery_id: 'g1', image_id: null },
      { gallery_id: 'g1', image_id: null },          // dup whole-gallery
      { gallery_id: 'g1', image_id: 'i1' },
      { gallery_id: 'g1', image_id: 'i1' },          // dup image
      { gallery_id: 'g2', image_id: null },
      { gallery_id: 'g2', image_id: 'i1' },          // same image id, other gallery → kept
    ]
    const out = dedupeCollectionItems(items)
    ok('dedupe: whole-gallery + image dups removed', out.length === 4, `got ${out.length}`)
    ok('dedupe keeps first occurrence order', out[0].gallery_id === 'g1' && out[0].image_id === null)
    ok('hasCollectionItem gallery-level', hasCollectionItem(out, 'g1', null) === true)
    ok('hasCollectionItem image-level', hasCollectionItem(out, 'g2', 'i1') === true)
    ok('hasCollectionItem miss', hasCollectionItem(out, 'g3', null) === false)
  }

  // ── 5. formatCollectionExport ──────────────────────────────────────────────
  {
    const text = formatCollectionExport('מכרז עירייה', [
      { galleryName: 'כנס 2025', clientName: 'Wix', wholeGallery: true, filenames: ['a.jpg'] },
      { galleryName: 'נופש', clientName: null, wholeGallery: false, filenames: ['b.jpg', 'c.jpg'] },
    ])
    ok('export contains collection name', text.startsWith('מכרז עירייה'))
    ok('export shows client provenance', text.includes('כנס 2025 (Wix)'))
    ok('export marks whole gallery', text.includes('* whole gallery'))
    ok('export lists filenames', text.includes('  - b.jpg') && text.includes('  - c.jpg'))
    ok('gallery without client has no parens', text.includes('\nנופש\n'))
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
void run()
