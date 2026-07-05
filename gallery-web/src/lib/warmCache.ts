// warmCache.ts — pre-warm the CDN edge for a gallery's thumbnails.
//
// Why: a guest typically views a gallery only once. The Cloudflare edge cache
// is SHARED across guests, but the first request for an uncached image still
// pays a ~1.5s origin round-trip — and that cost is latency (the storage
// origin is far), not file size, so shrinking thumbnails barely helps it.
//
// The fix is to warm the shared edge BEFORE the first guest arrives. The
// photographer publishes/shares from the same region as the guests (Tel Aviv
// edge), so preloading the gallery's thumbnails from their browser populates
// the exact edge the guests will hit. Combined with the 1-year cache
// (uploadTypes ONE_YEAR_CACHE + the storage backfill) the warmth then sticks.
// This mirrors what Pic-Time / Pixieset do server-side at upload time.
//
// Scope: we warm the first WARM_COUNT thumbnails — the initial on-screen
// batches a guest sees. The long tail warms naturally as the first viewer
// scrolls and then stays cached for a year.

import { supabase, storageUrl, displayUrl } from '../supabase'

const BUCKET = 'gallery-images'
const WARM_COUNT = 250 // first N thumbnails — covers the opening screens
const CONCURRENCY = 6  // gentle on the photographer's connection

// SINGLE SOURCE OF TRUTH for the responsive widths the grid emits in its
// transform srcset. Both `MasonryGrid` (App.tsx) and `preloadGalleryThumbs`
// below import this so the warming actually populates the same Supabase
// transform variants the grid then requests. Drift between the two used to
// warm 240/400/600 but the grid asked for 320/640/960/1280 — every guest
// then paid the cold-transform cost on first load.
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
 * Preload the gallery's first thumbnails into the *guest's* browser cache
 * while the welcome/cover screen is shown — so when they tap "enter" the grid
 * appears already-loaded (the Pixieset "everything loads on the cover page"
 * trick). Each preload mirrors the grid's srcset/sizes so the browser caches
 * the exact variant the grid will request. Returns a cancel function.
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
