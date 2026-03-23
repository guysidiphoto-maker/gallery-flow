import React, { useEffect, useCallback } from 'react'
import { useGallery } from '../store/gallery'
import { toLocalURL } from '../utils/imageUtils'

export function ImageViewer() {
  const {
    images,
    viewerImageId,
    closeViewer,
    viewerNavigate,
    topPickIds,
    toggleTopPick
  } = useGallery()

  const currentIndex = viewerImageId !== null
    ? images.findIndex(img => img.id === viewerImageId)
    : -1
  const image = currentIndex !== -1 ? images[currentIndex] : null
  const isTopPick = image ? topPickIds.has(image.id) : false

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!image) return
    // Don't capture when typing in inputs
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        viewerNavigate('next')
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        viewerNavigate('prev')
        break
      case 'Escape':
        e.preventDefault()
        closeViewer()
        break
      case 't':
      case 'T':
        e.preventDefault()
        // Speed review: mark as pick (moves to top) if not already, then advance
        if (!isTopPick) {
          toggleTopPick(image.id)
        }
        viewerNavigate('next')
        break
    }
  }, [image, isTopPick, viewerNavigate, closeViewer, toggleTopPick])

  useEffect(() => {
    if (!viewerImageId) return
    window.addEventListener('keydown', handleKeyDown, true)  // capture phase to intercept before gallery shortcuts
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [viewerImageId, handleKeyDown])

  if (!viewerImageId || !image) return null

  return (
    <div className="viewer-backdrop" onClick={closeViewer}>
      <div className="viewer" onClick={e => e.stopPropagation()}>

        {/* Top bar */}
        <div className="viewer__top-bar">
          <span className="viewer__index">{currentIndex + 1} / {images.length}</span>
          {isTopPick && <span className="viewer__pick-badge">★ Top Pick</span>}
          <div style={{ flex: 1 }} />
          <button className="viewer__close-btn" onClick={closeViewer} title="Close (Esc)">✕</button>
        </div>

        {/* Image */}
        <div className="viewer__image-wrap">
          <img
            src={toLocalURL(image.path)}
            alt={image.filename}
            className="viewer__image"
            draggable={false}
          />
        </div>

        {/* Prev / Next nav */}
        <button
          className="viewer__nav viewer__nav--prev"
          onClick={e => { e.stopPropagation(); viewerNavigate('prev') }}
          disabled={currentIndex === 0}
          title="Previous (←)"
        >
          ‹
        </button>
        <button
          className="viewer__nav viewer__nav--next"
          onClick={e => { e.stopPropagation(); viewerNavigate('next') }}
          disabled={currentIndex === images.length - 1}
          title="Next (→)"
        >
          ›
        </button>

        {/* Bottom bar */}
        <div className="viewer__bottom-bar">
          <span className="viewer__filename">{image.filename}</span>
          <button
            className={`viewer__pick-btn ${isTopPick ? 'active' : ''}`}
            onClick={e => { e.stopPropagation(); toggleTopPick(image.id) }}
            title={isTopPick ? 'Remove from Top Picks' : 'Mark as Top Pick (T)'}
          >
            {isTopPick ? '★ Top Pick' : '☆ Mark as Top Pick (T)'}
          </button>
        </div>
      </div>
    </div>
  )
}
