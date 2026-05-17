import { useEffect, useCallback, useState } from 'react'
import type { GalleryImage } from './types'
import { Icon } from './components/Icon'
import { signedStorageUrl } from './lib/signedStorage'

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

  const prev = useCallback(() => onNavigate((index - 1 + total) % total), [index, total, onNavigate])
  const next = useCallback(() => onNavigate((index + 1) % total), [index, total, onNavigate])

  // Resolve the signed URL for the current image. signedStorageUrl
  // short-circuits to the public URL when VITE_PUBLIC_VIEWER_SIGNED_URLS
  // is off, so this works either way.
  useEffect(() => {
    let cancelled = false
    setLoadedSrc(null)
    setCurrentSrc('')
    if (!img?.storage_path) return
    signedStorageUrl(imgBucket, img.storage_path)
      .then(url => { if (!cancelled) setCurrentSrc(url) })
      .catch(() => { /* fallback handled inside signedStorageUrl */ })
    return () => { cancelled = true }
  }, [imgBucket, img?.storage_path])

  // Preload next 5 photos via signedStorageUrl (warms the helper's cache).
  useEffect(() => {
    if (total <= 1) return
    const count = Math.min(5, total - 1)
    for (let i = 1; i <= count; i++) {
      const next = images[(index + i) % total]
      if (!next?.storage_path) continue
      signedStorageUrl(imgBucket, next.storage_path)
        .then(url => { const im = new Image(); im.src = url })
        .catch(() => { /* ignore preload failure */ })
    }
  }, [index, total, images, imgBucket])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
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
    <div className="viewer" onClick={onClose} style={{ background: OVERLAY }}>
      <div className="viewer__inner" onClick={(e) => e.stopPropagation()}>
        {/* Close — hairline-bordered square in top-right (LTR-true since the
            close icon's home is conventionally top-right regardless of doc dir) */}
        <button
          className="viewer__close"
          onClick={onClose}
          aria-label="Close"
          style={{
            ...controlBase,
            position: 'absolute', top: 16, right: 16,
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

        <img
          key={currentSrc}
          className="viewer__img"
          src={currentSrc}
          alt=""
          onLoad={() => setLoadedSrc(currentSrc)}
          style={{ visibility: loadedSrc === currentSrc ? 'visible' : 'hidden' }}
        />

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
