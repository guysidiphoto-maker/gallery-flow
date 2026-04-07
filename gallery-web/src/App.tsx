import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase, storageUrl } from './supabase'
import type { Gallery, GalleryImage, GallerySection, Story, DeliverySettings } from './types'
import { Viewer } from './Viewer'
import { PasswordGate, isGalleryUnlocked } from './PasswordGate'

// ─── Order-preserving Masonry Grid ──────────────────────────────────────────

function useColumnCount(layoutMode: string): number {
  const [cols, setCols] = useState(2)
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth
      if (layoutMode === '1-col') { setCols(1); return }
      const base = layoutMode === '3-col' ? 3 : 2
      if (w < 480) setCols(Math.min(base, 2))
      else if (w < 768) setCols(base)
      else if (w < 1100) setCols(base + 1)
      else setCols(base + 2)
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [layoutMode])
  return cols
}

function MasonryGrid({ images, thumbUrl, layoutMode, imageSpacing, cornerStyle, onImageClick, onDownload, selectMode, selectedIds, onToggleSelect }: {
  images: GalleryImage[]
  thumbUrl: (img: GalleryImage) => string
  layoutMode: string
  imageSpacing: string
  cornerStyle: string
  onImageClick: (index: number) => void
  onDownload?: (img: GalleryImage) => void
  selectMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}) {
  const cols = useColumnCount(layoutMode)
  const [heights, setHeights] = useState<number[]>([])
  const imgRefs = useRef<Map<string, HTMLImageElement>>(new Map())

  // Distribute images into columns using shortest-column algorithm (preserves visual reading order)
  const columns = useMemo(() => {
    const result: Array<Array<{ img: GalleryImage; index: number }>> = Array.from({ length: cols }, () => [])
    const colHeights = new Array(cols).fill(0)

    for (let i = 0; i < images.length; i++) {
      // Find shortest column
      let shortest = 0
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[shortest]) shortest = c
      }
      result[shortest].push({ img: images[i], index: i })
      // Estimate height — use tracked height or assume 1:1
      const h = heights[i] || 1
      colHeights[shortest] += h
    }
    return result
  }, [images, cols, heights])

  const handleLoad = useCallback((index: number, el: HTMLImageElement) => {
    if (!el) return
    const ratio = el.naturalHeight / el.naturalWidth
    setHeights(prev => {
      if (prev[index] === ratio) return prev
      const next = [...prev]
      next[index] = ratio
      return next
    })
  }, [])

  const gap = imageSpacing === 'none' ? 0 : imageSpacing === 'medium' ? 10 : 4
  const rounded = cornerStyle === 'rounded'

  return (
    <div style={{
      display: 'flex',
      gap,
      padding: gap > 0 ? `0 ${gap}px` : 0,
      maxWidth: layoutMode === '1-col' ? 900 : undefined,
      margin: layoutMode === '1-col' ? '0 auto' : undefined,
    }}>
      {columns.map((col, ci) => (
        <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap }}>
          {col.map(({ img, index }) => {
            const isSelected = selectMode && selectedIds?.has(img.id)
            return (
              <div key={img.id} className="grid-item" style={{ position: 'relative', borderRadius: rounded ? 8 : 0, overflow: 'hidden' }}>
                <img
                  ref={el => { if (el) imgRefs.current.set(img.id, el) }}
                  src={thumbUrl(img)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: '100%', height: 'auto', display: 'block',
                    cursor: selectMode ? 'pointer' : 'pointer',
                    background: 'rgba(255,255,255,.03)',
                    transition: 'opacity .15s',
                    opacity: selectMode && !isSelected ? 0.6 : 1,
                  }}
                  onLoad={e => handleLoad(index, e.currentTarget)}
                  onClick={() => selectMode ? onToggleSelect?.(img.id) : onImageClick(index)}
                />
                {/* Selection checkbox */}
                {selectMode && (
                  <button
                    onClick={e => { e.stopPropagation(); onToggleSelect?.(img.id) }}
                    style={{
                      position: 'absolute', top: 8, left: 8,
                      width: 24, height: 24, borderRadius: '50%',
                      border: isSelected ? 'none' : '2px solid rgba(255,255,255,.6)',
                      background: isSelected ? '#6366f1' : 'rgba(0,0,0,.3)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backdropFilter: 'blur(4px)', transition: 'all .15s',
                    }}
                  >
                    {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                )}
                {/* Download button on hover */}
                {!selectMode && onDownload && (
                  <button
                    className="grid-item__dl"
                    onClick={e => { e.stopPropagation(); onDownload(img) }}
                    style={{
                      position: 'absolute', bottom: 8, right: 8,
                      width: 32, height: 32, borderRadius: '50%',
                      border: 'none', background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(8px)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'opacity .15s',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── Welcome Screen ─────────────────────────────────────────────────────────

function WelcomeScreen({ galleryTitle, clientName, studioName, studioWebsite, images, storageUrl: getUrl, onEnter }: {
  galleryTitle: string
  clientName: string
  studioName: string
  studioWebsite?: string
  images: GalleryImage[]
  storageUrl: (path: string) => string
  onEnter: () => void
}) {
  const [visible, setVisible] = useState(false)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleEnter = () => {
    setEntered(true)
    setTimeout(onEnter, 600)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: '#0a0a0c',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: entered ? 0 : 1, transition: 'opacity .6s ease',
      overflow: 'hidden',
    }}>
      {/* Background collage */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'grid',
        gridTemplateColumns: images.length >= 4 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
        gridTemplateRows: images.length >= 4 ? 'repeat(2, 1fr)' : '1fr',
        gap: 3, padding: 0,
        opacity: visible ? 0.25 : 0,
        transition: 'opacity 1.5s ease',
        filter: 'blur(1px)',
      }}>
        {images.map((img, i) => (
          <div key={img.id} style={{
            overflow: 'hidden',
            opacity: visible ? 1 : 0,
            transition: `opacity .8s ease ${0.1 + i * 0.15}s`,
          }}>
            <img
              src={getUrl(img.thumbnail_path || img.storage_path)}
              alt=""
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                transform: visible ? 'scale(1.05)' : 'scale(1.15)',
                transition: 'transform 8s ease',
              }}
            />
          </div>
        ))}
      </div>

      {/* Gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(10,10,12,.4) 0%, rgba(10,10,12,.85) 100%)',
      }} />

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 1, textAlign: 'center',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all .8s ease .3s',
      }}>
        {studioName && (
          studioWebsite ? (
            <a
              href={studioWebsite.startsWith('http') ? studioWebsite : `https://${studioWebsite}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,.5)', margin: '0 0 16px', fontWeight: 500,
                textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,.2)',
                paddingBottom: 2, transition: 'color .2s, border-color .2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,.8)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.5)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.2)' }}
              onClick={e => e.stopPropagation()}
            >
              {studioName}
            </a>
          ) : (
            <p style={{
              fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,.4)', margin: '0 0 16px', fontWeight: 500,
            }}>
              {studioName}
            </p>
          )
        )}

        <h1 style={{
          fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 700, color: '#fff',
          margin: '0 0 8px', lineHeight: 1.1, letterSpacing: '-0.02em',
        }}>
          {galleryTitle}
        </h1>

        {clientName && (
          <p style={{
            fontSize: 'clamp(14px, 2vw, 18px)', color: 'rgba(255,255,255,.5)',
            margin: '0 0 40px', fontWeight: 400,
          }}>
            {clientName}
          </p>
        )}

        <button
          onClick={handleEnter}
          style={{
            padding: '14px 48px', borderRadius: 50, border: '1px solid rgba(255,255,255,.2)',
            background: 'rgba(255,255,255,.08)', backdropFilter: 'blur(10px)',
            color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: '0.02em',
            transition: 'all .2s',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(10px)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.15)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.35)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.2)' }}
        >
          View Gallery
        </button>
      </div>
    </div>
  )
}

/** Safely read a delivery_settings field with a fallback default. */
function s<K extends keyof DeliverySettings>(settings: Partial<DeliverySettings>, key: K, fallback: DeliverySettings[K]): DeliverySettings[K] {
  const v = settings[key]
  return v === undefined || v === null ? fallback : v as DeliverySettings[K]
}

// ─── Sticky section nav (Pixieset-style) ───────────────────────────────────
function SectionNav({
  sections,
  activeId,
  onJump,
}: {
  sections: GallerySection[]
  activeId: string
  onJump: (id: string) => void
}) {
  return (
    <nav className="section-nav">
      <div className="section-nav__inner">
        <button
          className={`section-nav__item ${activeId === 'all-images' ? 'section-nav__item--active' : ''}`}
          onClick={() => onJump('all-images')}
        >
          All Images
        </button>
        {sections.map(sec => {
          const id = `section-${sec.id}`
          return (
            <button
              key={sec.id}
              className={`section-nav__item ${activeId === id ? 'section-nav__item--active' : ''}`}
              onClick={() => onJump(id)}
            >
              {sec.name}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function App() {
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [sections, setSections] = useState<GallerySection[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [dlProgress, setDlProgress] = useState<string | null>(null)
  const [activeSectionAnchor, setActiveSectionAnchor] = useState<string>('all-images')

  const galleryId = window.location.pathname.replace(/^\/gallery\//, '').replace(/\/$/, '')

  useEffect(() => {
    if (!galleryId || galleryId === '') {
      setError('No gallery ID in URL')
      return
    }
    loadGallery(galleryId)
  }, [galleryId])

  // Scroll-spy: track which section is in view and update activeSectionAnchor.
  // We watch the All Images section + every section block. The first one
  // intersecting wins.
  useEffect(() => {
    if (sections.length === 0 || showWelcome) return
    const ids = ['all-images', ...sections.map(sec => `section-${sec.id}`)]
    const elements = ids
      .map(id => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport that's currently
        // intersecting. Sort by boundingClientRect.top so a section that's
        // crossing the nav line is preferred over one already deep in view.
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) {
          setActiveSectionAnchor(visible[0].target.id)
        }
      },
      {
        // The observer fires when a section's top is between 70px from the
        // top of the viewport and 60% of the viewport height.
        rootMargin: '-70px 0px -40% 0px',
        threshold: 0,
      }
    )

    elements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [sections, showWelcome, images])

  // On first load, if the URL has a hash (e.g. #section-abc), scroll to it
  // once the masonry has rendered.
  useEffect(() => {
    if (showWelcome || images.length === 0) return
    const hash = window.location.hash.replace('#', '')
    if (!hash) return
    // Wait one tick so the masonry can paint and the IDs are mounted.
    const id = setTimeout(() => {
      const el = document.getElementById(hash)
      if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' })
    }, 50)
    return () => clearTimeout(id)
  }, [showWelcome, images.length])

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
      .select('id, filename, storage_path, original_path, thumbnail_path, is_top_pick, sort_order, section_id')
      .eq('gallery_id', id)
      .order('sort_order', { ascending: true })

    setImages(imgs || [])

    // Fetch sections (may be empty for galleries published before sections existed)
    const { data: secs } = await supabase
      .from('gallery_sections')
      .select('id, name, sort_order')
      .eq('gallery_id', id)
      .order('sort_order', { ascending: true })

    setSections(secs || [])

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
  const studioWebsite    = (raw as Record<string, unknown>).studioWebsite as string || ''
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

  // ── Welcome screen (collage of top picks) ──────────────────────────────
  const topPicks = images.filter(img => img.is_top_pick)
  const welcomeImages = topPicks.length >= 3 ? topPicks.slice(0, 6) : images.slice(0, 6)

  if (showWelcome && images.length > 0) {
    return (
      <WelcomeScreen
        galleryTitle={galleryTitle}
        clientName={clientName || ''}
        studioName={studioName}
        studioWebsite={studioWebsite}
        images={welcomeImages}
        storageUrl={(path: string) => storageUrl('gallery-images', path)}
        onEnter={() => setShowWelcome(false)}
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
    if (img.original_path) {
      return storageUrl('gallery-images', img.original_path)
    }
    return storageUrl('gallery-images', img.storage_path)
  }

  function downloadUrl(img: GalleryImage) {
    // 'original' and 'high' → serve original full-res file when available
    if (downloadQuality === 'original' || downloadQuality === 'high') return originalUrl(img)
    // 'web' → compressed web preview
    return webUrl(img)
  }

  function storyUrl(st: Story) {
    return storageUrl('gallery-stories', st.storage_path)
  }

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  async function handleDownload(url: string, filename: string) {
    const res = await fetch(url)
    const blob = await res.blob()

    // Mobile: use Web Share API → opens native share sheet → "Save to Photos"
    if (isMobile && navigator.share) {
      try {
        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
        await navigator.share({ files: [file] })
        return
      } catch {
        // User cancelled or share failed — fall through to regular download
      }
    }

    // Desktop / fallback: regular download
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function handleBatchDownload(imgs: GalleryImage[]) {
    setDlProgress(`Downloading ${imgs.length} photos...`)
    for (let i = 0; i < imgs.length; i++) {
      setDlProgress(`Downloading ${i + 1} / ${imgs.length}...`)
      handleDownload(downloadUrl(imgs[i]), imgs[i].filename)
      // Small delay between downloads to avoid browser blocking
      if (imgs.length > 1) await new Promise(r => setTimeout(r, 300))
    }
    setDlProgress(null)
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

  // ── Download label (smart: only say "Original" if originals are actually available) ──
  const someOriginalsReady = images.some(img => img.original_path)
  const downloadLabel = isMobile
    ? (downloadQuality === 'original' && someOriginalsReady ? 'Save Original' : 'Save')
    : (downloadQuality === 'original' && someOriginalsReady ? 'Download Original' : 'Download')

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

      {/* Sticky section nav — placed BEFORE the download toolbar so the
          toolbar stacks below it without z-index conflict. */}
      {sections.length > 0 && (
        <SectionNav
          sections={sections.filter(sec => images.some(im => im.section_id === sec.id))}
          activeId={activeSectionAnchor}
          onJump={(id) => {
            const el = document.getElementById(id)
            if (!el) return
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            history.replaceState(null, '', '#' + id)
          }}
        />
      )}

      {/* Download / Select toolbar */}
      {downloadsEnabled && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '12px 16px', position: 'sticky', top: sections.length > 0 ? 48 : 0, zIndex: 50,
          background: 'rgba(10,10,12,.85)', backdropFilter: 'blur(10px)',
        }}>
          <button
            onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
            style={{
              padding: '6px 16px', borderRadius: 8,
              border: selectMode ? '1px solid #6366f1' : '1px solid rgba(255,255,255,.12)',
              background: selectMode ? 'rgba(99,102,241,.15)' : 'transparent',
              color: selectMode ? '#a5b4fc' : 'rgba(255,255,255,.6)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {selectMode ? `${selectedIds.size} selected` : 'Select Photos'}
          </button>
          {selectMode && selectedIds.size > 0 && (
            <button
              onClick={() => {
                handleBatchDownload(images.filter(img => selectedIds.has(img.id)))
                setSelectMode(false); setSelectedIds(new Set())
              }}
              style={{
                padding: '6px 16px', borderRadius: 8, border: 'none',
                background: '#6366f1', color: '#fff',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {isMobile ? 'Save' : 'Download'} {selectedIds.size}
            </button>
          )}
          {!selectMode && (
            <button
              onClick={() => handleBatchDownload(images)}
              disabled={!!dlProgress}
              style={{
                padding: '6px 16px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,.12)',
                background: 'transparent', color: 'rgba(255,255,255,.6)',
                fontSize: 12, fontWeight: 500, cursor: dlProgress ? 'wait' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: dlProgress ? 0.5 : 1,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {dlProgress || (isMobile ? 'Save All' : 'Download All')}
            </button>
          )}
          {selectMode && (
            <button
              onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none',
                background: 'transparent', color: 'rgba(255,255,255,.35)',
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Cancel</button>
          )}
        </div>
      )}

      {/* All Images section */}
      <section id="all-images" className="gallery-section gallery-section--all">
        {sections.length > 0 && (
          <h2 className="gallery-section__heading">
            <span className="gallery-section__name">All Images</span>
            <span className="gallery-section__count">{images.length} {images.length === 1 ? 'photo' : 'photos'}</span>
          </h2>
        )}
        <MasonryGrid
          images={images}
          thumbUrl={thumbUrl}
          layoutMode={layoutMode}
          imageSpacing={imageSpacing}
          cornerStyle={cornerStyle}
          onImageClick={setViewerIndex}
          onDownload={downloadsEnabled ? (img) => handleDownload(downloadUrl(img), img.filename) : undefined}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={(id) => setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
          })}
        />
      </section>

      {sections.length > 0 && sections.map(sec => {
        const sectionImages = images.filter(img => img.section_id === sec.id)
        if (sectionImages.length === 0) return null
        return (
          <section key={sec.id} id={`section-${sec.id}`} className="gallery-section">
            <h2 className="gallery-section__heading">
              <span className="gallery-section__name">{sec.name}</span>
              <span className="gallery-section__count">{sectionImages.length} {sectionImages.length === 1 ? 'photo' : 'photos'}</span>
            </h2>
            <MasonryGrid
              images={sectionImages}
              thumbUrl={thumbUrl}
              layoutMode={layoutMode}
              imageSpacing={imageSpacing}
              cornerStyle={cornerStyle}
              onImageClick={(idx) => {
                // Map the section-local index back to the global images array
                // index so the fullscreen viewer keeps working with the same list.
                const target = sectionImages[idx]
                const globalIdx = images.findIndex(im => im.id === target.id)
                setViewerIndex(globalIdx >= 0 ? globalIdx : null)
              }}
              onDownload={downloadsEnabled ? (img) => handleDownload(downloadUrl(img), img.filename) : undefined}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={(id) => setSelectedIds(prev => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id); else next.add(id)
                return next
              })}
            />
          </section>
        )
      })}

      {/* Footer */}
      {showFooter && (
        <footer className="footer">
          {studioName && studioWebsite ? (
            <a href={studioWebsite.startsWith('http') ? studioWebsite : `https://${studioWebsite}`}
              target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,.15)' }}
            >{studioName}</a>
          ) : footerText}
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
