// Drop-in <img> for storage objects: resolves signed URLs, retries transient load
// failures with a cache-busting query, and can emit a responsive srcset.

import React, { forwardRef, useEffect, useRef, useState } from 'react'
import { useSignedSrc } from '@/shared/lib/useSignedSrc'
import { renderUrl, storageUrl } from '@/shared/lib/supabase'
import { srcsetEntry } from '@/shared/lib/srcset'

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>

interface Props extends ImgProps {
  bucket: string
  path: string | null | undefined
  /** Widths (px) for a responsive transform srcset. Omit to serve the stored object as-is. */
  transformWidths?: number[]
  /** JPEG quality for the transforms (default 60). */
  transformQuality?: number
  /**
   * Stored derivatives + intrinsic widths for a static srcset (no transforms).
   * Preferred over `transformWidths` for derivative paths; null paths are skipped.
   */
  srcSetPaths?: Array<{ path: string | null | undefined; width: number }>
}

// Mobile Safari caches a failed load forever, so retry with backoff (~6s total).
const RETRY_DELAYS_MS = [500, 1500, 4000]

const TRANSFORMABLE_BUCKETS = new Set(['gallery-images', 'demo-uploads'])

// Bounded `src` width so an original is never served raw (Supabase doesn't upscale).
const DEFAULT_DISPLAY_WIDTH = 1280

export const SignedImg = forwardRef<HTMLImageElement, Props>(
  function SignedImg(
    { bucket, path, transformWidths, transformQuality = 60, srcSetPaths, onError, onLoad, ...rest },
    ref,
  ) {
    const baseSrc = useSignedSrc(bucket, path)
    // Each failed load bumps this, appending cb=N to force a fresh fetch.
    const [attempt, setAttempt] = useState(0)
    const timerRef = useRef<number | null>(null)

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    useEffect(() => {
      setAttempt(0)
      clearTimer()
      return clearTimer
    }, [baseSrc])

    const bust = (url: string): string =>
      attempt > 0 ? url + (url.includes('?') ? '&' : '?') + 'cb=' + attempt : url

    const transformable = !!(path && TRANSFORMABLE_BUCKETS.has(bucket))
    // Derivatives are served directly; only originals need a bounded transform (see displayUrl).
    const isOriginal = !!(path && path.includes('/originals/'))
    const needsTransform = transformable && isOriginal
    const hasWidths = !!transformWidths?.length

    const staticParts = (transformable && !needsTransform && srcSetPaths?.length)
      ? srcSetPaths.filter(s => !!s.path).map(s => srcsetEntry(bust(storageUrl(bucket, s.path!)), s.width))
      : []

    const srcSet = staticParts.length
      ? staticParts.join(', ')
      : (needsTransform && hasWidths
          ? transformWidths!.map(w => srcsetEntry(bust(renderUrl(bucket, path!, w, transformQuality)), w)).join(', ')
          : undefined)

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
