import { useEffect, useCallback } from 'react'
import type { GalleryImage } from './types'

interface ViewerProps {
  images: GalleryImage[]
  index: number
  webUrl: (img: GalleryImage) => string
  originalUrl: (img: GalleryImage) => string
  allowDownloads: boolean
  onClose: () => void
  onNavigate: (index: number) => void
  onDownload: (url: string, filename: string) => void
}

export function Viewer({ images, index, webUrl, originalUrl, allowDownloads, onClose, onNavigate, onDownload }: ViewerProps) {
  const img = images[index]
  const total = images.length

  const prev = useCallback(() => onNavigate((index - 1 + total) % total), [index, total, onNavigate])
  const next = useCallback(() => onNavigate((index + 1) % total), [index, total, onNavigate])

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

        <img className="viewer__img" src={webUrl(img)} alt="" />

        <button className="viewer__nav viewer__nav--next" onClick={next} aria-label="Next">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>

        <div className="viewer__bottom">
          <span className="viewer__counter">{index + 1} / {total}</span>
          {allowDownloads && (
            <button className="viewer__download" onClick={() => onDownload(originalUrl(img), img.filename)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Original
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
