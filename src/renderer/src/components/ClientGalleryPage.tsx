import React, { useState, useEffect, useCallback, useRef } from 'react'
import { toLocalURL } from '../utils/imageUtils'
import type { ImageFile } from '../types'

interface ClientGalleryPageProps {
  projectName: string
  clientName: string | null
  images: ImageFile[]
  onBack: () => void
  onExport: () => void
  storyPaths?: string[]
}

export function ClientGalleryPage({ projectName, clientName, images, onBack, onExport, storyPaths }: ClientGalleryPageProps) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [scrolled, setScrolled] = useState(false)

  const touchStartX = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const displayImages = showFavoritesOnly ? images.filter(i => favoriteIds.has(i.id)) : images

  // Favorites
  const toggleFavorite = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setFavoriteIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Selection
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cancelSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const handleImageClick = (index: number) => {
    if (selectionMode) {
      toggleSelection(displayImages[index].id)
    } else {
      setViewerIndex(index)
    }
  }

  // Download single image
  const downloadImage = (img: ImageFile) => {
    const a = document.createElement('a')
    a.href = toLocalURL(img.path)
    a.download = img.filename
    a.click()
  }

  // Track scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setScrolled(el.scrollTop > 300)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Keyboard
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (viewerIndex === null) return
    if (e.key === 'Escape') setViewerIndex(null)
    if (e.key === 'ArrowRight') setViewerIndex(i => i !== null ? (i + 1) % displayImages.length : null)
    if (e.key === 'ArrowLeft') setViewerIndex(i => i !== null ? (i - 1 + displayImages.length) % displayImages.length : null)
    if (e.key === 'f' || e.key === 'F') {
      const img = displayImages[viewerIndex]
      if (img) toggleFavorite(img.id)
    }
  }, [viewerIndex, displayImages])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Touch
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) {
      setViewerIndex(i => {
        if (i === null) return null
        return dx < 0 ? (i + 1) % displayImages.length : (i - 1 + displayImages.length) % displayImages.length
      })
    }
  }

  const coverImage = images.length > 0 ? images[0] : null
  const currentViewerImage = viewerIndex !== null ? displayImages[viewerIndex] : null
  const selectedCount = selectedIds.size

  return (
    <div className="cg">
      <div className="cg__scroll" ref={scrollRef}>

        {/* Hero */}
        {coverImage && (
          <div className="cg__hero">
            <img className="cg__hero-img" src={toLocalURL(coverImage.path)} alt="" />
            <div className="cg__hero-overlay" />
            <div className="cg__hero-content">
              <h1 className="cg__hero-title">{projectName}</h1>
              {clientName && <p className="cg__hero-client">{clientName}</p>}
              <p className="cg__hero-count">{images.length} photos</p>
              <div className="cg__hero-actions">
                <button className="cg__hero-btn" onClick={onExport}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download All
                </button>
              </div>
            </div>
            <button className="cg__hero-back" onClick={onBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          </div>
        )}

        {/* Ready Stories */}
        {storyPaths && storyPaths.length > 0 && (
          <div className="cg__stories-section">
            <h2 className="cg__stories-title">Your Stories</h2>
            <p className="cg__stories-sub">Ready to share on Instagram</p>
            <div className="cg__stories-row">
              {storyPaths.map((path, i) => {
                const styleName = path.split('_').pop()?.replace('.mp4', '') || ''
                const displayName = styleName.charAt(0).toUpperCase() + styleName.slice(1)
                return (
                  <div key={i} className="cg__stories-card">
                    <div className="cg__stories-preview">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                    </div>
                    <span className="cg__stories-name">{displayName}</span>
                    <a className="cg__stories-download" href={toLocalURL(path)} download>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      Download
                    </a>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Filter bar */}
        {favoriteIds.size > 0 && (
          <div className="cg__filter-bar">
            <button
              className={`cg__filter-chip ${!showFavoritesOnly ? 'cg__filter-chip--active' : ''}`}
              onClick={() => setShowFavoritesOnly(false)}
            >All ({images.length})</button>
            <button
              className={`cg__filter-chip ${showFavoritesOnly ? 'cg__filter-chip--active' : ''}`}
              onClick={() => setShowFavoritesOnly(true)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              Favorites ({favoriteIds.size})
            </button>
          </div>
        )}

        {/* Grid */}
        <div className="cg__grid">
          {displayImages.map((img, i) => (
            <div
              key={img.id}
              className={`cg__thumb ${selectedIds.has(img.id) ? 'cg__thumb--selected' : ''}`}
              onClick={() => handleImageClick(i)}
              style={{ animationDelay: `${Math.min(i * 30, 600)}ms` }}
            >
              <img src={toLocalURL(img.path)} alt="" loading="lazy" />
              {!selectionMode && (
                <button
                  className={`cg__thumb-heart ${favoriteIds.has(img.id) ? 'cg__thumb-heart--active' : ''}`}
                  onClick={e => toggleFavorite(img.id, e)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={favoriteIds.has(img.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                </button>
              )}
              {selectionMode && (
                <div className="cg__thumb-check">
                  {selectedIds.has(img.id) && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="cg__footer">Delivered with Pixflow</div>
      </div>

      {/* Floating bar */}
      {(scrolled || selectionMode) && !viewerIndex && (
        <div className={`cg__float-bar ${selectionMode ? 'cg__float-bar--sel' : ''}`}>
          {selectionMode ? (
            <>
              <span className="cg__float-count">{selectedCount} selected</span>
              <div className="cg__float-actions">
                <button className="cg__float-btn" disabled={selectedCount === 0}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download
                </button>
                <button className="cg__float-cancel" onClick={cancelSelection}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <span className="cg__float-title">{projectName}</span>
              <div className="cg__float-actions">
                <button className="cg__float-ghost" onClick={() => setSelectionMode(true)}>Select</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Fullscreen Viewer */}
      {viewerIndex !== null && currentViewerImage && (
        <div
          className="cg__viewer"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => { if (e.target === e.currentTarget) setViewerIndex(null) }}
        >
          <img className="cg__viewer-img" src={toLocalURL(currentViewerImage.path)} alt="" key={viewerIndex} />
          <div className="cg__viewer-top">
            <div className="cg__viewer-counter">{viewerIndex + 1} / {displayImages.length}</div>
            <div className="cg__viewer-top-actions">
              <button
                className={`cg__viewer-fav ${favoriteIds.has(currentViewerImage.id) ? 'cg__viewer-fav--active' : ''}`}
                onClick={() => toggleFavorite(currentViewerImage.id)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={favoriteIds.has(currentViewerImage.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
              <button className="cg__viewer-close" onClick={() => setViewerIndex(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
          <button
            className="cg__viewer-nav cg__viewer-prev"
            onClick={() => setViewerIndex((viewerIndex - 1 + displayImages.length) % displayImages.length)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <button
            className="cg__viewer-nav cg__viewer-next"
            onClick={() => setViewerIndex((viewerIndex + 1) % displayImages.length)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 6 15 12 9 18"/>
            </svg>
          </button>
          <div className="cg__viewer-bottom">
            <button className="cg__viewer-download" onClick={() => downloadImage(currentViewerImage)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
