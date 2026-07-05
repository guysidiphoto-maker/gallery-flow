import { useEffect, useCallback, useState } from 'react'
import type { GalleryImage } from './types'
import { Icon } from './components/Icon'
import { signedStorageUrl } from './lib/signedStorage'
import { displayUrl } from './supabase'
import { useFocusTrap } from './lib/useFocusTrap'

// Buckets that support Supabase on-the-fly image transforms. For these, the
// fullscreen view loads a bounded ~2048px transform (sharp + fast) instead of
// the stored object — which in the originals-only model IS the multi-MB
// original. The true original is only fetched on explicit download.
const TRANSFORMABLE_BUCKETS = new Set(['gallery-images', 'demo-uploads'])
const FULLSCREEN_WIDTH = 2048
const LQIP_WIDTH = 48

interface ViewerProps {
  images: GalleryImage[]
  index: number
  /** Storage bucket the web previews live in. The viewer picks the path
   *  per image (storage_path) and resolves a signed URL via
   *  signedStorageUrl, which short-circuits to the public URL when the
   *  feature flag is off. */
  imgBucket: string
  allowDownloads: boolean
  downloadLabel: string
  onClose: () => void
  onNavigate: (index: number) => void
  /** Hand the entire GalleryImage object back to the parent. The parent
   *  resolves the right URL (HEAD-checking the original to guard against
   *  the original_uploaded data drift) before downloading. */
  onDownload: (img: GalleryImage) => void
}

// Editorial palette — keeps the lightbox in the same Pic-Time language as
// the rest of the app while staying readable on the dark overlay.
const OVERLAY    = 'rgba(20,20,19,.92)'
const CHARCOAL   = '#141413'
const HAIRLINE   = 'rgba(255,255,255,.18)'
const HAIRLINE_HOVER = 'rgba(255,255,255,.45)'
const SURFACE    = 'rgba(255,255,255,.06)'

const controlBase = {
  background: SURFACE,
  border: `1px solid ${HAIRLINE}`,
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  transition: 'background .15s, border-color .15s',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
} as const

export function Viewer({ images, index, imgBucket, allowDownloads, downloadLabel, onClose, onNavigate, onDownload }: ViewerProps) {
  const img = images[index]
  const total = images.length
  const [currentSrc, setCurrentSrc] = useState<string>('')
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  // Thumbnail URL renders as an instant LQIP placeholder behind the full
  // image. The browser usually has it cached from the grid, so it paints
  // in 1 frame and the viewer never sits on a black screen.
  const [thumbSrc, setThumbSrc] = useState<string>('')

  // Focus trap — keyboard users must not be able to tab out of the lightbox
  // while it is open (WCAG 2.1.2). Returns focus to the triggering grid tile
  // when the viewer closes.
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose)

  const prev = useCallback(() => onNavigate((index - 1 + total) % total), [index, total, onNavigate])
  const next = useCallback(() => onNavigate((index + 1) % total), [index, total, onNavigate])

  // Resolve the signed URL for the current image. signedStorageUrl
  // short-circuits to the public URL when VITE_PUBLIC_VIEWER_SIGNED_URLS
  // is off, so this works either way.
  useEffect(() => {
    let cancelled = false
    setLoadedSrc(null)
    setCurrentSrc('')
    setThumbSrc('')
    setLoadError(false)
    if (!img?.storage_path) return
    // Preferred path: server-side transform. A bounded fullscreen width keeps
    // even a 10MB original down to a few hundred KB, and a tiny blurred LQIP
    // paints instantly. The stored object is never loaded raw here.
    if (TRANSFORMABLE_BUCKETS.has(imgBucket)) {
      // LQIP = the small pre-baked thumb served directly (usually already
      // cached from the grid). Fullscreen = the ≤2048 web derivative direct.
      // displayUrl only transforms if the path is still an original.
      setThumbSrc(displayUrl(imgBucket, img.thumbnail_path ?? img.storage_path, LQIP_WIDTH, 40))
      setCurrentSrc(displayUrl(imgBucket, img.storage_path, FULLSCREEN_WIDTH, 78))
      return () => { cancelled = true }
    }
    // Legacy fallback (non-transformable bucket): signed raw object.
    if (img.thumbnail_path) {
      signedStorageUrl(imgBucket, img.thumbnail_path)
        .then(url => { if (!cancelled) setThumbSrc(url) })
        .catch(() => { /* placeholder is optional */ })
    }
    signedStorageUrl(imgBucket, img.storage_path)
      .then(url => { if (!cancelled) setCurrentSrc(url) })
      .catch(() => { /* fallback handled inside signedStorageUrl */ })
    return () => { cancelled = true }
  }, [imgBucket, img?.storage_path, img?.thumbnail_path])

  // Preload next 5 photos via signedStorageUrl (warms the helper's cache).
  useEffect(() => {
    if (total <= 1) return
    const count = Math.min(5, total - 1)
    for (let i = 1; i <= count; i++) {
      const nextImg = images[(index + i) % total]
      if (!nextImg?.storage_path) continue
      if (TRANSFORMABLE_BUCKETS.has(imgBucket)) {
        const im = new Image()
        im.src = displayUrl(imgBucket, nextImg.storage_path, FULLSCREEN_WIDTH, 78)
        continue
      }
      signedStorageUrl(imgBucket, nextImg.storage_path)
        .then(url => { const im = new Image(); im.src = url })
        .catch(() => { /* ignore preload failure */ })
    }
  }, [index, total, images, imgBucket])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      // RTL: visual "previous" is on the right side, so the right arrow should
      // step back. dir is set on <html> by main.tsx; default LTR.
      const isRtl = document.documentElement.dir === 'rtl'
      if (e.key === 'ArrowLeft') isRtl ? next() : prev()
      if (e.key === 'ArrowRight') isRtl ? prev() : next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  // Swipe support
  useEffect(() => {
    let startX = 0
    function onTouchStart(e: TouchEvent) { startX = e.touches[0].clientX }
    function onTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX
      if (Math.abs(dx) > 50) dx < 0 ? next() : prev()
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [prev, next])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    // role="dialog" + aria-modal tell screen readers this is a dialog and that
    // content behind it is inert (WCAG 1.3.1, 4.1.2). aria-label provides the
    // accessible name since there is no visible heading element inside.
    <div
      ref={dialogRef}
      className="viewer"
      onClick={onClose}
      style={{ background: OVERLAY }}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${images.length}`}
    >
      <div className="viewer__inner" onClick={(e) => e.stopPropagation()}>
        {/* Close — hairline-bordered square in top-right (LTR-true since the
            close icon's home is conventionally top-right regardless of doc dir) */}
        <button
          className="viewer__close"
          onClick={onClose}
          aria-label="Close"
          style={{
            ...controlBase,
            position: 'absolute', top: 16, insetInlineEnd: 16,
            width: 38, height: 38, borderRadius: 2,
            zIndex: 10,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = HAIRLINE_HOVER }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = HAIRLINE }}
        >
          <Icon name="close" size={16} strokeWidth={1.85} />
        </button>

        {/* Prev — chevron left, on the left edge */}
        <button
          className="viewer__nav viewer__nav--prev"
          onClick={prev}
          aria-label="Previous"
          style={{
            ...controlBase,
            position: 'absolute', top: '50%', left: 14,
            transform: 'translateY(-50%)',
            width: 42, height: 42, borderRadius: 2,
            zIndex: 10,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = HAIRLINE_HOVER }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = HAIRLINE }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* LQIP layer: thumbnail blown up + blurred. Paints in 1 frame
            because the browser usually has it from the grid. Hidden once
            the full image loads. */}
        {thumbSrc && loadedSrc !== currentSrc && (
          <img
            key={`thumb-${thumbSrc}`}
            className="viewer__img"
            src={thumbSrc}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              filter: 'blur(14px)',
              transform: 'scale(1.04)',
            }}
          />
        )}

        <img
          key={currentSrc}
          className="viewer__img"
          src={currentSrc}
          alt=""
          onLoad={() => setLoadedSrc(currentSrc)}
          onError={() => setLoadError(true)}
          style={{
            opacity: loadedSrc === currentSrc ? 1 : 0,
            transition: 'opacity .25s ease',
            position: 'relative',
            display: loadError ? 'none' : undefined,
          }}
        />

        {/* Storage 404 / network failure: show an inline message + next-photo
            CTA instead of an endlessly spinning loader on a black screen. */}
        {loadError && (
          <div
            role="status"
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'rgba(255,255,255,.85)', textAlign: 'center',
              fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6,
              padding: 24, maxWidth: 360, zIndex: 6,
            }}
          >
            <p style={{ margin: '0 0 14px', fontWeight: 600 }}>
              {document.documentElement.dir === 'rtl' ? 'התמונה לא זמינה' : 'Image unavailable'}
            </p>
            {total > 1 && (
              <button
                onClick={next}
                style={{
                  ...controlBase,
                  padding: '10px 18px',
                  fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase',
                  borderRadius: 2,
                }}
              >
                {document.documentElement.dir === 'rtl' ? 'לתמונה הבאה' : 'Next photo'}
              </button>
            )}
          </div>
        )}

        {/* Loading spinner: visible until the full image finishes loading.
            Sits above the LQIP layer so guests get an unambiguous "still
            working" signal even on slow mobile networks. Hidden on error
            so the error UI above takes over. */}
        {loadedSrc !== currentSrc && !loadError && (
          <div
            aria-label="Loading"
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 36, height: 36,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,.18)',
              borderTopColor: 'rgba(255,255,255,.85)',
              animation: 'spin .7s cubic-bezier(.4,.0,.2,1) infinite',
              zIndex: 5,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Next — chevron right, on the right edge */}
        <button
          className="viewer__nav viewer__nav--next"
          onClick={next}
          aria-label="Next"
          style={{
            ...controlBase,
            position: 'absolute', top: '50%', right: 14,
            transform: 'translateY(-50%)',
            width: 42, height: 42, borderRadius: 2,
            zIndex: 10,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = HAIRLINE_HOVER }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = HAIRLINE }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>

        <div className="viewer__bottom" style={{
          position: 'absolute', bottom: 24, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          {/* Counter — tracked uppercase */}
          <span style={{
            color: 'rgba(255,255,255,.7)',
            fontSize: 11, fontWeight: 500,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            fontVariantNumeric: 'tabular-nums',
            marginInlineEnd: 4,
          }}>
            {index + 1} / {total}
          </span>

          {/* Download — outlined uppercase, matches the rest of the app's CTAs */}
          {allowDownloads && (
            <button
              className="viewer__download"
              onClick={() => onDownload(img)}
              style={{
                ...controlBase,
                background: SURFACE,
                color: '#fff',
                borderColor: HAIRLINE,
                borderRadius: 2,
                padding: '9px 18px',
                fontSize: 11, fontWeight: 500,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                gap: 8,
                boxShadow: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fff'
                e.currentTarget.style.color = CHARCOAL
                e.currentTarget.style.borderColor = '#fff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = SURFACE
                e.currentTarget.style.color = '#fff'
                e.currentTarget.style.borderColor = HAIRLINE
              }}
            >
              <Icon name="download" size={13} strokeWidth={1.85} />
              {downloadLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
