// Pre-warm the shared CDN edge with a gallery's first thumbnails from the
// photographer's browser (same region as guests), so the first guest doesn't pay
// the cold origin round-trip.

import { supabase, storageUrl, displayUrl } from './supabase'

const BUCKET = 'gallery-images'
const WARM_COUNT = 250 // first N thumbnails — covers the opening screens
const CONCURRENCY = 6  // gentle on the photographer's connection

// Shared with the grid so warming populates exactly the variants it requests.
export const GRID_WIDTHS: number[] = [320, 640, 960, 1280]
const THUMB_SIZES =
  '(max-width: 479px) 50vw, (max-width: 767px) 50vw, (max-width: 1099px) 33vw, 25vw'
const TRANSFORMABLE = new Set(['gallery-images', 'demo-uploads'])

function preload(url: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve() // best-effort: a miss here must not stall the pool
    img.src = url
  })
}

async function runPool(urls: string[], concurrency: number): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++]
      await preload(url)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, worker),
  )
}

/**
 * Fire-and-forget: warm the CDN edge for a gallery's first thumbnails.
 * Best-effort and idempotent — safe to call on publish and on share; any
 * failure is swallowed so it never disrupts the photographer's action.
 */
export async function warmGalleryCache(galleryId: string): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('gallery_get_images', {
      p_gallery_id: galleryId,
      p_token: null,
      p_limit: WARM_COUNT,
      p_offset: 0,
    })
    if (error || !data) return
    const urls = (data as Array<{ thumbnail_path?: string; web_preview_path?: string }>)
      .map(r => r.thumbnail_path || r.web_preview_path)
      .filter((p): p is string => !!p)
      .map(p => storageUrl(BUCKET, p))
    if (urls.length === 0) return
    await runPool(urls, CONCURRENCY)
  } catch {
    /* best-effort warm — never disrupts publish/share */
  }
}

/**
 * Preload the first thumbnails into the guest's browser cache during the cover
 * screen, mirroring the grid's srcset/sizes. Returns a cancel function.
 */
export function preloadGalleryThumbs(
  items: Array<{ thumbnail_path?: string | null; storage_path?: string | null }>,
  opts: { bucket?: string; count?: number } = {},
): () => void {
  const bucket = opts.bucket ?? BUCKET
  const count = opts.count ?? 150
  const useTransforms = TRANSFORMABLE.has(bucket)
  const paths = items
    .slice(0, count)
    .map(it => it.thumbnail_path || it.storage_path)
    .filter((p): p is string => !!p)

  let next = 0
  let cancelled = false

  const loadNext = () => {
    if (cancelled || next >= paths.length) return
    const path = paths[next++]
    const img = new Image()
    img.onload = img.onerror = () => { if (!cancelled) loadNext() }
    if (useTransforms) {
      img.sizes = THUMB_SIZES
      img.srcset = GRID_WIDTHS.map(w => `${displayUrl(bucket, path, w, 60)} ${w}w`).join(', ')
    }
    img.src = storageUrl(bucket, path) // fallback + non-transform buckets
  }

  for (let k = 0; k < Math.min(CONCURRENCY, paths.length); k++) loadNext()
  return () => { cancelled = true }
}
