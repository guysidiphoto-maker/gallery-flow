import { useEffect, useCallback, useState } from 'react'
import type { GalleryImage } from './types'

interface ViewerProps {
  images: GalleryImage[]
  index: number
  webUrl: (img: GalleryImage) => string
  downloadUrl: (img: GalleryImage) => string
  allowDownloads: boolean
  downloadLabel: string
  onClose: () => void
  onNavigate: (index: number) => void
  onDownload: (url: string, filename: string) => void
  /** Currently-favorited image ids (in localStorage). When provided alongside
   *  onToggleFavorite, the viewer renders a Heart button next to download. */
  favoritedIds?: Set<string>
  onToggleFavorite?: (imageId: string) => void
}

export function Viewer({ images, index, webUrl, downloadUrl, allowDownloads, downloadLabel, onClose, onNavigate, onDownload, favoritedIds, onToggleFavorite }: ViewerProps) {
  const img = images[index]
  const total = images.length
  const currentSrc = webUrl(img)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)

  const prev = useCallback(() => onNavigate((index - 1 + total) % total), [index, total, onNavigate])
  const next = useCallback(() => onNavigate((index + 1) % total), [index, total, onNavigate])

  // Reset loaded state on navigation so the previous image clears immediately
  useEffect(() => {
    setLoadedSrc(null)
  }, [currentSrc])

  // Preload next 5 photos
  useEffect(() => {
    if (total <= 1) return
    const count = Math.min(5, total - 1)
    for (let i = 1; i <= count; i++) {
      const img = new Image()
      img.src = webUrl(images[(index + i) % total])
    }
  }, [index, total, images, webUrl])

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
    <div className="viewer" onClick={onClose}>
      <div className="viewer__inner" onClick={(e) => e.stopPropagation()}>
        <button className="viewer__close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <button className="viewer__nav viewer__nav--prev" onClick={prev} aria-label="Previous">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

        <button className="viewer__nav viewer__nav--next" onClick={next} aria-label="Next">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>

        <div className="viewer__bottom">
          <span className="viewer__counter">{index + 1} / {total}</span>
          {onToggleFavorite && (
            <button
              className="viewer__fav"
              onClick={() => onToggleFavorite(img.id)}
              aria-label={favoritedIds?.has(img.id) ? 'Remove favorite' : 'Add favorite'}
              style={{
                background: 'rgba(255,255,255,.06)',
                border: `1px solid ${favoritedIds?.has(img.id) ? 'rgba(239,68,68,.5)' : 'rgba(255,255,255,.15)'}`,
                color: favoritedIds?.has(img.id) ? '#ef4444' : '#fff',
                borderRadius: 999, padding: '8px 14px',
                display: 'flex', alignItems: 'center', gap: 6,
                cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                transition: 'all .15s',
                marginInlineEnd: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24"
                fill={favoritedIds?.has(img.id) ? '#ef4444' : 'none'}
                stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
          )}
          {allowDownloads && (
            <button className="viewer__download" onClick={() => onDownload(downloadUrl(img), img.filename)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloadLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
