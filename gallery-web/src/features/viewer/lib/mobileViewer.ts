// Pure decision helpers for the fullscreen viewer and one-tap mobile downloads.
// No DOM/React/Supabase imports so they run under `npx tsx` in tests.

/** An empty src resolves to the page URL and fires onError: only render once a source exists. */
export function shouldRenderFullImage(currentSrc: string): boolean {
  return currentSrc.length > 0
}

/** "Image unavailable" only after a real failure of a real source, never while resolving. */
export function shouldShowUnavailable(loadError: boolean, currentSrc: string): boolean {
  return loadError && currentSrc.length > 0
}

/** Ignore errors from stale targets (e.g. the previous image unmounting mid-swipe) or empty srcs. */
export function isRealLoadError(failedSrc: string | null | undefined, currentSrc: string): boolean {
  return !!failedSrc && !!currentSrc && failedSrc === currentSrc
}

export type DownloadQuality = 'web' | 'original'

/** Delivered blobs are JPEG, so guests always get a .jpg in Photos; guards empty names. */
export function downloadFileName(filename: string): string {
  const base = (filename || '').replace(/\.[^.]+$/, '')
  return (base || 'photo') + '.jpg'
}

export type DownloadPath = 'share-sync' | 'async-fetch'

/**
 * iOS drops the tap's user activation after any await, so navigator.share()
 * must run synchronously: only possible when the File is already prefetched.
 */
export function pickDownloadPath(opts: {
  isMobile: boolean
  canShareFiles: boolean
  hasPrefetchedFile: boolean
}): DownloadPath {
  if (opts.isMobile && opts.canShareFiles && opts.hasPrefetchedFile) return 'share-sync'
  return 'async-fetch'
}

/** Includes quality so a web-quality File is never served after switching to originals. */
export function downloadCacheKey(imageId: string, quality: DownloadQuality): string {
  return `${imageId}::${quality}`
}

/** Only mobile share needs a pre-built File; desktop anchor downloads aren't gesture-bound. */
export function shouldWarmDownload(opts: { isMobile: boolean; downloadsEnabled: boolean }): boolean {
  return opts.isMobile && opts.downloadsEnabled
}

/** Oldest keys to evict so the insertion-ordered File cache stays within `cap`. */
export function keysOverCap(orderedKeys: string[], cap: number): string[] {
  if (orderedKeys.length <= cap) return []
  return orderedKeys.slice(0, orderedKeys.length - cap)
}

export type DownloadErrorKind = 'cancelled' | 'preparation' | 'failure'

/**
 * Only real failures show a retry message. AbortError = sheet dismissed;
 * NotAllowedError = iOS gesture lapsed before the File was ready (next tap is instant).
 */
export function classifyDownloadError(err: unknown): DownloadErrorKind {
  const name = (err as { name?: string } | null)?.name
  if (name === 'AbortError') return 'cancelled'
  if (name === 'NotAllowedError') return 'preparation'
  return 'failure'
}
