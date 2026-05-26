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
import { renderUrl } from '../supabase'

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>

interface Props extends ImgProps {
  bucket: string
  path: string | null | undefined
  /** Widths (px) for a responsive transform srcset. Omit to serve the stored object as-is. */
  transformWidths?: number[]
  /** JPEG quality for the transforms (default 60). */
  transformQuality?: number
}

// Backoff schedule per failed attempt. Three retries over ~6s covers
// transient blips and burst-throttling without hammering storage.
const RETRY_DELAYS_MS = [500, 1500, 4000]

// Transforms only work on the public image bucket(s); never for stories etc.
const TRANSFORMABLE_BUCKETS = new Set(['gallery-images', 'demo-uploads'])

export const SignedImg = forwardRef<HTMLImageElement, Props>(
  function SignedImg(
    { bucket, path, transformWidths, transformQuality = 60, onError, onLoad, ...rest },
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

    const src = baseSrc ? bust(baseSrc) : baseSrc

    // Build a responsive srcset of transforms when asked for and supported.
    const srcSet =
      path && transformWidths?.length && TRANSFORMABLE_BUCKETS.has(bucket)
        ? transformWidths
            .map(w => `${bust(renderUrl(bucket, path, w, transformQuality))} ${w}w`)
            .join(', ')
        : undefined

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
