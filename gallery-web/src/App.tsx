import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase, storageUrl } from './supabase'
import type { Gallery, GalleryImage, GallerySection, Story, DeliverySettings } from './types'
import { Viewer } from './Viewer'
import { PasswordGate, isGalleryUnlocked } from './PasswordGate'
import { FaceSearchExperience } from './components/FaceSearchExperience'

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

function MasonryGrid({ images, thumbUrl, layoutMode, imageSpacing, cornerStyle, onImageClick, onDownload, selectMode, selectedIds, onToggleSelect, clientMode, hiddenIds, onToggleHide }: {
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
  clientMode?: boolean
  hiddenIds?: Set<string>
  onToggleHide?: (id: string) => void
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
                    cursor: 'pointer',
                    background: 'linear-gradient(135deg, rgba(255,255,255,.02), rgba(255,255,255,.05))',
                    transition: 'opacity .35s ease, transform .4s cubic-bezier(.16,1,.3,1), filter .3s ease',
                    opacity: selectMode && !isSelected ? 0.55 : (clientMode && hiddenIds?.has(img.id)) ? 0.3 : 1,
                    filter: selectMode && !isSelected ? 'saturate(0.6)' : 'none',
                  }}
                  onLoad={e => { handleLoad(index, e.currentTarget); e.currentTarget.style.animation = 'none' }}
                  onClick={() => selectMode ? onToggleSelect?.(img.id) : onImageClick(index)}
                />
                {/* Selection checkbox */}
                {selectMode && (
                  <button
                    onClick={e => { e.stopPropagation(); onToggleSelect?.(img.id) }}
                    style={{
                      position: 'absolute', top: 10, left: 10,
                      width: 28, height: 28, borderRadius: '50%',
                      border: isSelected ? '2px solid #818cf8' : '2px solid rgba(255,255,255,.5)',
                      background: isSelected ? 'linear-gradient(135deg, #6366f1, #818cf8)' : 'rgba(0,0,0,.4)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                      transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                      transform: isSelected ? 'scale(1)' : 'scale(0.9)',
                      boxShadow: isSelected ? '0 2px 12px rgba(99,102,241,.4)' : '0 2px 8px rgba(0,0,0,.3)',
                    }}
                  >
                    {isSelected && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                )}
                {/* Client hide/unhide button */}
                {clientMode && onToggleHide && (
                  <button
                    className="grid-item__dl"
                    onClick={e => { e.stopPropagation(); onToggleHide(img.id) }}
                    style={{
                      position: 'absolute', top: 10, right: 10,
                      width: 34, height: 34, borderRadius: '50%',
                      border: hiddenIds?.has(img.id) ? '1.5px solid rgba(239,68,68,.4)' : '1px solid rgba(255,255,255,.1)',
                      background: hiddenIds?.has(img.id) ? 'rgba(239,68,68,.75)' : 'rgba(0,0,0,.45)',
                      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: hiddenIds?.has(img.id) ? 1 : undefined,
                      transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                      boxShadow: hiddenIds?.has(img.id) ? '0 2px 10px rgba(239,68,68,.3)' : '0 2px 8px rgba(0,0,0,.2)',
                    }}
                  >
                    {hiddenIds?.has(img.id) ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                )}
                {/* Download button on hover */}
                {!selectMode && onDownload && (
                  <button
                    className="grid-item__dl"
                    onClick={e => { e.stopPropagation(); onDownload(img) }}
                    style={{
                      position: 'absolute', bottom: 10, right: 10,
                      width: 34, height: 34, borderRadius: '50%',
                      border: '1px solid rgba(255,255,255,.1)',
                      background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                      boxShadow: '0 2px 8px rgba(0,0,0,.25)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,.7)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.5)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,.45)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)' }}
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

function WelcomeScreen({ style = 'mosaic', galleryTitle, galleryDescription, eventDate, eventLocation, clientName, studioName, studioWebsite, images, storageUrl: getUrl, coverImageUrl, coverCrop, onEnter, faceSearchAvailable, facePrivacyMode, onFindMyPhotos }: {
  style?: 'mosaic' | 'cinematic' | 'minimal'
  galleryTitle: string
  galleryDescription?: string
  eventDate?: string
  eventLocation?: string
  clientName: string
  studioName: string
  studioWebsite?: string
  images: GalleryImage[]
  storageUrl: (path: string) => string
  coverImageUrl?: string | null
  coverCrop?: { zoom: number; x: number; y: number } | null
  onEnter: () => void
  faceSearchAvailable: boolean
  facePrivacyMode: 'open' | 'private' | null
  onFindMyPhotos: () => void
}) {
  const [visible, setVisible] = useState(false)
  const [entered, setEntered] = useState(false)

  const isPrivate = faceSearchAvailable && facePrivacyMode === 'private'
  const showFindButton = faceSearchAvailable && facePrivacyMode !== null

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleEnter = () => {
    setEntered(true)
    setTimeout(onEnter, 600)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: '#000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: entered ? 0 : 1, transition: 'opacity .7s ease',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes wcFadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wcGlow { 0%, 100% { box-shadow: 0 0 24px rgba(99,102,241,.3); } 50% { box-shadow: 0 0 48px rgba(99,102,241,.5), 0 0 80px rgba(99,102,241,.15); } }
        @keyframes wcFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes wcLine { from { left: -30%; } to { left: 130%; } }
        @keyframes wcScroll { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        .wc-col { display: flex; flex-direction: column; gap: 2px; }
        .wc-col img {
          width: 100%; aspect-ratio: 3/4; object-fit: cover; display: block;
          opacity: 0; transition: opacity .6s ease;
        }
        .wc-col img.wc-loaded { opacity: 1; }
      `}</style>

      {/* ── Scrolling mosaic columns ── */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', gap: 2,
        opacity: visible ? (isPrivate ? 0.06 : 0.45) : 0,
        transition: 'opacity 2s ease .2s',
        filter: isPrivate ? 'blur(40px) saturate(.3)' : 'none',
      }}>
        {(() => {
          // Use 6 columns, fill each with shuffled images (no adjacent duplicates)
          const colCount = 6
          const allImgs = images.length > 0 ? images : []

          // Seeded shuffle to keep stable across re-renders
          const shuffle = (arr: typeof images, seed: number) => {
            const a = [...arr]
            for (let i = a.length - 1; i > 0; i--) {
              seed = (seed * 16807 + 0) % 2147483647
              const j = seed % (i + 1)
              ;[a[i], a[j]] = [a[j], a[i]]
            }
            return a
          }

          const columns = Array.from({ length: colCount }, (_, ci) => {
            const col: typeof images = []
            const shuffled = shuffle(allImgs, ci * 7919 + 1)
            const needed = Math.max(12, Math.ceil(allImgs.length / colCount) * 3)
            let lastId = ''
            for (let j = 0; col.length < needed; j++) {
              const img = shuffled[j % shuffled.length]
              // Skip if same as previous to avoid adjacent duplicates
              if (img.id !== lastId || allImgs.length <= 1) {
                col.push(img)
                lastId = img.id
              }
            }
            return col
          })
          return columns.map((col, ci) => {
            const doubled = [...col, ...col] // duplicate for seamless loop
            const speed = 40 + (ci % 3) * 15
            const dir = ci % 2 === 0 ? 'normal' : 'reverse'
            return (
              <div key={ci} style={{ flex: 1, overflow: 'hidden' }}>
                <div className="wc-col" style={{
                  animation: `wcScroll ${speed}s linear infinite`,
                  animationDirection: dir,
                }}>
                  {doubled.map((img, i) => (
                    <img
                      key={`${ci}-${i}`}
                      src={getUrl(img.thumbnail_path || img.storage_path)}
                      alt=""
                      onLoad={e => e.currentTarget.classList.add('wc-loaded')}
                    />
                  ))}
                </div>
              </div>
            )
          })
        })()}
      </div>

      {/* ── Overlay layers ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: isPrivate
          ? 'radial-gradient(ellipse at center, rgba(0,0,0,.55) 0%, rgba(0,0,0,.88) 100%)'
          : 'radial-gradient(ellipse at center, rgba(0,0,0,.35) 0%, rgba(0,0,0,.78) 100%)',
      }} />

      {/* Private mode: accent line */}
      {isPrivate && visible && (
        <div style={{
          position: 'absolute', top: '50%', width: '20%', height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(99,102,241,.35), transparent)',
          animation: 'wcLine 3.5s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      {/* ── Content: centered ── */}
      <div style={{
        position: 'relative', zIndex: 2, textAlign: 'center',
        padding: '0 24px', maxWidth: 680,
      }}>
        {/* Studio name */}
        {studioName && (
          <div style={{ animation: visible ? 'wcFadeUp .9s cubic-bezier(.16,1,.3,1) .3s both' : 'none' }}>
            {studioWebsite ? (
              <a href={studioWebsite.startsWith('http') ? studioWebsite : `https://${studioWebsite}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-block', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
                  color: 'rgba(255,255,255,.4)', margin: '0 0 20px', fontWeight: 500,
                  textDecoration: 'none', transition: 'color .2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,.8)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.4)' }}
                onClick={e => e.stopPropagation()}
              >{studioName}</a>
            ) : (
              <p style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', margin: '0 0 20px', fontWeight: 500 }}>
                {studioName}
              </p>
            )}
          </div>
        )}

        {/* Title */}
        <div style={{ animation: visible ? 'wcFadeUp 1s cubic-bezier(.16,1,.3,1) .5s both' : 'none' }}>
          <h1 style={{
            fontSize: 'clamp(32px, 7vw, 68px)', fontWeight: 700, color: '#fff',
            margin: 0, lineHeight: 1.08, letterSpacing: '-0.025em',
            textShadow: '0 2px 40px rgba(0,0,0,.5)',
          }}>{galleryTitle}</h1>
        </div>

        {/* Client name */}
        {clientName && (
          <div style={{ animation: visible ? 'wcFadeUp .9s cubic-bezier(.16,1,.3,1) .65s both' : 'none' }}>
            <p style={{
              fontSize: 'clamp(14px, 2vw, 19px)', color: 'rgba(255,255,255,.45)',
              margin: '10px 0 0', fontWeight: 400, letterSpacing: '0.01em',
            }}>{clientName}</p>
          </div>
        )}

        {/* Event meta */}
        {(eventDate || eventLocation) && (
          <div style={{ animation: visible ? 'wcFadeUp .8s cubic-bezier(.16,1,.3,1) .8s both' : 'none' }}>
            <p style={{
              fontSize: 12, color: 'rgba(255,255,255,.25)', margin: '10px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '0.03em',
            }}>
              {eventDate && <span>{eventDate}</span>}
              {eventDate && eventLocation && <span style={{ opacity: .3 }}>·</span>}
              {eventLocation && <span>{eventLocation}</span>}
            </p>
          </div>
        )}

        {galleryDescription && (
          <div style={{ animation: visible ? 'wcFadeUp .8s cubic-bezier(.16,1,.3,1) .85s both' : 'none' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.22)', margin: '8px auto 0', maxWidth: 420 }}>
              {galleryDescription}
            </p>
          </div>
        )}

        {/* Private mode notice */}
        {isPrivate && (
          <div style={{ animation: visible ? 'wcFadeUp .8s cubic-bezier(.16,1,.3,1) .9s both' : 'none', marginTop: 20 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 18px', borderRadius: 20,
              background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.12)',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,.55)" strokeWidth="1.8" style={{ animation: 'wcFloat 2.5s ease-in-out infinite' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', fontWeight: 400 }}>
                Privacy mode — take a selfie to see your photos
              </span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              marginTop: 10, opacity: .5,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.7)" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', letterSpacing: '.03em' }}>
                Your photos are protected and secure
              </span>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div style={{
          display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 32,
          animation: visible ? 'wcFadeUp .9s cubic-bezier(.16,1,.3,1) 1s both' : 'none',
        }}>
          {!isPrivate && (
            <button onClick={handleEnter} style={{
              padding: '15px 44px', borderRadius: 50, border: '1px solid rgba(255,255,255,.18)',
              background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(20px)',
              color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.01em', transition: 'all .3s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.16)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.35)'; e.currentTarget.style.transform = 'scale(1.03)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.18)'; e.currentTarget.style.transform = 'scale(1)' }}
            >View Gallery</button>
          )}

          {showFindButton && (
            <button onClick={onFindMyPhotos} style={{
              padding: isPrivate ? '16px 48px' : '15px 36px', borderRadius: 50, border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.01em', transition: 'all .3s',
              display: 'flex', alignItems: 'center', gap: 10,
              animation: isPrivate ? 'wcGlow 3s ease-in-out infinite' : 'none',
              position: 'relative', zIndex: 10,
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
              Find My Photos
            </button>
          )}
        </div>
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
// Three-column sticky bar: gallery section pills (left), the Stories toggle
// (center), and the download / select toolbar (right). Each slot is optional;
// the grid template keeps the layout balanced even when one slot is empty.
function SectionNav({
  sections,
  sectionCounts,
  totalCount,
  activeId,
  onJump,
  centerToolbar,
  toolbar,
}: {
  sections: GallerySection[]
  sectionCounts: Record<string, number>
  totalCount: number
  activeId: string
  onJump: (id: string) => void
  centerToolbar?: React.ReactNode
  toolbar?: React.ReactNode
}) {
  const hasSections = sections.length > 0
  return (
    <nav className="section-nav">
      <div className="section-nav__inner">
        <div className="section-nav__items">
          {hasSections && (
            <>
              <button
                className={`section-nav__item ${activeId === 'all-images' ? 'section-nav__item--active' : ''}`}
                onClick={() => onJump('all-images')}
              >
                <span className="section-nav__label">All Images</span>
                <span className="section-nav__count">{totalCount}</span>
              </button>
              {sections.map(sec => {
                const id = `section-${sec.id}`
                return (
                  <button
                    key={sec.id}
                    className={`section-nav__item ${activeId === id ? 'section-nav__item--active' : ''}`}
                    onClick={() => onJump(id)}
                  >
                    <span className="section-nav__label">{sec.name}</span>
                    <span className="section-nav__count">{sectionCounts[sec.id] ?? 0}</span>
                  </button>
                )
              })}
            </>
          )}
        </div>
        <div className="section-nav__center">{centerToolbar}</div>
        <div className="section-nav__toolbar">{toolbar}</div>
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
  const [viewerRole, setViewerRole] = useState<'none' | 'client' | 'guest'>('none')
  const [clientCodeInput, setClientCodeInput] = useState('')
  const [clientCodeError, setClientCodeError] = useState(false)
  const [hiddenImageIds, setHiddenImageIds] = useState<Set<string>>(new Set())
  // Stories are collapsed by default. The viewer surfaces them via a toggle
  // button in the section-nav toolbar so the gallery doesn't open with a big
  // stories block above the photos.
  const [storiesOpen, setStoriesOpen] = useState(false)
  // Face search: null = no search done; Set = matched IDs (always kept once found)
  const [faceMatchIds, setFaceMatchIds] = useState<Set<string> | null>(null)
  // Toggle: true = show only face matches, false = show all (but keep matches for toggling back)
  const [faceFilterActive, setFaceFilterActive] = useState(false)
  const [showFaceSearch, setShowFaceSearch] = useState(false)
  const [faceSelfieUrl, setFaceSelfieUrl] = useState<string | null>(null)
  // When the fullscreen viewer opens, it navigates through whichever list
  // the clicked tile belonged to (full gallery / face-match filter / section).
  // Snapshotting at click time means next/prev stays inside that subset and
  // doesn't break if the filter later changes.
  const [viewerList, setViewerList] = useState<GalleryImage[] | null>(null)

  // Device detection for download UX
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const isAndroid = /Android/i.test(navigator.userAgent)

  // Download progress tracking
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null)

  // Parse gallery ID from URL: /{slug}/gallery/{uuid} or /gallery/{uuid}
  const galleryId = (() => {
    const path = window.location.pathname.replace(/\/$/, '')
    const slugMatch = path.match(/^\/[^/]+\/gallery\/([^/]+)$/)
    if (slugMatch) return slugMatch[1]
    const directMatch = path.match(/^\/gallery\/([^/]+)$/)
    if (directMatch) return directMatch[1]
    return ''
  })()

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

  // Load hidden images for this gallery
  useEffect(() => {
    if (!gallery) return
    supabase
      .from('gallery_hidden_images')
      .select('image_id')
      .eq('gallery_id', gallery.id)
      .then(({ data }) => {
        if (data) setHiddenImageIds(new Set(data.map(r => r.image_id)))
      })
  }, [gallery?.id])

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

  // Resolve client selection settings (safe even when gallery is null)
  const rawSettings: Partial<DeliverySettings> = (gallery?.delivery_settings || {}) as Partial<DeliverySettings>
  const clientSelectionEnabled = rawSettings.clientSelectionEnabled ?? false
  const clientCode = rawSettings.clientCode ?? ''

  // Auto-skip role selection if client selection is not enabled,
  // or restore client role from session
  useEffect(() => {
    if (!gallery) return
    if (!clientSelectionEnabled) {
      setViewerRole('guest')
      return
    }
    const saved = sessionStorage.getItem(`client-role-${gallery.id}`)
    if (saved === 'client') setViewerRole('client')
  }, [gallery, clientSelectionEnabled])

  // Toggle hidden state for an image (client mode)
  const toggleHideImage = useCallback(async (imageId: string) => {
    if (!gallery) return
    const isHidden = hiddenImageIds.has(imageId)
    if (isHidden) {
      await supabase.from('gallery_hidden_images').delete()
        .eq('gallery_id', gallery.id).eq('image_id', imageId)
      setHiddenImageIds(prev => { const next = new Set(prev); next.delete(imageId); return next })
    } else {
      await supabase.from('gallery_hidden_images').insert({ gallery_id: gallery.id, image_id: imageId })
      setHiddenImageIds(prev => new Set(prev).add(imageId))
    }
  }, [gallery, hiddenImageIds])

  // Visible images: guests see only non-hidden, clients see all. Face search
  // filter is applied on top for guests only (clients always see the full set).
  const visibleImages = useMemo(() => {
    if (viewerRole === 'client') return images
    const base = images.filter(img => !hiddenImageIds.has(img.id))
    if (!faceMatchIds || !faceFilterActive) return base
    return base.filter(img => faceMatchIds.has(img.id))
  }, [images, hiddenImageIds, viewerRole, faceMatchIds, faceFilterActive])

  const faceSearchAvailable = gallery?.face_index_status === 'done'

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
  const facePrivacyMode = ((raw as Record<string, unknown>).facePrivacyMode as 'open' | 'private') || 'open'

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
  const welcomeImages = images.slice(0, 30)

  // ── Helpers ─────────────────────────────────────────────────────────────
  // Demo galleries store their images in the 'demo-uploads' bucket instead
  // of the regular 'gallery-images' bucket. Detect by checking demo_expires_at.
  const isDemoGallery = !!gallery?.demo_expires_at
  const imgBucket = isDemoGallery ? 'demo-uploads' : 'gallery-images'

  // Resolve cover image URL from settings
  const resolvedCoverUrl = (() => {
    const raw: Partial<DeliverySettings> = (gallery?.delivery_settings || {}) as Partial<DeliverySettings>
    // Custom uploaded cover image (full URL stored in settings)
    if (raw.coverImageUrl) return raw.coverImageUrl
    // Cover from gallery image by ID
    if (raw.coverImageId) {
      const coverId = raw.coverImageId
      const coverFilename = coverId.includes('/') ? coverId.split('/').pop() : coverId
      const coverImg = images.find(i => i.id === coverId || i.filename === coverId || i.filename === coverFilename)
      if (coverImg) return storageUrl(imgBucket, coverImg.storage_path)
    }
    return null
  })()

  if (showWelcome && images.length > 0) {
    return (
      <>
        <WelcomeScreen
          galleryTitle={galleryTitle}
          galleryDescription={rawSettings.galleryDescription || ''}
          eventDate={rawSettings.eventDate || ''}
          eventLocation={rawSettings.eventLocation || ''}
          clientName={clientName || ''}
          studioName={studioName}
          studioWebsite={studioWebsite}
          images={welcomeImages}
          coverImageUrl={resolvedCoverUrl}
          coverCrop={((gallery?.delivery_settings || {}) as Partial<DeliverySettings>).coverCrop}
          storageUrl={(path: string) => storageUrl(imgBucket, path)}
          onEnter={() => setShowWelcome(false)}
          faceSearchAvailable={faceSearchAvailable}
          facePrivacyMode={faceSearchAvailable ? facePrivacyMode : null}
          onFindMyPhotos={() => setShowFaceSearch(true)}
        />
        {/* Face search experience — full-screen flow with camera, thinking, results */}
        {showFaceSearch && gallery && (
          <FaceSearchExperience
            galleryId={gallery.id}
            backgroundImages={images.slice(0, 6)}
            storageUrl={(path: string) => storageUrl(imgBucket, path)}
            privacyMode={facePrivacyMode}
            onClose={() => setShowFaceSearch(false)}
            onSelfieCapture={(url) => setFaceSelfieUrl(url)}
            onMatches={(ids) => {
              setFaceMatchIds(new Set(ids))
              setFaceFilterActive(true)
              setShowFaceSearch(false)
              if (ids.length > 0) setShowWelcome(false)
            }}
            onBrowseAll={() => {
              setShowFaceSearch(false)
              setShowWelcome(false)
            }}
          />
        )}
      </>
    )
  }

  // ── Role selection (Client / Guest) ─────────────────────────────────────
  if (clientSelectionEnabled && viewerRole === 'none') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 999, background: '#0a0a0c',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        {studioName && (
          <p style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', marginBottom: 8 }}>
            {studioName}
          </p>
        )}
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{galleryTitle}</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.4)', margin: '0 0 36px' }}>How would you like to view this gallery?</p>

        <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
          <button
            onClick={() => setViewerRole('guest')}
            style={{
              padding: '14px 36px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)',
              color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
          >
            Guest
          </button>
          <button
            onClick={() => {
              // Show code input
              const el = document.getElementById('client-code-section')
              if (el) el.style.display = 'block'
            }}
            style={{
              padding: '14px 36px', borderRadius: 10,
              border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all .2s',
              boxShadow: '0 4px 20px rgba(99,102,241,.3)',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            I'm the Client
          </button>
        </div>

        {/* Client code input */}
        <div id="client-code-section" style={{ display: 'none', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 10 }}>Enter your client code</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={clientCodeInput}
              onChange={e => { setClientCodeInput(e.target.value.toUpperCase()); setClientCodeError(false) }}
              placeholder="CODE"
              style={{
                padding: '10px 14px', fontSize: 14, fontFamily: 'inherit',
                color: '#fff', background: 'rgba(255,255,255,.06)',
                border: clientCodeError ? '1px solid #ef4444' : '1px solid rgba(255,255,255,.15)',
                borderRadius: 8, outline: 'none', letterSpacing: '0.1em',
                width: 160, textAlign: 'center',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (clientCodeInput === clientCode) {
                    setViewerRole('client')
                    sessionStorage.setItem(`client-role-${gallery.id}`, 'client')
                  } else {
                    setClientCodeError(true)
                  }
                }
              }}
              autoFocus
            />
            <button
              onClick={() => {
                if (clientCodeInput === clientCode) {
                  setViewerRole('client')
                  sessionStorage.setItem(`client-role-${gallery.id}`, 'client')
                } else {
                  setClientCodeError(true)
                }
              }}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Enter
            </button>
          </div>
          {clientCodeError && (
            <p style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>Invalid code</p>
          )}
        </div>
      </div>
    )
  }

  function thumbUrl(img: GalleryImage) {
    return storageUrl(imgBucket, img.thumbnail_path || img.storage_path)
  }

  function webUrl(img: GalleryImage) {
    return storageUrl(imgBucket, img.storage_path)
  }

  function originalUrl(img: GalleryImage) {
    if (img.original_path) {
      return storageUrl(imgBucket, img.original_path)
    }
    return storageUrl(imgBucket, img.storage_path)
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
    // On mobile with Web Share API: fetch all files and share in ONE share sheet.
    // The user picks "Save X Images" and all photos go to the camera roll together.
    if (isMobile && navigator.share) {
      setDlProgress(`Preparing ${imgs.length} photos...`)
      setDownloadProgress({ current: 0, total: imgs.length })
      try {
        const files: File[] = []
        for (let i = 0; i < imgs.length; i++) {
          setDlProgress(`Loading ${i + 1} / ${imgs.length}...`)
          setDownloadProgress({ current: i + 1, total: imgs.length })
          try {
            const res = await fetch(downloadUrl(imgs[i]))
            const blob = await res.blob()
            files.push(new File([blob], imgs[i].filename, { type: blob.type || 'image/jpeg' }))
          } catch { /* skip failed image */ }
        }
        if (files.length > 0) {
          setDlProgress(null)
          setDownloadProgress(null)
          // Web Share API with multiple files — native OS share sheet opens with
          // "Save to Photos" option that saves all at once.
          if (navigator.canShare && navigator.canShare({ files })) {
            await navigator.share({ files })
            return
          }
        }
      } catch {
        // User cancelled or share failed — fall through to sequential downloads
      } finally {
        setDlProgress(null)
        setDownloadProgress(null)
      }
    }

    // Desktop (or mobile fallback): sequential downloads
    setDlProgress(`Downloading ${imgs.length} photos...`)
    setDownloadProgress({ current: 0, total: imgs.length })
    for (let i = 0; i < imgs.length; i++) {
      setDlProgress(`Downloading ${i + 1} / ${imgs.length}...`)
      setDownloadProgress({ current: i + 1, total: imgs.length })
      handleDownload(downloadUrl(imgs[i]), imgs[i].filename)
      if (imgs.length > 1) await new Promise(r => setTimeout(r, 300))
    }
    setDlProgress(null)
    setDownloadProgress(null)
  }

  // ── Cover image ─────────────────────────────────────────────────────────
  const coverImage = coverImageId ? images.find(img => img.id === coverImageId) : null
  const coverUrl = coverImage ? storageUrl(imgBucket, coverImage.storage_path) : null

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

  // Hero background image: prefer the photographer's chosen cover; otherwise
  // fall back to the first photo of the gallery (heavily blurred + dimmed)
  // so the page never opens as a flat black rectangle.
  const heroFallbackImage = images[0]
  const heroBgUrl = coverUrl
    || (heroFallbackImage ? webUrl(heroFallbackImage) : null)
  const hasCustomCover = !!coverUrl

  return (
    <>
      {/* Hero */}
      <header className={`hero ${heroBgUrl ? 'hero--has-bg' : ''} ${hasCustomCover ? 'hero--cover' : 'hero--blurred'}`}>
        {heroBgUrl && (
          <div
            className="hero__bg"
            style={{ backgroundImage: `url(${heroBgUrl})` }}
            aria-hidden="true"
          />
        )}
        {heroBgUrl && <div className="hero__overlay" />}
        <div className="hero__content">
          {faceMatchIds && faceSelfieUrl ? (
            /* ── Personalized hero after face search ── */
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', overflow: 'hidden',
                border: '2.5px solid rgba(255,255,255,.18)',
                marginBottom: 16,
                boxShadow: '0 4px 20px rgba(0,0,0,.3), 0 0 0 4px rgba(99,102,241,.12)',
              }}>
                <img src={faceSelfieUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>

              {studioName && (
                <p className="hero__eyebrow">{studioName}</p>
              )}
              <h1 className="hero__title" style={{ fontSize: 'clamp(24px, 4vw, 44px)' }}>{galleryTitle}</h1>

              {/* Secured badge for face-search hero */}
              {facePrivacyMode === 'private' && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 999, margin: '8px 0 4px',
                  background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.10)',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.65)" strokeWidth="2.2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: 'rgba(34,197,94,.6)' }}>
                    Your photos are protected
                  </span>
                </div>
              )}

              {/* ── Segmented toggle: Your Photos / All Photos ── */}
              <div style={{
                marginTop: 16,
                display: 'inline-flex',
                borderRadius: 999, padding: 3,
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.07)',
                backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              }}>
                <button
                  onClick={() => setFaceFilterActive(true)}
                  style={{
                    padding: '8px 18px', borderRadius: 999,
                    border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    letterSpacing: '.01em', whiteSpace: 'nowrap',
                    transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                    background: faceFilterActive ? 'rgba(99,102,241,.25)' : 'transparent',
                    color: faceFilterActive ? '#fff' : 'rgba(255,255,255,.4)',
                    boxShadow: faceFilterActive ? '0 1px 6px rgba(99,102,241,.2)' : 'none',
                  }}
                >
                  Your Photos · {faceMatchIds.size}
                </button>
                <button
                  onClick={() => setFaceFilterActive(false)}
                  style={{
                    padding: '8px 18px', borderRadius: 999,
                    border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    letterSpacing: '.01em', whiteSpace: 'nowrap',
                    transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                    background: !faceFilterActive ? 'rgba(255,255,255,.12)' : 'transparent',
                    color: !faceFilterActive ? '#fff' : 'rgba(255,255,255,.4)',
                    boxShadow: !faceFilterActive ? '0 1px 4px rgba(0,0,0,.2)' : 'none',
                  }}
                >
                  All Photos · {images.length}
                </button>
              </div>
            </>
          ) : (
            /* ── Default hero ── */
            <>
              {studioName && (
                <p className="hero__eyebrow">{studioName}</p>
              )}
              <h1 className="hero__title">{galleryTitle}</h1>
              {clientName && (
                <p className="hero__sub">{clientName}</p>
              )}
              <div className="hero__meta">
                <span className="hero__count">{images.length} {images.length === 1 ? 'photo' : 'photos'}</span>
                {(accessType === 'password' || facePrivacyMode === 'private') && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 999, marginLeft: 8,
                    background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.10)',
                    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' as const,
                    color: 'rgba(34,197,94,.7)',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Secured
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Unified sticky bar: section pills (left) + download/select toolbar (right) */}
      {(sections.length > 0 || downloadsEnabled || showStoriesSection || faceSearchAvailable) && (
        <SectionNav
          sections={sections.filter(sec => images.some(im => im.section_id === sec.id))}
          sectionCounts={sections.reduce<Record<string, number>>((acc, sec) => {
            acc[sec.id] = images.filter(im => im.section_id === sec.id).length
            return acc
          }, {})}
          totalCount={images.length}
          activeId={activeSectionAnchor}
          onJump={(id) => {
            const el = document.getElementById(id)
            if (!el) return
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            history.replaceState(null, '', '#' + id)
          }}
          centerToolbar={showStoriesSection ? (
            <button
              className={`gallery-toolbar__btn ${storiesOpen ? 'gallery-toolbar__btn--active' : ''}`}
              onClick={() => setStoriesOpen(v => !v)}
              aria-expanded={storiesOpen}
              aria-controls="gallery-stories"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Stories
              <span className="gallery-toolbar__count">{stories.length}</span>
            </button>
          ) : null}
          toolbar={(faceSearchAvailable || downloadsEnabled) ? (
            <>
              {faceSearchAvailable && !selectMode && !faceMatchIds && (
                <button
                  className="gallery-toolbar__btn"
                  onClick={() => setShowFaceSearch(true)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="8" r="3" />
                    <path d="M5.5 20a7 7 0 0 1 13 0" />
                  </svg>
                  Find my photos
                </button>
              )}
              {downloadsEnabled && <button
                className={`gallery-toolbar__btn ${selectMode ? 'gallery-toolbar__btn--active' : ''}`}
                onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
              >
                {selectMode ? `${selectedIds.size} selected` : 'Select'}
              </button>}
              {selectMode && selectedIds.size > 0 && (
                <button
                  className="gallery-toolbar__btn gallery-toolbar__btn--primary"
                  onClick={() => {
                    handleBatchDownload(images.filter(img => selectedIds.has(img.id)))
                    setSelectMode(false); setSelectedIds(new Set())
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {isMobile ? 'Save' : 'Download'} {selectedIds.size}
                </button>
              )}
              {downloadsEnabled && !selectMode && (
                <button
                  className="gallery-toolbar__btn"
                  onClick={() => handleBatchDownload(images)}
                  disabled={!!dlProgress}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {dlProgress || (isMobile ? 'Save All' : 'Download all')}
                </button>
              )}
              {selectMode && (
                <button
                  className="gallery-toolbar__btn gallery-toolbar__btn--ghost"
                  onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}
                >Cancel</button>
              )}
            </>
          ) : null}
        />
      )}

      {/* Stories — collapsible. Hidden by default; opened from the toolbar. */}
      {showStoriesSection && storiesOpen && (
        <section id="gallery-stories" className="stories">
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

      {/* All Images section — heading suppressed because the sticky nav
          already labels and counts it. */}
      <section id="all-images" className="gallery-section gallery-section--all">
        {(() => {
          const mainGridImages = viewerRole === 'client' ? images : visibleImages
          return (
        <MasonryGrid
          images={mainGridImages}
          thumbUrl={thumbUrl}
          layoutMode={layoutMode}
          imageSpacing={imageSpacing}
          cornerStyle={cornerStyle}
          onImageClick={(idx) => {
            setViewerList(mainGridImages)
            setViewerIndex(idx)
          }}
          onDownload={downloadsEnabled ? (img) => handleDownload(downloadUrl(img), img.filename) : undefined}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={(id) => setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
          })}
          clientMode={viewerRole === 'client'}
          hiddenIds={hiddenImageIds}
          onToggleHide={viewerRole === 'client' ? toggleHideImage : undefined}
        />
          )
        })()}
      </section>

      {sections.length > 0 && sections.map(sec => {
        const sectionImages = visibleImages.filter(img => img.section_id === sec.id)
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
                // Scope the fullscreen viewer to this section — next/prev
                // stays within the section the user clicked into.
                setViewerList(sectionImages)
                setViewerIndex(idx)
              }}
              onDownload={downloadsEnabled ? (img) => handleDownload(downloadUrl(img), img.filename) : undefined}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={(id) => setSelectedIds(prev => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id); else next.add(id)
                return next
              })}
              clientMode={viewerRole === 'client'}
              hiddenIds={hiddenImageIds}
              onToggleHide={viewerRole === 'client' ? toggleHideImage : undefined}
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

      {/* Fullscreen viewer — uses whichever list the clicked tile was in,
          so next/prev navigation stays within that subset (face-match
          results stay filtered; section clicks stay inside the section). */}
      {viewerIndex !== null && (
        <Viewer
          images={viewerList ?? images}
          index={viewerIndex}
          webUrl={webUrl}
          downloadUrl={downloadUrl}
          allowDownloads={downloadsEnabled}
          downloadLabel={downloadLabel}
          onClose={() => { setViewerIndex(null); setViewerList(null) }}
          onNavigate={setViewerIndex}
          onDownload={handleDownload}
        />
      )}

      {/* Face search — full-screen experience with camera, thinking, results */}
      {showFaceSearch && gallery && (
        <FaceSearchExperience
          galleryId={gallery.id}
          backgroundImages={images.slice(0, 6)}
          storageUrl={(path: string) => storageUrl(imgBucket, path)}
          privacyMode={facePrivacyMode}
          onClose={() => setShowFaceSearch(false)}
          onSelfieCapture={(url) => setFaceSelfieUrl(url)}
          onMatches={(ids) => {
            setFaceMatchIds(new Set(ids))
            setFaceFilterActive(true)
            setShowFaceSearch(false)
            if (showWelcome && ids.length > 0) setShowWelcome(false)
          }}
          onBrowseAll={() => {
            setShowFaceSearch(false)
            if (showWelcome) setShowWelcome(false)
          }}
        />
      )}

      {/* ── Download progress overlay ── */}
      {downloadProgress && (
        <div style={{
          position: 'fixed', bottom: isMobile ? 80 : 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 900, padding: '12px 24px', borderRadius: 14,
          background: 'rgba(10,10,15,.92)', border: '1px solid rgba(255,255,255,.1)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8,
          minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,.4)',
          animation: 'fadeIn .25s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <div className="loader" style={{ width: 16, height: 16, borderWidth: 2 }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', fontWeight: 500, flex: 1 }}>
              {dlProgress}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round((downloadProgress.current / downloadProgress.total) * 100)}%
            </span>
          </div>
          {/* Progress bar */}
          <div style={{
            width: '100%', height: 3, borderRadius: 2,
            background: 'rgba(255,255,255,.08)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: 'linear-gradient(90deg, rgba(99,102,241,.8), rgba(139,92,246,.8))',
              width: `${(downloadProgress.current / downloadProgress.total) * 100}%`,
              transition: 'width .3s ease',
            }} />
          </div>
        </div>
      )}

      {/* ── Floating mobile download bar ── */}
      {isMobile && downloadsEnabled && !selectMode && viewerIndex === null && !showFaceSearch && !downloadProgress && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 800,
          padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          background: 'rgba(10,10,15,.92)',
          borderTop: '1px solid rgba(255,255,255,.06)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'fadeIn .3s ease',
        }}>
          {/* Device-specific hint */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', margin: 0, lineHeight: 1.4 }}>
              {isIOS
                ? 'Tap to share \u2192 Save to Photos'
                : 'Tap to save photos to your device'}
            </p>
          </div>

          {/* Save All button */}
          <button
            onClick={() => handleBatchDownload(faceFilterActive && faceMatchIds ? visibleImages : images)}
            disabled={!!dlProgress}
            style={{
              padding: '10px 22px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, rgba(99,102,241,.9), rgba(139,92,246,.9))',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: '0 2px 12px rgba(99,102,241,.25)',
              whiteSpace: 'nowrap' as const, flexShrink: 0,
              transition: 'all .2s ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {isIOS ? 'Save All' : 'Download All'}
          </button>
        </div>
      )}
    </>
  )
}
