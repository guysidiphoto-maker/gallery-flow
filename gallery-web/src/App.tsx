import { useEffect, useState } from 'react'
import { supabase, storageUrl } from './supabase'
import type { Gallery, GalleryImage, Story } from './types'
import { Viewer } from './Viewer'

export function App() {
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

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

    const { data: imgs } = await supabase
      .from('images')
      .select('id, filename, storage_path, thumbnail_path, is_top_pick, sort_order')
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
      for (const s of st) {
        const url = storageUrl('gallery-stories', s.storage_path)
        try {
          const res = await fetch(url, { method: 'HEAD' })
          if (res.ok) verified.push(s)
        } catch { /* skip */ }
      }
      setStories(verified)
    }
  }

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

  const settings = gallery.delivery_settings || {}
  const allowDownloads = settings.allowDownloads !== false

  function thumbUrl(img: GalleryImage) {
    return storageUrl('gallery-images', img.thumbnail_path || img.storage_path)
  }

  function webUrl(img: GalleryImage) {
    return storageUrl('gallery-images', img.storage_path)
  }

  function originalUrl(img: GalleryImage) {
    return storageUrl('gallery-images', img.original_path || img.storage_path)
  }

  function storyUrl(s: Story) {
    return storageUrl('gallery-stories', s.storage_path)
  }

  const studioName = (settings.studioName as string) || null

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

  return (
    <>
      {/* Hero */}
      <header className="hero">
        <h1 className="hero__title">{gallery.name}</h1>
        {gallery.client_name && (
          <p className="hero__sub">{gallery.client_name}</p>
        )}
        <p className="hero__meta">{images.length} photos</p>
      </header>

      {/* Stories */}
      {stories.length > 0 && (
        <section className="stories">
          <h2 className="stories__heading">Your Stories</h2>
          <div className="stories__row">
            {stories.map((s) => (
              <div key={s.id} className="story-card">
                <video
                  className="story-card__preview"
                  src={storyUrl(s)}
                  muted
                  playsInline
                  preload="metadata"
                  onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                  onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                />
                <span className="story-card__name">{s.style}</span>
                <button className="story-card__dl" onClick={() => handleDownload(storyUrl(s), `story_${s.style}.mp4`)}>
                  Download
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Grid */}
      <div className="grid">
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
      <footer className="footer">
        {studioName || 'Delivered with Pixflow'}
      </footer>

      {/* Fullscreen viewer */}
      {viewerIndex !== null && (
        <Viewer
          images={images}
          index={viewerIndex}
          webUrl={webUrl}
          originalUrl={originalUrl}
          allowDownloads={allowDownloads}
          onClose={() => setViewerIndex(null)}
          onNavigate={setViewerIndex}
          onDownload={handleDownload}
        />
      )}
    </>
  )
}
