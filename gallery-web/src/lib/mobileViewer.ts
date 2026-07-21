// mobileViewer.ts — pure decision helpers for the fullscreen photo viewer and
// the one-tap mobile download flow. Deliberately free of DOM / React / Supabase
// imports so they run under `npx tsx` for regression coverage and stay trivial
// to reason about.

/**
 * Bug 1 guard. The fullscreen <img> must NEVER be rendered with an empty src.
 * An empty string src resolves to the document URL in Safari/Chrome and fires
 * the element's onError handler — which is exactly why the viewer flashed
 * "התמונה לא זמינה" (Image unavailable) on the FIRST open: the component's
 * first paint has currentSrc === '' (the real URL is assigned in a following
 * effect), the empty-src <img> errored, and loadError stuck until the guest
 * swiped, which remounted the <img> with a real URL and masked the bug.
 *
 * Only render the image once we actually hold a source.
 */
export function shouldRenderFullImage(currentSrc: string): boolean {
  return currentSrc.length > 0
}

/**
 * Only surface the "image unavailable" state after a REAL load failure of a
 * REAL source — never while the source is still being resolved (empty src).
 */
export function shouldShowUnavailable(loadError: boolean, currentSrc: string): boolean {
  return loadError && currentSrc.length > 0
}

/**
 * onError must ignore stale / empty targets. A failing element whose src no
 * longer matches the active source — e.g. the previous image unmounting during
 * a swipe, or an empty src — must NOT flip the currently-active image into the
 * error state.
 */
export function isRealLoadError(failedSrc: string | null | undefined, currentSrc: string): boolean {
  return !!failedSrc && !!currentSrc && failedSrc === currentSrc
}

export type DownloadQuality = 'web' | 'original'

/**
 * iOS Safari download filename. Guests expect a .jpg landing in Photos
 * regardless of the stored extension (originals may be .jpeg/.png/.webp, but
 * the delivered blob is a JPEG). Guards against an empty/extension-only name.
 */
export function downloadFileName(filename: string): string {
  const base = (filename || '').replace(/\.[^.]+$/, '')
  return (base || 'photo') + '.jpg'
}

export type DownloadPath = 'share-sync' | 'async-fetch'

/**
 * Bug 2 decision. On iOS Safari, navigator.share() must be invoked
 * SYNCHRONOUSLY inside the tap handler — any awaited fetch/sign beforehand
 * drops the transient user activation and the share is rejected (which the old
 * code swallowed, so nothing downloaded and a second tap was needed).
 *
 * When we already hold a prefetched File we can share it with no await first
 * ('share-sync') and the download completes on the FIRST tap. Otherwise we
 * fall back to the async fetch→share path (desktop, or a file not yet warmed).
 */
export function pickDownloadPath(opts: {
  isMobile: boolean
  canShareFiles: boolean
  hasPrefetchedFile: boolean
}): DownloadPath {
  if (opts.isMobile && opts.canShareFiles && opts.hasPrefetchedFile) return 'share-sync'
  return 'async-fetch'
}

/**
 * Cache key for a prefetched download File. MUST include quality so a
 * web-quality prefetch is never handed back after the guest switched the
 * gallery to HD/original downloads.
 */
export function downloadCacheKey(imageId: string, quality: DownloadQuality): string {
  return `${imageId}::${quality}`
}
