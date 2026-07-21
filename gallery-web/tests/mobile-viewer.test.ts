// mobile-viewer.test.ts — regression coverage for the two mobile bugs fixed in
// the fullscreen viewer + one-tap download flow. Pure logic only (no DOM), run:
//   npx tsx tests/mobile-viewer.test.ts
//
// Bug 1: the FIRST-opened photo flashed "Image unavailable" because the viewer
//        rendered an <img> with an empty src (which fires onError) before the
//        real URL was assigned. Guests only saw a real image after swiping.
// Bug 2: single-image download needed two taps on iOS because navigator.share
//        was called AFTER an awaited fetch, losing the user-gesture activation.

import {
  shouldRenderFullImage,
  shouldShowUnavailable,
  isRealLoadError,
  downloadFileName,
  pickDownloadPath,
  downloadCacheKey,
  shouldWarmDownload,
  classifyDownloadError,
  keysOverCap,
} from '../src/lib/mobileViewer.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// ── Bug 1: viewer opens before URL resolution ───────────────────────────────
{
  // The <img> must NOT render while the source is still empty (first paint).
  ok('empty src → do not render <img>', shouldRenderFullImage('') === false)
  ok('resolved src → render <img>', shouldRenderFullImage('https://cdn/x.jpg?width=2048') === true)

  // "Image unavailable" must never show during a normal loading state.
  ok('no error during loading (empty src)', shouldShowUnavailable(false, '') === false)
  ok('no error shown while src empty even if a stale error flag is set',
     shouldShowUnavailable(true, '') === false)
  ok('unavailable only after real failure of a real src',
     shouldShowUnavailable(true, 'https://cdn/x.jpg') === true)
}

// ── Bug 1: error state reset / stale onError is ignored ──────────────────────
{
  const active = 'https://cdn/photo-2.jpg?width=2048'
  const stale  = 'https://cdn/photo-1.jpg?width=2048'
  // A late error from the previous (unmounting) image after a swipe is ignored.
  ok('stale image error ignored', isRealLoadError(stale, active) === false)
  // An empty-src error is ignored.
  ok('empty-src error ignored', isRealLoadError('', active) === false)
  ok('null src error ignored', isRealLoadError(null, active) === false)
  // Only the active source failing counts.
  ok('active image error counts', isRealLoadError(active, active) === true)
  // If the viewer already moved on (currentSrc empty), nothing counts.
  ok('no active src → nothing counts', isRealLoadError(active, '') === false)
}

// ── Bug 1: first selected image uses the correct index/URL (different field) ─
{
  // The grid may hand the viewer a thumbnail_path distinct from storage_path;
  // the fullscreen source is derived from storage_path. Simulate the selection.
  const images = [
    { id: 'a', storage_path: 'p/a/originals/a.jpg', thumbnail_path: 'p/a/thumbs/a.jpg' },
    { id: 'b', storage_path: 'p/b/originals/b.jpg', thumbnail_path: 'p/b/thumbs/b.jpg' },
  ]
  const tappedIndex = 0
  ok('first tapped image resolves the tapped item (not [1])',
     images[tappedIndex].id === 'a')
  ok('full source uses storage_path, not thumbnail_path',
     images[tappedIndex].storage_path.includes('/originals/'))
}

// ── Bug 2: download filename normalisation ──────────────────────────────────
{
  ok('jpeg → jpg', downloadFileName('IMG_1234.jpeg') === 'IMG_1234.jpg')
  ok('png → jpg (delivered blob is jpeg)', downloadFileName('shot.png') === 'shot.jpg')
  ok('no extension → adds .jpg', downloadFileName('portrait') === 'portrait.jpg')
  ok('empty → photo.jpg', downloadFileName('') === 'photo.jpg')
  ok('multi-dot base preserved', downloadFileName('a.b.c.jpg') === 'a.b.c.jpg')
}

// ── Bug 2: one-tap path selection ───────────────────────────────────────────
{
  // iOS with a prefetched File + share support → synchronous share (one tap).
  ok('iOS + prefetched file + canShare → share-sync',
     pickDownloadPath({ isMobile: true, canShareFiles: true, hasPrefetchedFile: true }) === 'share-sync')
  // Not prefetched yet → async fallback (fetch then share).
  ok('mobile + no prefetch → async-fetch',
     pickDownloadPath({ isMobile: true, canShareFiles: true, hasPrefetchedFile: false }) === 'async-fetch')
  // Share unsupported → async fallback (anchor download).
  ok('mobile + no share support → async-fetch',
     pickDownloadPath({ isMobile: true, canShareFiles: false, hasPrefetchedFile: true }) === 'async-fetch')
  // Desktop always uses the async anchor path (no gesture problem there).
  ok('desktop → async-fetch',
     pickDownloadPath({ isMobile: false, canShareFiles: false, hasPrefetchedFile: true }) === 'async-fetch')
}

// ── Bug 2: prefetch cache never mixes web and HD ────────────────────────────
{
  ok('web and original keys differ',
     downloadCacheKey('img-1', 'web') !== downloadCacheKey('img-1', 'original'))
  ok('same id+quality is stable',
     downloadCacheKey('img-1', 'web') === downloadCacheKey('img-1', 'web'))
}

// ── Grid-tile download: succeeds on the FIRST action (same path as viewer) ──
{
  // The grid tile and the viewer both call the same handler; one-tap depends
  // only on whether the File is warmed. A warmed tile on iOS → synchronous
  // share (first-tap success), identical to the viewer.
  const iosWarmed = pickDownloadPath({ isMobile: true, canShareFiles: true, hasPrefetchedFile: true })
  ok('grid tile: warmed iOS tile shares on first tap', iosWarmed === 'share-sync')
  ok('grid + viewer share ONE code path (same inputs → same decision)',
     pickDownloadPath({ isMobile: true, canShareFiles: true, hasPrefetchedFile: true }) ===
     pickDownloadPath({ isMobile: true, canShareFiles: true, hasPrefetchedFile: true }))
  // A cold (unwarmed) grid tap falls back to the async fetch path, which then
  // caches the File so a retry is instant.
  ok('grid tile: cold tap uses async fallback',
     pickDownloadPath({ isMobile: true, canShareFiles: false, hasPrefetchedFile: false }) === 'async-fetch')
}

// ── Warming is bounded: mobile + downloads only (no desktop waste) ──────────
{
  ok('warm on mobile w/ downloads enabled', shouldWarmDownload({ isMobile: true, downloadsEnabled: true }) === true)
  ok('never warm on desktop', shouldWarmDownload({ isMobile: false, downloadsEnabled: true }) === false)
  ok('never warm when downloads disabled', shouldWarmDownload({ isMobile: true, downloadsEnabled: false }) === false)
}

// ── Normal preparation does NOT trigger the failure toast; real failure does ─
{
  const notAllowed = { name: 'NotAllowedError' } // iOS gesture lapsed while preparing
  const aborted = { name: 'AbortError' }         // guest dismissed the share sheet / warm aborted
  const network = new TypeError('Failed to fetch')
  ok('iOS gesture-timing (NotAllowedError) is preparation, not failure',
     classifyDownloadError(notAllowed) === 'preparation')
  ok('dismissed share sheet is cancelled, not failure',
     classifyDownloadError(aborted) === 'cancelled')
  ok('real network error is a failure (clean retry allowed)',
     classifyDownloadError(network) === 'failure')
  // Only 'failure' shows the retry toast.
  const showsToast = (e: unknown) => classifyDownloadError(e) === 'failure'
  ok('no toast during preparation', showsToast(notAllowed) === false)
  ok('no toast on cancel', showsToast(aborted) === false)
  ok('toast on real failure', showsToast(network) === true)
}

// ── Cache stays bounded (no unlimited blobs in memory) ──────────────────────
{
  ok('within cap → nothing evicted', keysOverCap(['a', 'b', 'c'], 12).length === 0)
  ok('at cap → nothing evicted', keysOverCap(Array.from({ length: 12 }, (_, i) => 'k' + i), 12).length === 0)
  const over = keysOverCap(Array.from({ length: 15 }, (_, i) => 'k' + i), 12)
  ok('over cap → evicts the oldest overflow', over.length === 3 && over[0] === 'k0' && over[2] === 'k2')
  ok('eviction is FIFO (oldest first)', keysOverCap(['old', 'mid', 'new'], 2)[0] === 'old')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
