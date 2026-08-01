// search.test.ts — offline proofs for the Global Search pure helpers.
//   npx tsx tests/search.test.ts
//
// No live DB, no React: exercises the exact logic GlobalSearch.tsx runs —
// filter → jsonb payload building, the 300ms debounce, the stale-response
// sequence guard (the AbortController substitute for supabase.rpc) and the
// match-reason → string-key mapping.

import {
  EMPTY_FILTER_STATE, EMPTY_RESULT,
  buildFilterPayload, createDebouncer, createSequenceGuard,
  hasActiveFilters, isEmptyResult, matchReasonStringKey,
  normalizeSearchResult, parseKeywords, shouldSearch,
} from '../src/components/search/searchLogic.js'
import type { SearchFilterState } from '../src/components/search/searchLogic.js'
import { STRINGS, t, dirFor } from '../src/components/search/strings.js'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function run() {
  // ── buildFilterPayload ────────────────────────────────────────────────────
  {
    ok('empty state → empty payload',
      Object.keys(buildFilterPayload(EMPTY_FILTER_STATE)).length === 0)
    ok('empty state → no active filters',
      !hasActiveFilters(buildFilterPayload(EMPTY_FILTER_STATE)))

    const full: SearchFilterState = {
      clientId: ' 11111111-2222-3333-4444-555555555555 ',
      status: 'live',
      assigned: 'yes',
      eventType: '  חתונה  ',
      eventSizeBucket: 'large',
      industry: 'הייטק',
      venueType: 'outdoor',
      timeOfDay: 'night',
      yearFrom: '2024',
      yearTo: '2026',
      keywords: ' דנה, חוף,  , דנה , sunset ',
      importedSource: 'pixieset',
    }
    const p = buildFilterPayload(full)
    ok('client_id trimmed', p.client_id === '11111111-2222-3333-4444-555555555555')
    ok('status passthrough', p.status === 'live')
    ok('assigned yes → true', p.assigned === true)
    ok('event_type trimmed', p.event_type === 'חתונה')
    ok('size bucket', p.event_size_bucket === 'large')
    ok('industry', p.industry === 'הייטק')
    ok('venue', p.venue_type === 'outdoor')
    ok('time', p.time_of_day === 'night')
    ok('year_from numeric', p.year_from === 2024)
    ok('year_to numeric', p.year_to === 2026)
    ok('keywords split+trim+dedupe',
      JSON.stringify(p.keywords) === JSON.stringify(['דנה', 'חוף', 'sunset']))
    ok('imported_source', p.imported_source === 'pixieset')

    const assignedNo = buildFilterPayload({ ...EMPTY_FILTER_STATE, assigned: 'no' })
    ok('assigned no → false', assignedNo.assigned === false)
    const assignedAll = buildFilterPayload({ ...EMPTY_FILTER_STATE, assigned: 'all' })
    ok('assigned all → omitted', !('assigned' in assignedAll))

    const badYear = buildFilterPayload({ ...EMPTY_FILTER_STATE, yearFrom: '24', yearTo: 'abcd' })
    ok('malformed years dropped', !('year_from' in badYear) && !('year_to' in badYear))

    const longType = buildFilterPayload({ ...EMPTY_FILTER_STATE, eventType: 'x'.repeat(90) })
    ok('event_type capped at 60', longType.event_type?.length === 60)

    const wsOnly = buildFilterPayload({ ...EMPTY_FILTER_STATE, eventType: '   ', industry: ' ' })
    ok('whitespace-only text dropped', Object.keys(wsOnly).length === 0)
  }

  // ── parseKeywords ─────────────────────────────────────────────────────────
  {
    ok('parseKeywords empty', parseKeywords('').length === 0)
    ok('parseKeywords commas only', parseKeywords(' , ,, ').length === 0)
    ok('parseKeywords order preserved',
      JSON.stringify(parseKeywords('b, a, b')) === JSON.stringify(['b', 'a']))
  }

  // ── shouldSearch ──────────────────────────────────────────────────────────
  {
    ok('no query + no filters → no search', !shouldSearch('  ', {}))
    ok('query alone → search', shouldSearch('ד', {}))
    ok('filter alone → browse mode', shouldSearch('', { status: 'live' }))
  }

  // ── sequence guard (stale-response cancellation) ──────────────────────────
  {
    const g = createSequenceGuard()
    const t1 = g.next()
    ok('first ticket current', g.isCurrent(t1))
    const t2 = g.next()
    ok('older ticket rejected after next()', !g.isCurrent(t1))
    ok('newest ticket accepted', g.isCurrent(t2))
    g.invalidate()
    ok('invalidate rejects everything', !g.isCurrent(t2))
    const t3 = g.next()
    ok('guard usable after invalidate', g.isCurrent(t3))
  }

  // ── debounce ──────────────────────────────────────────────────────────────
  {
    const d = createDebouncer(30)
    let fired: string[] = []
    d.schedule(() => fired.push('a'))
    d.schedule(() => fired.push('b'))   // replaces 'a'
    ok('pending while scheduled', d.pending)
    await sleep(80)
    ok('only the last scheduled fn fires', JSON.stringify(fired) === JSON.stringify(['b']))
    ok('not pending after fire', !d.pending)

    fired = []
    d.schedule(() => fired.push('c'))
    d.cancel()
    await sleep(80)
    ok('cancel prevents firing', fired.length === 0)
    ok('not pending after cancel', !d.pending)
  }

  // ── debounce + guard together (the component's race pattern) ─────────────
  {
    const guard = createSequenceGuard()
    const committed: string[] = []
    // Request 1 dispatched, slow; request 2 dispatched later, fast.
    const req1 = guard.next()
    const req2 = guard.next()
    // req2 resolves first and commits.
    if (guard.isCurrent(req2)) committed.push('req2')
    // req1 resolves late; must be dropped.
    if (guard.isCurrent(req1)) committed.push('req1')
    ok('late response dropped, latest committed',
      JSON.stringify(committed) === JSON.stringify(['req2']))
  }

  // ── match-reason mapping ──────────────────────────────────────────────────
  {
    const known = ['name', 'client_name', 'event_location', 'event_type', 'filename']
    for (const reason of known) {
      const key = matchReasonStringKey(reason)
      ok(`reason '${reason}' → he string`, t('he', key) !== key)
      ok(`reason '${reason}' → en string`, t('en', key) !== key)
    }
    ok('unknown reason → generic key',
      matchReasonStringKey('embedding_similarity') === 'search.reason.other')
  }

  // ── strings completeness + copy rules ─────────────────────────────────────
  {
    const heKeys = Object.keys(STRINGS.he).sort()
    const enKeys = Object.keys(STRINGS.en).sort()
    ok('he and en key sets identical', JSON.stringify(heKeys) === JSON.stringify(enKeys))
    const emDash = '—', enDash = '–'
    const offenders = ([] as string[]).concat(
      Object.values(STRINGS.he), Object.values(STRINGS.en),
    ).filter(s => s.includes(emDash) || s.includes(enDash))
    ok('no long dashes in any copy', offenders.length === 0, offenders.join(' | '))
    ok('t falls back to key for unknown', t('he', 'nope.missing') === 'nope.missing')
    ok('dirFor he → rtl', dirFor('he') === 'rtl')
    ok('dirFor en → ltr', dirFor('en') === 'ltr')
  }

  // ── normalizeSearchResult ─────────────────────────────────────────────────
  {
    ok('null → empty result', isEmptyResult(normalizeSearchResult(null)))
    ok('garbage → empty result', isEmptyResult(normalizeSearchResult('boom')))
    ok('missing sections → empty arrays', isEmptyResult(normalizeSearchResult({})))
    ok('EMPTY_RESULT is empty', isEmptyResult(EMPTY_RESULT))

    const r = normalizeSearchResult({
      clients: [
        { id: 'c1', name: 'דנה', slug: 'dana', match_reason: ['name'] },
        { name: 'no-id-dropped' },
      ],
      galleries: [{
        id: 'g1', name: 'חתונה בחוף', slug: 'beach', status: 'live',
        client_id: 'c1', client_name: 'דנה', event_date: '2026-05-01',
        event_type: 'חתונה', event_location: 'תל אביב',
        event_size_bucket: 'large', industry: null, image_count: 412,
        match_reason: ['name', 'event_location'],
      }],
      images: [{
        id: 'i1', gallery_id: 'g1', gallery_name: 'חתונה בחוף',
        filename: 'DSC_0042.jpg', thumbnail_path: 'g1/thumbs/DSC_0042.jpg',
        match_reason: ['filename'],
      }],
    })
    ok('client row normalized', r.clients.length === 1 && r.clients[0].id === 'c1')
    ok('row without id dropped', r.clients.every(x => x.id))
    ok('gallery row normalized',
      r.galleries[0]?.image_count === 42 + 370 && r.galleries[0]?.status === 'live')
    ok('gallery match reasons kept',
      JSON.stringify(r.galleries[0]?.match_reason) === JSON.stringify(['name', 'event_location']))
    ok('image row normalized',
      r.images[0]?.thumbnail_path === 'g1/thumbs/DSC_0042.jpg' &&
      r.images[0]?.gallery_id === 'g1')

    const dirty = normalizeSearchResult({
      clients: [{ id: 'c9', name: 7, match_reason: 'name' }],
      galleries: 'nope',
      images: [{ id: 'i9' }],   // missing gallery_id → dropped
    })
    ok('non-string name → empty string', dirty.clients[0]?.name === '')
    ok('non-array match_reason → []', dirty.clients[0]?.match_reason.length === 0)
    ok('non-array galleries → []', dirty.galleries.length === 0)
    ok('image without gallery_id dropped', dirty.images.length === 0)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

run().catch(err => { console.error(err); process.exit(1) })
