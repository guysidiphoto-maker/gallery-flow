import { useEffect, useState, useCallback } from 'react'
import { supabase, storageUrl } from './supabase'
import type { Gallery, GalleryImage, Story, DeliverySettings } from './types'
import { Viewer } from './Viewer'
import { PasswordGate, isGalleryUnlocked } from './PasswordGate'

/** Safely read a delivery_settings field with a fallback default. */
function s<K extends keyof DeliverySettings>(settings: Partial<DeliverySettings>, key: K, fallback: DeliverySettings[K]): DeliverySettings[K] {
  const v = settings[key]
  return v === undefined || v === null ? fallback : v as DeliverySettings[K]
}

export function App() {
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  const galleryId = window.location.pathname.replace(/^\/gallery\//, '').replace(/\/$/, '')

  useEffect(() => {
    if (!galleryId || galleryId === '') {
      setError('No gallery ID in URL')
      return
    }
    loadGallery(galleryId)
  }, [galleryId])

  async function loadGallery(id: string) {
    const { data: g, error: ge } = await supabase
      .from('galleries')
      .select('*')
      .eq('id', id)
      .eq('status', 'live')
      .single()

    if (ge || !g) {
      setError('Gallery not found')
      return
    }
    setGallery(g)

    // Check if already unlocked via sessionStorage
    if (isGalleryUnlocked(id)) {
      setUnlocked(true)
    }

    const { data: imgs } = await supabase
      .from('images')
      .select('id, filename, storage_path, original_path, thumbnail_path, is_top_pick, sort_order')
      .eq('gallery_id', id)
      .order('sort_order', { ascending: true })

    setImages(imgs || [])

    const { data: st } = await supabase
      .from('stories')
      .select('*')
      .eq('gallery_id', id)

    // Only include stories whose video files actually exist in storage
    if (st && st.length > 0) {
      const verified: Story[] = []
      for (const story of st) {
        const url = storageUrl('gallery-stories', story.storage_path)
        try {
          const res = await fetch(url, { method: 'HEAD' })
          if (res.ok) verified.push(story)
        } catch { /* skip */ }
      }
      setStories(verified)
    }
  }

  const handleUnlock = useCallback(() => setUnlocked(true), [])

  if (error) {
    return (
      <div className="center-msg">
        <p>{error}</p>
      </div>
    )
  }

  if (!gallery) {
    return (
      <div className="center-msg">
        <div className="loader" />
      </div>
    )
  }

  // ── Resolve settings with backward-compatible defaults ──────────────────
  const raw: Partial<DeliverySettings> = (gallery.delivery_settings || {}) as Partial<DeliverySettings>

  const accessType       = s(raw, 'accessType', 'public')
  const password         = s(raw, 'password', null)
  const galleryTitle     = s(raw, 'galleryTitle', '') || gallery.name
  const clientName       = s(raw, 'clientName', '') || gallery.client_name
  const coverImageId     = s(raw, 'coverImageId', null)
  const layoutMode       = s(raw, 'layoutMode', '2-col')
  const imageSpacing     = s(raw, 'imageSpacing', 'small')
  const cornerStyle      = s(raw, 'cornerStyle', 'sharp')
  const studioName       = s(raw, 'studioName', '')
  const showFooterCredit = s(raw, 'showFooterCredit', true)
  const showStories      = s(raw, 'showStories', true)
  const downloadQuality  = s(raw, 'downloadQuality', 'original')

  // Backward compat: new downloadsEnabled falls back to old allowDownloads
  const downloadsEnabled = raw.downloadsEnabled !== undefined
    ? raw.downloadsEnabled
    : (raw as Record<string, unknown>).allowDownloads !== false

  // ── Password gate ──────────────────────────────────────────────────────
  if (accessType === 'password' && password && !unlocked) {
    return (
      <PasswordGate
        galleryId={gallery.id}
        galleryName={galleryTitle}
        password={password}
        onUnlock={handleUnlock}
      />
    )
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  function thumbUrl(img: GalleryImage) {
    return storageUrl('gallery-images', img.thumbnail_path || img.storage_path)
  }

  function webUrl(img: GalleryImage) {
    return storageUrl('gallery-images', img.storage_path)
  }

  function originalUrl(img: GalleryImage) {
    return storageUrl('gallery-images', img.original_path || img.storage_path)
  }

  function downloadUrl(img: GalleryImage) {
    if (downloadQuality === 'original') return originalUrl(img)
    // 'high' and 'web' both use the web-optimized storage_path
    return webUrl(img)
  }

  function storyUrl(st: Story) {
    return storageUrl('gallery-stories', st.storage_path)
  }

  function handleDownload(url: string, filename: string) {
    fetch(url)
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = filename
        a.click()
        URL.revokeObjectURL(a.href)
      })
  }

  // ── Cover image ─────────────────────────────────────────────────────────
  const coverImage = coverImageId ? images.find(img => img.id === coverImageId) : null
  const coverUrl = coverImage ? storageUrl('gallery-images', coverImage.storage_path) : null

  // ── Grid classes ────────────────────────────────────────────────────────
  const gridClasses = [
    'grid',
    `grid--${layoutMode}`,
    `grid--spacing-${imageSpacing}`,
    cornerStyle === 'rounded' ? 'grid--corners-rounded' : '',
  ].filter(Boolean).join(' ')

  // ── Footer visibility ──────────────────────────────────────────────────
  const showFooter = showFooterCredit || !!studioName
  const footerText = studioName || 'Delivered with Pixflow'

  // ── Should we show stories? ────────────────────────────────────────────
  const showStoriesSection = showStories !== false && stories.length > 0

  // ── Download label ─────────────────────────────────────────────────────
  const downloadLabel = downloadQuality === 'original' ? 'Download Original' : 'Download'

  return (
    <>
      {/* Hero */}
      <header className={coverUrl ? 'hero hero--cover' : 'hero'} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}>
        {coverUrl && <div className="hero__overlay" />}
        <h1 className="hero__title">{galleryTitle}</h1>
        {clientName && (
          <p className="hero__sub">{clientName}</p>
        )}
        <p className="hero__meta">{images.length} photos</p>
      </header>

      {/* Stories */}
      {showStoriesSection && (
        <section className="stories">
          <h2 className="stories__heading">Your Stories</h2>
          <div className="stories__row">
            {stories.map((st) => (
              <div key={st.id} className="story-card">
                <video
                  className="story-card__preview"
                  src={storyUrl(st)}
                  muted
                  playsInline
                  preload="metadata"
                  onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                  onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                />
                <span className="story-card__name">{st.style}</span>
                <button className="story-card__dl" onClick={() => handleDownload(storyUrl(st), `story_${st.style}.mp4`)}>
                  Download
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Grid */}
      <div className={gridClasses}>
        {images.map((img, i) => (
          <img
            key={img.id}
            className="grid__img"
            src={thumbUrl(img)}
            alt=""
            loading="lazy"
            onClick={() => setViewerIndex(i)}
          />
        ))}
      </div>

      {/* Footer */}
      {showFooter && (
        <footer className="footer">
          {footerText}
        </footer>
      )}

      {/* Fullscreen viewer */}
      {viewerIndex !== null && (
        <Viewer
          images={images}
          index={viewerIndex}
          webUrl={webUrl}
          downloadUrl={downloadUrl}
          allowDownloads={downloadsEnabled}
          downloadLabel={downloadLabel}
          onClose={() => setViewerIndex(null)}
          onNavigate={setViewerIndex}
          onDownload={handleDownload}
        />
      )}
    </>
  )
}
