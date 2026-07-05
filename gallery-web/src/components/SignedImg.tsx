// SignedImg — Phase 4.4 drop-in <img> wrapper that resolves to a signed URL.
//
// Use as a 1-line replacement for `<img src={storageUrl(...)} ... />`:
//
//   <img src={storageUrl('gallery-images', img.storage_path)} ... />
//   ↓
//   <SignedImg bucket="gallery-images" path={img.storage_path} ... />
//
// All other <img> props (alt, style, loading, className, onLoad, onError,
// ref, …) pass through unchanged. ref is supported via forwardRef so
// callers (e.g. MasonryGrid in P4.5.D2) can keep their imgRefs map.
//
// Stability (2026-05-25): a gallery opens ~900 <img> at once and mobile Safari
// fires a burst of concurrent requests. When a single request transiently
// fails the browser caches that failure and the tile stays broken forever —
// there was no retry. We now auto-retry a failed load a few times with
// backoff + a cache-busting query so the browser re-fetches.
//
// Responsive thumbnails (2026-05-26): pass `transformWidths` to emit a
// srcset of Supabase on-the-fly transforms (cached 1yr by the CDN). The
// browser then downloads a width that matches the display + DPR — phones
// pull ~16KB instead of the ~74KB stored thumb. `src` stays the stored
// object, so it is both the old-browser fallback AND the resilience fallback
// if a transform variant fails to load.

import React, { forwardRef, useEffect, useRef, useState } from 'react'
import { useSignedSrc } from '../lib/useSignedSrc'
import { renderUrl, storageUrl } from '../supabase'

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>

interface Props extends ImgProps {
  bucket: string
  path: string | null | undefined
  /** Widths (px) for a responsive transform srcset. Omit to serve the stored object as-is. */
  transformWidths?: number[]
  /** JPEG quality for the transforms (default 60). */
  transformQuality?: number
  /**
   * Pre-baked static derivatives for a responsive srcset served DIRECTLY (no
   * on-the-fly transform). Each entry is a stored object path + its intrinsic
   * width descriptor, e.g. [{path: thumbnail_path, width: 640}, {path:
   * web_preview_path, width: 2048}]. When provided (and the paths are
   * derivatives, not originals) this is preferred over `transformWidths`, so
   * the browser picks the right static file per column/DPR with ZERO Supabase
   * image transformations. Null paths are skipped.
   */
  srcSetPaths?: Array<{ path: string | null | undefined; width: number }>
}

// Backoff schedule per failed attempt. Three retries over ~6s covers
// transient blips and burst-throttling without hammering storage.
const RETRY_DELAYS_MS = [500, 1500, 4000]

// Transforms only work on the public image bucket(s); never for stories etc.
const TRANSFORMABLE_BUCKETS = new Set(['gallery-images', 'demo-uploads'])

// When a caller doesn't specify transformWidths, this bounded width is still
// used for `src` so a transformable bucket NEVER serves the raw stored object.
// In the originals-only model that object is the multi-MB original; Supabase
// does not upscale, so legacy small thumbnails are returned at their own size.
const DEFAULT_DISPLAY_WIDTH = 1280

export const SignedImg = forwardRef<HTMLImageElement, Props>(
  function SignedImg(
    { bucket, path, transformWidths, transformQuality = 60, srcSetPaths, onError, onLoad, ...rest },
    ref,
  ) {
    const baseSrc = useSignedSrc(bucket, path)
    // 0 = first load. Each failed load schedules an increment, which appends
    // `?cb=N` / `&cb=N` and forces a fresh fetch.
    const [attempt, setAttempt] = useState(0)
    const timerRef = useRef<number | null>(null)

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    // Reset retries whenever the underlying URL changes (new image / swap).
    useEffect(() => {
      setAttempt(0)
      clearTimer()
      return clearTimer
    }, [baseSrc])

    const bust = (url: string): string =>
      attempt > 0 ? url + (url.includes('?') ? '&' : '?') + 'cb=' + attempt : url

    const transformable = !!(path && TRANSFORMABLE_BUCKETS.has(bucket))
    // A derivative path (web/thumb) is already small and is served DIRECTLY.
    // Only an ORIGINAL path is routed through the bounded render/image transform
    // (cost control 2026-07-05 — see displayUrl in supabase.ts).
    const isOriginal = !!(path && path.includes('/originals/'))
    const needsTransform = transformable && isOriginal
    const hasWidths = !!transformWidths?.length

    // Preferred: a static responsive srcset built from pre-baked derivative
    // OBJECTS (zero transforms). Used for the grid.
    const staticParts = (transformable && !needsTransform && srcSetPaths?.length)
      ? srcSetPaths.filter(s => !!s.path).map(s => `${bust(storageUrl(bucket, s.path!))} ${s.width}w`)
      : []

    const srcSet = staticParts.length
      ? staticParts.join(', ')
      // Legacy transform srcset — only when we must bound an original.
      : (needsTransform && hasWidths
          ? transformWidths!.map(w => `${bust(renderUrl(bucket, path!, w, transformQuality))} ${w}w`).join(', ')
          : undefined)

    // `src`: for an original, a bounded transform (never the raw object). For a
    // derivative, the stored object served directly (baseSrc = public/signed
    // object URL). Non-transformable buckets: the object as-is.
    const src = needsTransform
      ? bust(renderUrl(bucket, path!, hasWidths ? Math.max(...transformWidths!) : DEFAULT_DISPLAY_WIDTH, transformQuality))
      : (baseSrc ? bust(baseSrc) : baseSrc)

    const handleError: React.ReactEventHandler<HTMLImageElement> = e => {
      if (baseSrc && attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt]
        clearTimer()
        timerRef.current = window.setTimeout(() => setAttempt(a => a + 1), delay)
      }
      onError?.(e)
    }

    const handleLoad: React.ReactEventHandler<HTMLImageElement> = e => {
      clearTimer()
      onLoad?.(e)
    }

    return (
      <img
        ref={ref}
        {...rest}
        src={src}
        srcSet={srcSet}
        onError={handleError}
        onLoad={handleLoad}
      />
    )
  },
)
