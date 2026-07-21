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

/**
 * Whether to warm downloadable Files for grid tiles. Only mobile needs it:
 * iOS Safari's one-tap `navigator.share` requires the File to already exist at
 * tap time, and Android benefits from the instant share too. Desktop downloads
 * via an `<a download>` anchor, which is not gesture-bound, so warming there
 * would just waste bandwidth. Gated on downloads actually being enabled.
 */
export function shouldWarmDownload(opts: { isMobile: boolean; downloadsEnabled: boolean }): boolean {
  return opts.isMobile && opts.downloadsEnabled
}

/**
 * Given insertion-ordered cache keys and a cap, return the oldest keys that
 * must be evicted to keep the download-File cache bounded (FIFO). Empty when
 * within the cap.
 */
export function keysOverCap(orderedKeys: string[], cap: number): string[] {
  if (orderedKeys.length <= cap) return []
  return orderedKeys.slice(0, orderedKeys.length - cap)
}

export type DownloadErrorKind = 'cancelled' | 'preparation' | 'failure'

/**
 * Classify a thrown download error so the UI only shows a failure message on a
 * REAL failure — never during normal preparation.
 * - AbortError: the guest dismissed the share sheet (or we aborted a warm). Silent.
 * - NotAllowedError: iOS rejected `share()` because the File was not ready in
 *   time and the gesture lapsed. That is a preparation-timing issue, not a
 *   failure — stay silent; the File is now warmed so the next tap is instant.
 * - anything else (network / fetch / storage error): a real failure → show the
 *   retry message.
 */
export function classifyDownloadError(err: unknown): DownloadErrorKind {
  const name = (err as { name?: string } | null)?.name
  if (name === 'AbortError') return 'cancelled'
  if (name === 'NotAllowedError') return 'preparation'
  return 'failure'
}
