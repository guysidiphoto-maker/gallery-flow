import React, { useState, useEffect, useCallback, useRef } from 'react'
import { toLocalURL } from '../utils/imageUtils'
import type { ImageFile } from '../types'

interface ClientGalleryPageProps {
  projectName: string
  clientName: string | null
  images: ImageFile[]
  onBack: () => void
  onExport: () => void
}

export function ClientGalleryPage({ projectName, clientName, images, onBack, onExport }: ClientGalleryPageProps) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [slideshow, setSlideshow] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const touchStartX = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const slideshowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Download all as zip (via IPC)
  const downloadAll = async () => {
    const destPath = await window.api.chooseExportPath?.(`${projectName}.zip`)
    if (!destPath) return
    // For now, trigger full export
    onExport()
  }

  // Slideshow
  useEffect(() => {
    if (!slideshow || viewerIndex === null) return
    slideshowTimer.current = setTimeout(() => {
      setViewerIndex(i => i !== null ? (i + 1) % displayImages.length : null)
    }, 4000)
    return () => { if (slideshowTimer.current) clearTimeout(slideshowTimer.current) }
  }, [slideshow, viewerIndex, displayImages.length])

  const startSlideshow = () => {
    setViewerIndex(0)
    setSlideshow(true)
  }

  const stopSlideshow = () => {
    setSlideshow(false)
    if (slideshowTimer.current) clearTimeout(slideshowTimer.current)
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
    if (e.key === 'Escape') { setViewerIndex(null); stopSlideshow() }
    if (e.key === 'ArrowRight') { stopSlideshow(); setViewerIndex(i => i !== null ? (i + 1) % displayImages.length : null) }
    if (e.key === 'ArrowLeft') { stopSlideshow(); setViewerIndex(i => i !== null ? (i - 1 + displayImages.length) % displayImages.length : null) }
    if (e.key === 'f' || e.key === 'F') {
      const img = displayImages[viewerIndex]
      if (img) toggleFavorite(img.id)
    }
    if (e.key === ' ') { e.preventDefault(); setSlideshow(s => !s) }
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
      stopSlideshow()
      setViewerIndex(i => {
        if (i === null) return null
        return dx < 0 ? (i + 1) % displayImages.length : (i - 1 + displayImages.length) % displayImages.length
      })
    }
  }

  const coverImage = images.length > 0 ? images[0] : null
  const currentViewerImage = viewerIndex !== null ? displayImages[viewerIndex] : null

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
                <button className="cg__hero-btn" onClick={startSlideshow}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  Slideshow
                </button>
                <button className="cg__hero-btn cg__hero-btn--ghost" onClick={onExport}>
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

        {/* Filter bar */}
        {favoriteIds.size > 0 && (
          <div className="cg__filter-bar">
            <button
              className={`cg__filter-chip ${!showFavoritesOnly ? 'cg__filter-chip--active' : ''}`}
              onClick={() => setShowFavoritesOnly(false)}
            >
              All ({images.length})
            </button>
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
              {/* Favorite heart — always visible on favorited, hover on others */}
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
              <span className="cg__float-count">{selectedIds.size} selected</span>
              <div className="cg__float-actions">
                <button className="cg__float-btn" disabled={selectedIds.size === 0}>
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
                <button className="cg__float-ghost" onClick={startSlideshow}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Fullscreen Viewer */}
      {viewerIndex !== null && currentViewerImage && (
        <div
          className={`cg__viewer ${slideshow ? 'cg__viewer--slideshow' : ''}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => { if (e.target === e.currentTarget) { setViewerIndex(null); stopSlideshow() } }}
        >
          <img
            className="cg__viewer-img"
            src={toLocalURL(currentViewerImage.path)}
            alt=""
            key={viewerIndex}
          />

          {/* Slideshow progress bar */}
          {slideshow && <div className="cg__viewer-progress" key={`prog-${viewerIndex}`} />}

          {/* Top bar */}
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
              <button className="cg__viewer-close" onClick={() => { setViewerIndex(null); stopSlideshow() }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Nav arrows */}
          {!slideshow && (
            <>
              <button
                className="cg__viewer-nav cg__viewer-prev"
                onClick={() => { stopSlideshow(); setViewerIndex((viewerIndex - 1 + displayImages.length) % displayImages.length) }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <button
                className="cg__viewer-nav cg__viewer-next"
                onClick={() => { stopSlideshow(); setViewerIndex((viewerIndex + 1) % displayImages.length) }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 6 15 12 9 18"/>
                </svg>
              </button>
            </>
          )}

          {/* Bottom bar */}
          <div className="cg__viewer-bottom">
            {slideshow ? (
              <button className="cg__viewer-slide-toggle" onClick={stopSlideshow}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                </svg>
                Pause
              </button>
            ) : (
              <button className="cg__viewer-download" onClick={() => downloadImage(currentViewerImage)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
