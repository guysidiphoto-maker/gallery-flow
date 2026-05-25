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
// Stability (2026-05-25): the storage files and URLs are healthy, but a
// gallery opens ~900 <img> at once and mobile Safari fires a burst of
// concurrent requests. When a single request transiently fails (a network
// blip, or Supabase storage briefly throttling the burst) the browser caches
// that failure and the tile stays broken FOREVER — there was no retry. To a
// client that reads as "sometimes the photos load, sometimes they don't".
// We now auto-retry a failed load a few times with backoff, appending a
// cache-busting query param so the browser re-fetches instead of replaying
// its cached error.

import React, { forwardRef, useEffect, useRef, useState } from 'react'
import { useSignedSrc } from '../lib/useSignedSrc'

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>

interface Props extends ImgProps {
  bucket: string
  path: string | null | undefined
}

// Backoff schedule per failed attempt. Three retries over ~6s covers
// transient blips and burst-throttling without hammering storage.
const RETRY_DELAYS_MS = [500, 1500, 4000]

export const SignedImg = forwardRef<HTMLImageElement, Props>(
  function SignedImg({ bucket, path, onError, onLoad, ...rest }, ref) {
    const baseSrc = useSignedSrc(bucket, path)
    // 0 = first load. Each failed load schedules an increment, which appends
    // `?cb=N` and forces a fresh fetch.
    const [attempt, setAttempt] = useState(0)
    const timerRef = useRef<number | null>(null)

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    // Whenever the underlying URL changes (new image, or signed→public swap),
    // reset the retry counter and cancel any pending retry.
    useEffect(() => {
      setAttempt(0)
      clearTimer()
      return clearTimer
    }, [baseSrc])

    const src =
      attempt > 0 && baseSrc
        ? baseSrc + (baseSrc.includes('?') ? '&' : '?') + 'cb=' + attempt
        : baseSrc

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

    return <img ref={ref} {...rest} src={src} onError={handleError} onLoad={handleLoad} />
  },
)
