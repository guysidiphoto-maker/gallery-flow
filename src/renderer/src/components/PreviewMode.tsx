import React, { useState, useEffect, useCallback } from 'react'
import { useGallery } from '../store/gallery'
import { toLocalURL } from '../utils/imageUtils'

export function PreviewMode() {
  const { images, showPreviewMode, togglePreviewMode } = useGallery()
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  // Sort images by filename for preview (reflects what client sees after download)
  const sorted = [...images].sort((a, b) => a.filename.localeCompare(b.filename))

  const openLightbox = (idx: number) => setLightboxIdx(idx)
  const closeLightbox = () => setLightboxIdx(null)

  const prev = useCallback(() => {
    setLightboxIdx(i => (i === null ? null : Math.max(0, i - 1)))
  }, [])

  const next = useCallback(() => {
    setLightboxIdx(i => (i === null ? null : Math.min(sorted.length - 1, i + 1)))
  }, [sorted.length])

  useEffect(() => {
    if (!showPreviewMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxIdx !== null) closeLightbox()
        else togglePreviewMode()
      }
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showPreviewMode, lightboxIdx, prev, next, togglePreviewMode])

  if (!showPreviewMode) return null

  return (
    <div className="preview-mode">
      {/* Header */}
      <div className="preview-mode__header">
        <div className="preview-mode__title">
          <span>Client Preview</span>
          <span className="preview-mode__subtitle">
            {sorted.length} images · sorted by filename
          </span>
        </div>
        <button
          className="btn btn--ghost"
          onClick={togglePreviewMode}
        >
          Close Preview
        </button>
      </div>

      {/* Gallery */}
      <div className="preview-mode__grid">
        {sorted.map((image, idx) => (
          <div
            key={image.id}
            className="preview-mode__item"
            onClick={() => openLightbox(idx)}
          >
            <img
              src={toLocalURL(image.path)}
              alt={image.filename}
              loading="lazy"
              draggable={false}
            />
            <div className="preview-mode__item-num">{idx + 1}</div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div className="lightbox" onClick={closeLightbox}>
          <div className="lightbox__nav lightbox__nav--prev" onClick={e => { e.stopPropagation(); prev() }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </div>

          <div className="lightbox__content" onClick={e => e.stopPropagation()}>
            <img
              src={toLocalURL(sorted[lightboxIdx].path)}
              alt={sorted[lightboxIdx].filename}
              draggable={false}
            />
            <div className="lightbox__caption">
              <span>{lightboxIdx + 1} / {sorted.length}</span>
              <span>{sorted[lightboxIdx].filename}</span>
            </div>
          </div>

          <div className="lightbox__nav lightbox__nav--next" onClick={e => { e.stopPropagation(); next() }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>

          <button className="lightbox__close" onClick={closeLightbox}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
