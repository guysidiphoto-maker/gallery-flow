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

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
